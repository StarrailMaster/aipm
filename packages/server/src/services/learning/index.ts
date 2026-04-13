/**
 * Learning Service (replaces experience_feedbacks) — D1 决策
 *
 * Expand-Contract 迁移策略（D22）：
 *   Stage 1 (Day 1 ~ 2 周): 双写
 *     - 新 API POST /learnings 同时写 `learnings` 和 `experience_feedbacks`
 *     - 老 API /experience/feedbacks 仍可读写老表
 *     - 新 API 从 `learnings` 读（含 AI_GENERATED + HUMAN 全量）
 *     - 老 API 从 `experience_feedbacks` 读（仅 HUMAN 部分等同）
 *   Stage 2 (2 周后):
 *     - 关闭 `/experience/feedbacks` API（410 Gone）
 *     - Drop `experience_feedbacks` 表
 *
 * 本 service 仅负责新表 `learnings` 的操作 + dual-write 写入老表。
 * 老表继续读写由 `experience.service` 保持兼容。
 */
import type {
  Prisma,
  Learning as PrismaLearning,
  LearningSource as PrismaLearningSource,
  User as PrismaUser,
  Hypothesis as PrismaHypothesis,
  Prompt as PrismaPrompt,
} from '@prisma/client'
import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'

// ============================================================
// Types
// ============================================================

type LearningWithRelations = PrismaLearning & {
  createdBy: PrismaUser
  linkedPrompt?: PrismaPrompt | null
  hypothesis?: (PrismaHypothesis & {
    keyResult: { name: string }
  }) | null
}

function userBrief(u: PrismaUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    legacyRoles: u.legacyRoles,
  }
}

function mapLearning(l: LearningWithRelations) {
  return {
    id: l.id,
    source: l.source,
    hypothesisId: l.hypothesisId,
    title: l.title,
    content: l.content,
    linkedPromptId: l.linkedPromptId,
    markdownContent: l.markdownContent,
    markdownFileName: l.markdownFileName,
    problemDescription: l.problemDescription,
    createdBy: userBrief(l.createdBy),
    createdAt: l.createdAt.getTime(),
    updatedAt: l.updatedAt.getTime(),
  }
}

function mapLearningDetail(l: LearningWithRelations) {
  return {
    ...mapLearning(l),
    relatedHypothesis:
      l.hypothesis && !l.hypothesis.deletedAt
        ? {
            id: l.hypothesis.id,
            statement: l.hypothesis.statement,
            status: l.hypothesis.status,
            krName: l.hypothesis.keyResult.name,
          }
        : null,
  }
}

// ============================================================
// Create (dual-write Stage 1)
// ============================================================

type CreateLearningInput = {
  title: string
  content: string
  hypothesisId?: string | null
  linkedPromptId?: string | null
  markdownContent?: string | null
  markdownFileName?: string | null
  problemDescription?: string | null
  /** 内部调用（copilot）时传 AI_GENERATED，REST API 创建时默认 HUMAN */
  source?: PrismaLearningSource
}

export async function createLearning(
  actorUserId: string,
  input: CreateLearningInput,
) {
  if (!input.title || !input.title.trim()) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '标题必填')
  }
  if (!input.content || !input.content.trim()) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '内容必填')
  }

  // 校验关联的 hypothesis 和 prompt（若提供）
  if (input.hypothesisId) {
    const hyp = await prisma.hypothesis.findFirst({
      where: { id: input.hypothesisId, deletedAt: null },
      select: { id: true },
    })
    if (!hyp) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_NOT_FOUND,
        '关联的假设不存在',
        404,
      )
    }
  }
  if (input.linkedPromptId) {
    const p = await prisma.prompt.findFirst({
      where: { id: input.linkedPromptId, deletedAt: null },
      select: { id: true },
    })
    if (!p) {
      throw new AppError(
        ErrorCodes.INVALID_FORMAT,
        '关联的提示词不存在',
        400,
      )
    }
  }

  const source = input.source ?? 'HUMAN'

  // Dual-write: learnings + experience_feedbacks (仅 HUMAN source 才写老表)
  const result = await prisma.$transaction(async (tx) => {
    const learning = await tx.learning.create({
      data: {
        source,
        hypothesisId: input.hypothesisId ?? null,
        title: input.title.trim(),
        content: input.content,
        linkedPromptId: input.linkedPromptId ?? null,
        markdownContent: input.markdownContent ?? null,
        markdownFileName: input.markdownFileName ?? null,
        problemDescription: input.problemDescription ?? null,
        createdById: actorUserId,
      },
      include: {
        createdBy: true,
        linkedPrompt: true,
      },
    })

    // Dual-write 到老表（只写 HUMAN）—— Stage 1 兼容
    if (source === 'HUMAN' && input.problemDescription) {
      await tx.experienceFeedback.create({
        data: {
          problemDescription: input.problemDescription,
          markdownContent: input.markdownContent ?? null,
          markdownFileName: input.markdownFileName ?? null,
          linkedPromptId: input.linkedPromptId ?? null,
          createdById: actorUserId,
        },
      })
    }

    return learning
  })

  return mapLearning(result as LearningWithRelations)
}

/**
 * 内部入口（Copilot 调用）：写 AI_GENERATED learning。
 * 不走 dual-write（AI 生成的不进老表）。
 *
 * 幂等：同一 hypothesisId + AI_GENERATED 只保留最新一条。
 */
export async function writeAiLearning(input: {
  hypothesisId: string
  title: string
  content: string
}) {
  // 检查是否已存在同 hypothesis 的 AI learning
  const existing = await prisma.learning.findFirst({
    where: {
      hypothesisId: input.hypothesisId,
      source: 'AI_GENERATED',
      deletedAt: null,
    },
  })

  // 获取 hypothesis owner 作为 createdBy（系统生成的归属本 hyp owner）
  const hyp = await prisma.hypothesis.findUnique({
    where: { id: input.hypothesisId },
    select: { ownerId: true },
  })
  if (!hyp) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_NOT_FOUND,
      '关联的假设不存在',
      404,
    )
  }

  if (existing) {
    const updated = await prisma.learning.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        content: input.content,
      },
      include: { createdBy: true },
    })
    return mapLearning(updated as LearningWithRelations)
  }

  const created = await prisma.learning.create({
    data: {
      source: 'AI_GENERATED',
      hypothesisId: input.hypothesisId,
      title: input.title,
      content: input.content,
      createdById: hyp.ownerId,
    },
    include: { createdBy: true },
  })
  return mapLearning(created as LearningWithRelations)
}

// ============================================================
// List
// ============================================================

type ListQuery = {
  page: number
  pageSize: number
  skip: number
  source?: PrismaLearningSource
  hypothesisId?: string
  createdById?: string
  search?: string
}

export async function listLearnings(query: ListQuery) {
  const where: Prisma.LearningWhereInput = { deletedAt: null }
  if (query.source) where.source = query.source
  if (query.hypothesisId) where.hypothesisId = query.hypothesisId
  if (query.createdById) where.createdById = query.createdById
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: 'insensitive' } },
      { content: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.learning.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.pageSize,
      include: { createdBy: true, linkedPrompt: true },
    }),
    prisma.learning.count({ where }),
  ])

  return {
    items: items.map((l) => mapLearning(l as LearningWithRelations)),
    total,
  }
}

export async function getLearningDetail(id: string) {
  const learning = await prisma.learning.findFirst({
    where: { id, deletedAt: null },
    include: {
      createdBy: true,
      linkedPrompt: true,
      hypothesis: {
        include: { keyResult: { select: { name: true } } },
      },
    },
  })
  if (!learning) {
    throw new AppError(ErrorCodes.LEARNING_NOT_FOUND, '学习笔记不存在', 404)
  }
  return mapLearningDetail(learning as LearningWithRelations)
}

export async function updateLearning(
  id: string,
  data: Partial<CreateLearningInput>,
  actor: { userId: string; role: string },
) {
  const existing = await prisma.learning.findFirst({
    where: { id, deletedAt: null },
  })
  if (!existing) {
    throw new AppError(ErrorCodes.LEARNING_NOT_FOUND, '学习笔记不存在', 404)
  }
  if (existing.createdById !== actor.userId && actor.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只能编辑自己创建的学习笔记',
      403,
    )
  }

  const updated = await prisma.learning.update({
    where: { id },
    data: {
      title: data.title,
      content: data.content,
      hypothesisId: data.hypothesisId,
      linkedPromptId: data.linkedPromptId,
      markdownContent: data.markdownContent,
      markdownFileName: data.markdownFileName,
      problemDescription: data.problemDescription,
    },
    include: { createdBy: true, linkedPrompt: true },
  })
  return mapLearning(updated as LearningWithRelations)
}

export async function deleteLearning(
  id: string,
  actor: { userId: string; role: string },
) {
  const existing = await prisma.learning.findFirst({
    where: { id, deletedAt: null },
  })
  if (!existing) {
    throw new AppError(ErrorCodes.LEARNING_NOT_FOUND, '学习笔记不存在', 404)
  }
  if (existing.createdById !== actor.userId && actor.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只能删除自己创建的学习笔记',
      403,
    )
  }
  await prisma.learning.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ============================================================
// Stage 1 data migration (one-shot)
// ============================================================

/**
 * 一次性从 experience_feedbacks 复制全部数据到 learnings 表。
 * 幂等：只复制在 learnings 表中尚不存在（按 experience_feedback.id 对应 learning.id）的条目。
 *
 * 在 Stage 1 上线时调用（通过 scripts/migrate-experience-to-learning.ts）。
 */
export async function migrateExperienceToLearning(): Promise<{
  migrated: number
  skipped: number
}> {
  const experiences = await prisma.experienceFeedback.findMany({
    where: { deletedAt: null },
  })

  let migrated = 0
  let skipped = 0
  for (const exp of experiences) {
    // 用 experience.id 作为 learning.id，确保幂等
    const exists = await prisma.learning.findFirst({
      where: { id: exp.id },
    })
    if (exists) {
      skipped += 1
      continue
    }
    await prisma.learning.create({
      data: {
        id: exp.id, // 保留 id 便于对齐
        source: 'HUMAN',
        title: exp.problemDescription.slice(0, 100), // 取前 100 字符作标题
        content: exp.problemDescription,
        linkedPromptId: exp.linkedPromptId,
        markdownContent: exp.markdownContent,
        markdownFileName: exp.markdownFileName,
        problemDescription: exp.problemDescription,
        createdById: exp.createdById,
        createdAt: exp.createdAt,
        updatedAt: exp.updatedAt,
      },
    })
    migrated += 1
  }
  return { migrated, skipped }
}
