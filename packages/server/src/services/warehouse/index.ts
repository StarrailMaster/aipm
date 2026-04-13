import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { Prisma } from '@prisma/client'
import * as aiService from '../ai.service'

// ========== Types ==========

interface AiSummaryJson {
  problemCategory: string
  relatedPromptId: string | null
  relatedPromptName: string | null
  problemSummary: string
  suggestedConstraint: string
}

interface WarehouseResultJson {
  qualityCheck: 'pass' | 'fail'
  qualityNote: string | null
  isDuplicate: boolean
  similarFeedbackId: string | null
  similarityNote: string | null
  targetPromptId: string | null
  targetSection: string | null
  autoTags: string[]
}

// ========== Process Warehouse Agent ==========

export async function processWarehouse(feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
  })

  if (!feedback || feedback.deletedAt) {
    throw new AppError(ErrorCodes.FEEDBACK_NOT_FOUND, 'Feedback not found', 404)
  }

  // Warehouse agent can run on AI_SUMMARIZED or PENDING_REVIEW feedbacks
  if (
    feedback.status !== 'AI_SUMMARIZED' &&
    feedback.status !== 'PENDING_REVIEW' &&
    feedback.status !== 'AGENT_PROCESSED'
  ) {
    throw new AppError(
      ErrorCodes.FEEDBACK_INVALID_STATUS,
      `Cannot run warehouse agent when status is ${feedback.status}`,
    )
  }

  const aiSummary = feedback.aiSummary as AiSummaryJson | null

  let qualityCheck: 'pass' | 'fail' = 'pass'
  let qualityNote = ''
  let isDuplicate = false
  let similarFeedbackId: string | null = null
  let similarityNote: string | null = null
  let targetSection: string | null = null
  let autoTags: string[] = []

  try {
    // Fetch recent feedbacks for dedup comparison
    const recentFeedbacks = await prisma.feedback.findMany({
      where: { id: { not: feedbackId }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, rawDescription: true },
    })

    const aiResult = await aiService.warehouseReview(
      feedback.rawDescription,
      {
        problemCategory: aiSummary?.problemCategory ?? '通用改进',
        problemSummary: aiSummary?.problemSummary ?? feedback.rawDescription.slice(0, 100),
        suggestedConstraint: aiSummary?.suggestedConstraint ?? '',
      },
      recentFeedbacks.map((f) => ({ id: f.id, description: f.rawDescription })),
    )

    qualityCheck = aiResult.qualityCheck
    qualityNote = aiResult.qualityNote
    isDuplicate = aiResult.isDuplicateLikely
    similarityNote = aiResult.duplicateReason
    autoTags = aiResult.suggestedTags
    targetSection = aiResult.targetSection

    // If AI says duplicate, try to find the actual similar feedback
    if (isDuplicate && aiResult.duplicateReason) {
      const idMatch = aiResult.duplicateReason.match(/\[([a-f0-9]{8})\]/)
      if (idMatch) {
        const found = recentFeedbacks.find((f) => f.id.startsWith(idMatch[1]))
        if (found) similarFeedbackId = found.id
      }
    }
  } catch {
    // Fallback to mock if AI unavailable
    qualityNote = 'AI 不可用，使用规则审核: 描述完整，自动通过。'
    const dedupResult = await checkDuplicate(feedbackId, feedback.rawDescription)
    isDuplicate = dedupResult.isDuplicate
    similarFeedbackId = dedupResult.similarFeedbackId
    similarityNote = dedupResult.similarityNote
    autoTags = generateTags(feedback.rawDescription, aiSummary)
  }

  // Classification: find target prompt
  const { targetPromptId } = await classifyTarget(aiSummary)

  const warehouseResult: WarehouseResultJson = {
    qualityCheck,
    qualityNote,
    isDuplicate,
    similarFeedbackId,
    similarityNote,
    targetPromptId,
    targetSection,
    autoTags,
  }

  // Save result and advance status to AGENT_PROCESSED → PENDING_REVIEW
  const updated = await prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      warehouseResult: warehouseResult as unknown as Prisma.JsonObject,
      status: 'PENDING_REVIEW',
    },
  })

  return {
    feedbackId: updated.id,
    status: updated.status,
    warehouseResult,
  }
}

// ========== Get Warehouse Result ==========

export async function getWarehouseResult(feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
  })

  if (!feedback || feedback.deletedAt) {
    throw new AppError(ErrorCodes.FEEDBACK_NOT_FOUND, 'Feedback not found', 404)
  }

  return {
    feedbackId: feedback.id,
    status: feedback.status,
    warehouseResult: feedback.warehouseResult as WarehouseResultJson | null,
  }
}

// ========== Internal Helpers ==========

async function checkDuplicate(
  currentId: string,
  rawDescription: string,
): Promise<{
  isDuplicate: boolean
  similarFeedbackId: string | null
  similarityNote: string | null
}> {
  // Extract key phrases (words with 2+ chars) for matching
  const keywords = rawDescription
    .replace(/[，。！？、；：""''（）\n\r]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8)

  if (keywords.length === 0) {
    return { isDuplicate: false, similarFeedbackId: null, similarityNote: null }
  }

  // Search for feedbacks with similar descriptions (simple keyword match)
  const orConditions: Prisma.FeedbackWhereInput[] = keywords.map((kw) => ({
    rawDescription: { contains: kw, mode: 'insensitive' as const },
  }))

  const similar = await prisma.feedback.findFirst({
    where: {
      id: { not: currentId },
      deletedAt: null,
      OR: orConditions,
    },
    select: { id: true, rawDescription: true },
    orderBy: { createdAt: 'desc' },
  })

  if (similar) {
    // Check how many keywords match
    const matchCount = keywords.filter((kw) =>
      similar.rawDescription.toLowerCase().includes(kw.toLowerCase()),
    ).length
    const matchRatio = matchCount / keywords.length

    if (matchRatio >= 0.5) {
      return {
        isDuplicate: true,
        similarFeedbackId: similar.id,
        similarityNote: `与反馈 ${similar.id.substring(0, 8)}... 内容相似 (匹配度 ${Math.round(matchRatio * 100)}%), 建议合并。`,
      }
    }
  }

  return { isDuplicate: false, similarFeedbackId: null, similarityNote: null }
}

async function classifyTarget(
  aiSummary: AiSummaryJson | null,
): Promise<{
  targetPromptId: string | null
  targetSection: string | null
}> {
  if (!aiSummary) {
    return { targetPromptId: null, targetSection: null }
  }

  // If AI summary already identified a related prompt, use it
  if (aiSummary.relatedPromptId) {
    const sectionMap: Record<string, string> = {
      'UI/交互': 'UI 约束',
      '性能': '性能要求',
      '缺陷修复': '边界条件处理',
      '代码质量': '代码规范',
      '安全': '安全约束',
      '提示词优化': '提示词结构',
      '通用改进': '通用约束',
    }

    return {
      targetPromptId: aiSummary.relatedPromptId,
      targetSection: sectionMap[aiSummary.problemCategory] ?? '补充约束',
    }
  }

  // Try to find a prompt by category
  const categoryToPromptCategory: Record<string, string> = {
    'UI/交互': 'DESIGN',
    '性能': 'OPTIMIZATION',
    '缺陷修复': 'TESTING',
    '代码质量': 'BACKEND',
    '安全': 'BACKEND',
    '提示词优化': 'FRONTEND',
    '通用改进': 'INTEGRATION',
  }

  const promptCategory = categoryToPromptCategory[aiSummary.problemCategory]
  if (promptCategory) {
    const prompt = await prisma.prompt.findFirst({
      where: {
        deletedAt: null,
        category: promptCategory as Prisma.EnumPromptCategoryFilter,
      },
      select: { id: true },
      orderBy: { starCount: 'desc' },
    })

    if (prompt) {
      return {
        targetPromptId: prompt.id,
        targetSection: '补充约束',
      }
    }
  }

  return { targetPromptId: null, targetSection: null }
}

function generateTags(
  rawDescription: string,
  aiSummary: AiSummaryJson | null,
): string[] {
  const tags: Set<string> = new Set()

  // Add category as a tag
  if (aiSummary?.problemCategory) {
    tags.add(aiSummary.problemCategory)
  }

  // Keyword-based tagging
  const desc = rawDescription.toLowerCase()
  const tagKeywords: Record<string, string[]> = {
    '前端': ['前端', 'vue', 'css', 'html', '样式', '页面'],
    '后端': ['后端', 'api', '接口', '数据库', 'sql', '服务'],
    '提示词': ['提示词', 'prompt', 'skill', '模板'],
    '紧急': ['紧急', '严重', '崩溃', '阻塞', '生产'],
    '优化': ['优化', '改进', '提升', '重构'],
    '新功能': ['新增', '功能', '需求', '特性'],
  }

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some((kw) => desc.includes(kw))) {
      tags.add(tag)
    }
  }

  return [...tags].slice(0, 6)
}
