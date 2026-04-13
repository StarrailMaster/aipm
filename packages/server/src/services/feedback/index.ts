import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { Prisma, Feedback as PrismaFeedback } from '@prisma/client'
import * as aiService from '../ai.service'

// ========== Helpers ==========

interface UserBriefRow {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

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

async function getUserBrief(userId: string): Promise<UserBriefRow> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  if (!user) {
    return { id: userId, name: 'Unknown', email: '', role: 'DESIGNER', avatar: null, legacyRoles: [] }
  }
  return user
}

function toFeedbackResponse(
  feedback: PrismaFeedback,
  submittedBy: UserBriefRow,
  reviewedBy: UserBriefRow | null,
) {
  return {
    id: feedback.id,
    rawDescription: feedback.rawDescription,
    attachments: feedback.attachments,
    aiSummary: feedback.aiSummary as AiSummaryJson | null,
    warehouseResult: feedback.warehouseResult as WarehouseResultJson | null,
    status: feedback.status,
    reviewedBy,
    reviewComment: feedback.reviewComment,
    iterationId: feedback.iterationId,
    feedPackageId: feedback.feedPackageId,
    submittedBy,
    createdAt: feedback.createdAt.getTime(),
    updatedAt: feedback.updatedAt.getTime(),
  }
}

// ========== Submit Feedback ==========

export async function submitFeedback(
  userId: string,
  data: {
    rawDescription: string
    attachments?: string[]
    iterationId?: string
    feedPackageId?: string
  },
) {
  const feedback = await prisma.feedback.create({
    data: {
      rawDescription: data.rawDescription,
      attachments: data.attachments ?? [],
      iterationId: data.iterationId ?? null,
      feedPackageId: data.feedPackageId ?? null,
      submittedById: userId,
    },
  })

  const submittedBy = await getUserBrief(userId)
  return toFeedbackResponse(feedback, submittedBy, null)
}

// ========== List Feedbacks ==========

export async function listFeedbacks(query: {
  page: number
  pageSize: number
  skip: number
  status?: string
  promptId?: string
  submittedBy?: string
}) {
  const where: Prisma.FeedbackWhereInput = {
    deletedAt: null,
  }

  if (query.status) {
    where.status = query.status as Prisma.EnumFeedbackStatusFilter
  }

  if (query.submittedBy) {
    where.submittedById = query.submittedBy
  }

  // promptId filter: search feedbacks whose aiSummary contains the promptId
  if (query.promptId) {
    where.aiSummary = {
      path: ['relatedPromptId'],
      equals: query.promptId,
    }
  }

  const [items, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.pageSize,
    }),
    prisma.feedback.count({ where }),
  ])

  // Get all unique user IDs
  const userIds = [...new Set([
    ...items.map((i) => i.submittedById),
    ...items.filter((i) => i.reviewedById).map((i) => i.reviewedById!),
  ])]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const responseItems = items.map((item) => {
    const submittedBy = userMap.get(item.submittedById) ?? {
      id: item.submittedById,
      name: 'Unknown',
      email: '',
      role: 'DESIGNER' as const,
      avatar: null,
      legacyRoles: [],
    }
    const reviewedBy = item.reviewedById
      ? userMap.get(item.reviewedById) ?? null
      : null
    return toFeedbackResponse(item, submittedBy, reviewedBy)
  })

  return { items: responseItems, total }
}

// ========== Get Feedback Detail ==========

export async function getFeedbackDetail(id: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { id },
  })

  if (!feedback || feedback.deletedAt) {
    throw new AppError(ErrorCodes.FEEDBACK_NOT_FOUND, 'Feedback not found', 404)
  }

  const submittedBy = await getUserBrief(feedback.submittedById)
  const reviewedBy = feedback.reviewedById
    ? await getUserBrief(feedback.reviewedById)
    : null

  return toFeedbackResponse(feedback, submittedBy, reviewedBy)
}

// ========== Trigger AI Summary (Mock) ==========

export async function triggerAiSummary(feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
  })

  if (!feedback || feedback.deletedAt) {
    throw new AppError(ErrorCodes.FEEDBACK_NOT_FOUND, 'Feedback not found', 404)
  }

  if (feedback.status !== 'SUBMITTED') {
    throw new AppError(
      ErrorCodes.FEEDBACK_INVALID_STATUS,
      `Cannot trigger AI summary when status is ${feedback.status}`,
    )
  }

  const desc = feedback.rawDescription

  // Try real AI, fallback to mock
  let category: string
  let summary: string
  let constraint: string
  let promptKeywords: string[] = []

  try {
    const aiResult = await aiService.generateAiSummary(desc)
    category = aiResult.problemCategory
    summary = aiResult.problemSummary
    constraint = aiResult.suggestedConstraint
    promptKeywords = aiResult.relatedPromptKeywords
  } catch {
    // Fallback to mock if AI unavailable
    category = detectCategory(desc)
    summary = desc.length > 100 ? desc.substring(0, 100) + '...' : desc
    constraint = generateConstraint(category)
  }

  const aiSummary: AiSummaryJson = {
    problemCategory: category,
    relatedPromptId: null,
    relatedPromptName: null,
    problemSummary: summary,
    suggestedConstraint: constraint,
  }

  // Find related prompt: use AI keywords first, then fallback to basic matching
  let promptMatch: { id: string; name: string } | null = null
  if (promptKeywords.length > 0) {
    for (const kw of promptKeywords) {
      const found = await prisma.prompt.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: kw, mode: 'insensitive' } },
            { description: { contains: kw, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true },
      })
      if (found) { promptMatch = found; break }
    }
  }
  if (!promptMatch) {
    promptMatch = await findRelatedPrompt(desc, category)
  }
  if (promptMatch) {
    aiSummary.relatedPromptId = promptMatch.id
    aiSummary.relatedPromptName = promptMatch.name
  }

  const updated = await prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      aiSummary: aiSummary as unknown as Prisma.JsonObject,
      status: 'AI_SUMMARIZED',
    },
  })

  const submittedBy = await getUserBrief(updated.submittedById)
  const reviewedBy = updated.reviewedById ? await getUserBrief(updated.reviewedById) : null
  return toFeedbackResponse(updated, submittedBy, reviewedBy)
}

// ========== Confirm AI Summary ==========

export async function confirmAiSummary(
  feedbackId: string,
  overrides: {
    problemCategory?: string
    relatedPromptId?: string
    problemSummary?: string
    suggestedConstraint?: string
  },
) {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
  })

  if (!feedback || feedback.deletedAt) {
    throw new AppError(ErrorCodes.FEEDBACK_NOT_FOUND, 'Feedback not found', 404)
  }

  if (feedback.status !== 'AI_SUMMARIZED') {
    throw new AppError(
      ErrorCodes.FEEDBACK_INVALID_STATUS,
      `Cannot confirm AI summary when status is ${feedback.status}`,
    )
  }

  const currentSummary = feedback.aiSummary as AiSummaryJson | null
  if (!currentSummary) {
    throw new AppError(ErrorCodes.FEEDBACK_INVALID_STATUS, 'No AI summary to confirm')
  }

  // Apply overrides
  const updatedSummary: AiSummaryJson = {
    ...currentSummary,
  }
  if (overrides.problemCategory !== undefined) {
    updatedSummary.problemCategory = overrides.problemCategory
  }
  if (overrides.relatedPromptId !== undefined) {
    updatedSummary.relatedPromptId = overrides.relatedPromptId
    // Look up prompt name
    if (overrides.relatedPromptId) {
      const prompt = await prisma.prompt.findUnique({
        where: { id: overrides.relatedPromptId },
        select: { name: true },
      })
      updatedSummary.relatedPromptName = prompt?.name ?? null
    } else {
      updatedSummary.relatedPromptName = null
    }
  }
  if (overrides.problemSummary !== undefined) {
    updatedSummary.problemSummary = overrides.problemSummary
  }
  if (overrides.suggestedConstraint !== undefined) {
    updatedSummary.suggestedConstraint = overrides.suggestedConstraint
  }

  const updated = await prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      aiSummary: updatedSummary as unknown as Prisma.JsonObject,
      // Stay at AI_SUMMARIZED — warehouse agent will advance to AGENT_PROCESSED
      status: 'AI_SUMMARIZED',
    },
  })

  const submittedBy = await getUserBrief(updated.submittedById)
  const reviewedBy = updated.reviewedById ? await getUserBrief(updated.reviewedById) : null
  return toFeedbackResponse(updated, submittedBy, reviewedBy)
}

// ========== Review Feedback ==========

export async function reviewFeedback(
  feedbackId: string,
  userId: string,
  action: 'merge' | 'reject',
  comment?: string,
) {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
  })

  if (!feedback || feedback.deletedAt) {
    throw new AppError(ErrorCodes.FEEDBACK_NOT_FOUND, 'Feedback not found', 404)
  }

  if (feedback.status === 'MERGED' || feedback.status === 'REJECTED') {
    throw new AppError(
      ErrorCodes.FEEDBACK_ALREADY_REVIEWED,
      'Feedback has already been reviewed',
    )
  }

  if (feedback.status !== 'PENDING_REVIEW' && feedback.status !== 'AGENT_PROCESSED') {
    throw new AppError(
      ErrorCodes.FEEDBACK_INVALID_STATUS,
      `Cannot review feedback when status is ${feedback.status}`,
    )
  }

  const newStatus = action === 'merge' ? 'MERGED' : 'REJECTED'

  const updated = await prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      status: newStatus,
      reviewedById: userId,
      reviewComment: comment ?? null,
    },
  })

  const submittedBy = await getUserBrief(updated.submittedById)
  const reviewedBy = await getUserBrief(userId)
  return toFeedbackResponse(updated, submittedBy, reviewedBy)
}

// ========== Delete Feedback (soft) ==========

export async function deleteFeedback(id: string) {
  const existing = await prisma.feedback.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.FEEDBACK_NOT_FOUND, 'Feedback not found', 404)
  }

  await prisma.feedback.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ========== Internal Helpers ==========

function detectCategory(description: string): string {
  const desc = description.toLowerCase()
  if (desc.includes('ui') || desc.includes('界面') || desc.includes('样式') || desc.includes('布局') || desc.includes('显示')) {
    return 'UI/交互'
  }
  if (desc.includes('性能') || desc.includes('慢') || desc.includes('卡顿') || desc.includes('加载') || desc.includes('速度')) {
    return '性能'
  }
  if (desc.includes('bug') || desc.includes('错误') || desc.includes('报错') || desc.includes('异常') || desc.includes('崩溃')) {
    return '缺陷修复'
  }
  if (desc.includes('代码') || desc.includes('重构') || desc.includes('质量') || desc.includes('规范')) {
    return '代码质量'
  }
  if (desc.includes('安全') || desc.includes('权限') || desc.includes('认证') || desc.includes('鉴权')) {
    return '安全'
  }
  if (desc.includes('提示词') || desc.includes('prompt') || desc.includes('约束') || desc.includes('生成')) {
    return '提示词优化'
  }
  return '通用改进'
}

function generateConstraint(category: string): string {
  const constraints: Record<string, string> = {
    'UI/交互': '请在生成界面时遵循设计规范，确保组件间距一致，颜色使用设计系统中定义的变量。',
    '性能': '请优化数据查询和渲染逻辑，避免不必要的重复计算，使用分页和懒加载。',
    '缺陷修复': '请增加边界条件检查和错误处理，确保异常情况下给出明确的用户提示。',
    '代码质量': '请遵循项目编码规范，使用 TypeScript 严格模式，避免 any 类型，增加必要的类型注解。',
    '安全': '请确保所有接口进行权限校验，敏感数据不暴露到前端，使用参数化查询防止注入。',
    '提示词优化': '请确保提示词结构清晰、约束明确，包含必要的上下文信息和输出格式要求。',
    '通用改进': '请确保代码可读性好、职责单一，并增加必要的注释和文档说明。',
  }
  return constraints[category] ?? constraints['通用改进']
}

async function findRelatedPrompt(
  description: string,
  _category: string,
): Promise<{ id: string; name: string } | null> {
  // Simple keyword-based prompt matching
  const keywords = description
    .replace(/[，。！？、；：""''（）]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5)

  if (keywords.length === 0) return null

  // Search prompts by name/description containing any keyword
  for (const keyword of keywords) {
    const prompt = await prisma.prompt.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true },
    })
    if (prompt) return prompt
  }

  return null
}
