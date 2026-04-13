import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { Prisma, ExperienceFeedback as PrismaExperienceFeedback } from '@prisma/client'

// ========== Types ==========

interface UserBriefRow {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

interface LinkedPromptBrief {
  id: string
  name: string
  category: string
}

export interface ExperienceFeedbackResponse {
  id: string
  problemDescription: string
  markdownContent: string | null
  markdownFileName: string | null
  linkedPromptId: string | null
  linkedPrompt: LinkedPromptBrief | null
  createdBy: UserBriefRow
  createdAt: number
  updatedAt: number
}

// ========== Helpers ==========

async function getUserBrief(userId: string): Promise<UserBriefRow> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      legacyRoles: true,
    },
  })
  if (!user) {
    return {
      id: userId,
      name: 'Unknown',
      email: '',
      role: 'DESIGNER',
      avatar: null,
      legacyRoles: [],
    }
  }
  return user
}

type FeedbackWithPrompt = PrismaExperienceFeedback & {
  linkedPrompt: { id: string; name: string; category: string } | null
}

function toFeedbackResponse(
  feedback: FeedbackWithPrompt,
  createdBy: UserBriefRow,
): ExperienceFeedbackResponse {
  return {
    id: feedback.id,
    problemDescription: feedback.problemDescription,
    markdownContent: feedback.markdownContent,
    markdownFileName: feedback.markdownFileName,
    linkedPromptId: feedback.linkedPromptId,
    linkedPrompt: feedback.linkedPrompt
      ? {
          id: feedback.linkedPrompt.id,
          name: feedback.linkedPrompt.name,
          category: feedback.linkedPrompt.category,
        }
      : null,
    createdBy,
    createdAt: feedback.createdAt.getTime(),
    updatedAt: feedback.updatedAt.getTime(),
  }
}

async function ensurePromptExists(promptId: string): Promise<void> {
  const prompt = await prisma.prompt.findUnique({
    where: { id: promptId },
    select: { id: true, deletedAt: true },
  })
  if (!prompt || prompt.deletedAt) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `Linked prompt ${promptId} not found`,
      400,
    )
  }
}

// ========== Create Feedback ==========

export async function createFeedback(
  userId: string,
  input: {
    problemDescription: string
    markdownContent?: string | null
    markdownFileName?: string | null
    linkedPromptId?: string | null
  },
): Promise<ExperienceFeedbackResponse> {
  if (!input.problemDescription || !input.problemDescription.trim()) {
    throw new AppError(
      ErrorCodes.MISSING_REQUIRED_FIELD,
      'problemDescription is required',
    )
  }

  if (input.linkedPromptId) {
    await ensurePromptExists(input.linkedPromptId)
  }

  const feedback = await prisma.experienceFeedback.create({
    data: {
      problemDescription: input.problemDescription.trim(),
      markdownContent: input.markdownContent ?? null,
      markdownFileName: input.markdownFileName ?? null,
      linkedPromptId: input.linkedPromptId ?? null,
      createdById: userId,
    },
    include: {
      linkedPrompt: {
        select: { id: true, name: true, category: true },
      },
    },
  })

  const createdBy = await getUserBrief(userId)
  return toFeedbackResponse(feedback, createdBy)
}

// ========== List Feedbacks ==========

export async function listFeedbacks(query: {
  page: number
  pageSize: number
  skip: number
  createdBy?: string
  linkedPromptId?: string
}): Promise<{ items: ExperienceFeedbackResponse[]; total: number }> {
  const where: Prisma.ExperienceFeedbackWhereInput = {
    deletedAt: null,
  }

  if (query.createdBy) {
    where.createdById = query.createdBy
  }
  if (query.linkedPromptId) {
    where.linkedPromptId = query.linkedPromptId
  }

  const [items, total] = await Promise.all([
    prisma.experienceFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.pageSize,
      include: {
        linkedPrompt: {
          select: { id: true, name: true, category: true },
        },
      },
    }),
    prisma.experienceFeedback.count({ where }),
  ])

  const userIds = [...new Set(items.map((i) => i.createdById))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      legacyRoles: true,
    },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const responseItems = items.map((item) => {
    const createdBy =
      userMap.get(item.createdById) ?? {
        id: item.createdById,
        name: 'Unknown',
        email: '',
        role: 'DESIGNER' as const,
        avatar: null,
        legacyRoles: [],
      }
    return toFeedbackResponse(item, createdBy)
  })

  return { items: responseItems, total }
}

// ========== Get Feedback Detail ==========

export async function getFeedbackDetail(
  id: string,
): Promise<ExperienceFeedbackResponse> {
  const feedback = await prisma.experienceFeedback.findUnique({
    where: { id },
    include: {
      linkedPrompt: {
        select: { id: true, name: true, category: true },
      },
    },
  })

  if (!feedback || feedback.deletedAt) {
    throw new AppError(
      ErrorCodes.FEEDBACK_NOT_FOUND,
      'Experience feedback not found',
      404,
    )
  }

  const createdBy = await getUserBrief(feedback.createdById)
  return toFeedbackResponse(feedback, createdBy)
}

// ========== Delete Feedback (soft) ==========

export async function deleteFeedback(id: string): Promise<void> {
  const existing = await prisma.experienceFeedback.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(
      ErrorCodes.FEEDBACK_NOT_FOUND,
      'Experience feedback not found',
      404,
    )
  }

  await prisma.experienceFeedback.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}
