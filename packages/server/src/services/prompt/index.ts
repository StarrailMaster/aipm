import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { Prisma } from '@prisma/client'
import { PointCategory, ContributionSourceType } from '@prisma/client'
import * as diff from '../../utils/diff'
import { awardPoints, checkAndAwardMilestones } from '../contribution'

// ========== Helpers ==========

interface UserBriefRow {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
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

function toPromptResponse(
  prompt: Prisma.PromptGetPayload<Record<string, never>>,
  createdBy: UserBriefRow,
  isStarred?: boolean,
) {
  return {
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    category: prompt.category,
    tags: prompt.tags,
    content: prompt.content,
    visibility: prompt.visibility,
    starCount: prompt.starCount,
    forkCount: prompt.forkCount,
    sourceId: prompt.sourceId,
    dependsOn: prompt.dependsOn,
    requiredSopLayers: prompt.requiredSopLayers,
    version: prompt.version,
    createdBy,
    isStarred: isStarred ?? false,
    createdAt: prompt.createdAt.getTime(),
    updatedAt: prompt.updatedAt.getTime(),
  }
}

// ========== List Prompts ==========

export async function listPrompts(query: {
  page: number
  pageSize: number
  skip: number
  keyword?: string
  category?: string
  tags?: string[]
  visibility?: string
  sort?: string
  userId?: string
  /** 当前用户角色，用于可见性强制 */
  userRole?: string
}) {
  const where: Prisma.PromptWhereInput = {
    deletedAt: null,
  }

  // 把关键字搜索、可见性过滤、分类过滤等 AND 在一起
  const andClauses: Prisma.PromptWhereInput[] = []

  if (query.keyword) {
    andClauses.push({
      OR: [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
      ],
    })
  }

  if (query.category) {
    where.category = query.category as Prisma.EnumPromptCategoryFilter
  }

  if (query.tags && query.tags.length > 0) {
    where.tags = { hasSome: query.tags }
  }

  // 可见性强制：ADMIN 看全部；其它角色只能看 team/public 或自己的 private
  if (query.userRole !== 'ADMIN' && query.userId) {
    andClauses.push({
      OR: [
        { visibility: { in: ['team', 'public'] } },
        { visibility: 'private', createdById: query.userId },
      ],
    })
  }

  // 用户显式传 visibility 筛选（比如"只看我的 private"）
  if (query.visibility) {
    andClauses.push({ visibility: query.visibility as Prisma.EnumVisibilityFilter })
  }

  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  let orderBy: Prisma.PromptOrderByWithRelationInput = { updatedAt: 'desc' }
  if (query.sort === 'star') {
    orderBy = { starCount: 'desc' }
  } else if (query.sort === 'popular') {
    orderBy = { forkCount: 'desc' }
  }

  const [items, total] = await Promise.all([
    prisma.prompt.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.pageSize,
    }),
    prisma.prompt.count({ where }),
  ])

  // Get user stars for current user
  let starredIds: Set<string> = new Set()
  if (query.userId) {
    const stars = await prisma.star.findMany({
      where: {
        userId: query.userId,
        targetType: 'prompt',
        promptId: { in: items.map((i) => i.id) },
      },
      select: { promptId: true },
    })
    starredIds = new Set(stars.map((s) => s.promptId).filter(Boolean) as string[])
  }

  // Get all unique createdByIds
  const userIds = [...new Set(items.map((i) => i.createdById))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const responseItems = items.map((item) => {
    const creator = userMap.get(item.createdById) ?? {
      id: item.createdById,
      name: 'Unknown',
      email: '',
      role: 'DESIGNER' as const,
      avatar: null,
      legacyRoles: [],
    }
    return toPromptResponse(item, creator, starredIds.has(item.id))
  })

  return { items: responseItems, total }
}

// ========== Create Prompt ==========

export async function createPrompt(
  userId: string,
  data: {
    name: string
    description?: string
    category: string
    tags?: string[]
    content: string
    visibility?: string
    dependsOn?: string[]
    requiredSopLayers?: string[]
  },
) {
  const prompt = await prisma.prompt.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      category: data.category as Prisma.PromptCreateInput['category'],
      tags: data.tags ?? [],
      content: data.content,
      visibility: (data.visibility ?? 'team') as Prisma.PromptCreateInput['visibility'],
      dependsOn: data.dependsOn ?? [],
      requiredSopLayers: data.requiredSopLayers ?? [],
      createdById: userId,
      version: 1,
    },
  })

  // Create initial version
  await prisma.promptVersion.create({
    data: {
      promptId: prompt.id,
      version: 1,
      name: prompt.name,
      content: prompt.content,
      changelog: 'Initial version',
      createdById: userId,
    },
  })

  // Contribution points: +10 for creating a prompt
  await awardPoints({
    userId,
    eventKey: `create:prompt:${prompt.id}`,
    eventType: 'create',
    category: PointCategory.base,
    sourceType: ContributionSourceType.prompt,
    sourceId: prompt.id,
    points: 10,
    reason: `创建提示词「${prompt.name}」`,
  })

  const creator = await getUserBrief(userId)
  return toPromptResponse(prompt, creator, false)
}

// ========== Get Prompt Detail ==========

export async function getPromptDetail(promptId: string, userId?: string) {
  const prompt = await prisma.prompt.findUnique({
    where: { id: promptId },
  })

  if (!prompt || prompt.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  let isStarred = false
  if (userId) {
    const star = await prisma.star.findFirst({
      where: { userId, targetType: 'prompt', promptId },
    })
    isStarred = !!star
  }

  const creator = await getUserBrief(prompt.createdById)
  return toPromptResponse(prompt, creator, isStarred)
}

// ========== Update Prompt ==========

export async function updatePrompt(
  promptId: string,
  userId: string,
  data: {
    name?: string
    description?: string
    category?: string
    tags?: string[]
    content?: string
    dependsOn?: string[]
  },
) {
  const existing = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  if (existing.createdById !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only the owner can update this prompt', 403)
  }

  const updateData: Prisma.PromptUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.category !== undefined) updateData.category = data.category as Prisma.PromptUpdateInput['category']
  if (data.tags !== undefined) updateData.tags = data.tags
  if (data.content !== undefined) updateData.content = data.content
  if (data.dependsOn !== undefined) updateData.dependsOn = data.dependsOn

  // Auto increment version if content changed
  const contentChanged = data.content !== undefined && data.content !== existing.content
  if (contentChanged) {
    updateData.version = existing.version + 1
  }

  const prompt = await prisma.prompt.update({
    where: { id: promptId },
    data: updateData,
  })

  // Create version record if content changed
  if (contentChanged) {
    await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: prompt.version,
        name: prompt.name,
        content: prompt.content,
        changelog: data.name ? `Updated: ${data.name}` : 'Content updated',
        createdById: userId,
      },
    })
  }

  const creator = await getUserBrief(prompt.createdById)
  return toPromptResponse(prompt, creator)
}

// ========== Delete Prompt (soft) ==========

export async function deletePrompt(promptId: string, userId: string) {
  const existing = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  if (existing.createdById !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only the owner can delete this prompt', 403)
  }

  await prisma.prompt.update({
    where: { id: promptId },
    data: { deletedAt: new Date() },
  })
}

// ========== Toggle Star ==========

export async function toggleStar(promptId: string, userId: string) {
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!prompt || prompt.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  const existing = await prisma.star.findFirst({
    where: { userId, targetType: 'prompt', promptId },
  })

  if (existing) {
    // Unstar
    await prisma.star.delete({ where: { id: existing.id } })
    await prisma.prompt.update({
      where: { id: promptId },
      data: { starCount: { decrement: 1 } },
    })
    return { starred: false, starCount: prompt.starCount - 1 }
  } else {
    // Star
    await prisma.star.create({
      data: {
        userId,
        targetType: 'prompt',
        promptId,
      },
    })
    await prisma.prompt.update({
      where: { id: promptId },
      data: { starCount: { increment: 1 } },
    })

    const newStarCount = prompt.starCount + 1
    // Contribution points: milestone check for prompt creator (exclude self-star)
    if (userId !== prompt.createdById) {
      await checkAndAwardMilestones({
        ownerId: prompt.createdById,
        sourceType: ContributionSourceType.prompt,
        sourceId: prompt.id,
        sourceName: prompt.name,
        currentCount: newStarCount,
        kind: 'star',
      })
    }

    return { starred: true, starCount: newStarCount }
  }
}

// ========== Fork Prompt ==========

export async function forkPrompt(promptId: string, userId: string, newName?: string) {
  const source = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!source || source.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  const forkedPrompt = await prisma.prompt.create({
    data: {
      name: newName ?? `${source.name} (fork)`,
      description: source.description,
      category: source.category,
      tags: source.tags,
      content: source.content,
      visibility: 'private',
      dependsOn: source.dependsOn,
      requiredSopLayers: source.requiredSopLayers,
      sourceId: source.id,
      createdById: userId,
      version: 1,
    },
  })

  // Create initial version for fork
  await prisma.promptVersion.create({
    data: {
      promptId: forkedPrompt.id,
      version: 1,
      name: forkedPrompt.name,
      content: forkedPrompt.content,
      changelog: `Forked from ${source.name}`,
      createdById: userId,
    },
  })

  // Record fork
  await prisma.fork.create({
    data: {
      userId,
      sourceType: 'prompt',
      sourceId: source.id,
      forkedItemId: forkedPrompt.id,
    },
  })

  // Increment fork count on source
  await prisma.prompt.update({
    where: { id: promptId },
    data: { forkCount: { increment: 1 } },
  })

  const newForkCount = source.forkCount + 1
  // Contribution points: milestone check for prompt creator (exclude self-fork)
  if (userId !== source.createdById) {
    await checkAndAwardMilestones({
      ownerId: source.createdById,
      sourceType: ContributionSourceType.prompt,
      sourceId: source.id,
      sourceName: source.name,
      currentCount: newForkCount,
      kind: 'fork',
    })
  }

  const creator = await getUserBrief(userId)
  return toPromptResponse(forkedPrompt, creator, false)
}

// ========== Version History ==========

export async function getVersionHistory(promptId: string) {
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!prompt || prompt.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  const versions = await prisma.promptVersion.findMany({
    where: { promptId },
    orderBy: { version: 'desc' },
  })

  const userIds = [...new Set(versions.map((v) => v.createdById))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return versions.map((v) => {
    const creator = userMap.get(v.createdById) ?? {
      id: v.createdById,
      name: 'Unknown',
      email: '',
      role: 'DESIGNER' as const,
      avatar: null,
      legacyRoles: [],
    }
    return {
      id: v.id,
      promptId: v.promptId,
      version: v.version,
      name: v.name,
      content: v.content,
      changelog: v.changelog,
      createdBy: creator,
      createdAt: v.createdAt.getTime(),
    }
  })
}

// ========== Create PR ==========

export async function createPr(
  promptId: string,
  userId: string,
  data: { title: string; description: string; newContent: string },
) {
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!prompt || prompt.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  const computedDiff = diff.computeDiff(prompt.content, data.newContent)

  const pr = await prisma.promptPr.create({
    data: {
      promptId,
      title: data.title,
      description: data.description,
      newContent: data.newContent,
      diff: computedDiff,
      submittedById: userId,
    },
  })

  // Contribution points: +2 base for creating a PR
  await awardPoints({
    userId,
    eventKey: `create:prompt_pr:${pr.id}`,
    eventType: 'create',
    category: PointCategory.base,
    sourceType: ContributionSourceType.prompt_pr,
    sourceId: pr.id,
    points: 2,
    reason: `为「${prompt.name}」提交改进建议`,
  })

  const submitter = await getUserBrief(userId)
  return {
    id: pr.id,
    promptId: pr.promptId,
    title: pr.title,
    description: pr.description,
    diff: pr.diff,
    newContent: pr.newContent,
    status: pr.status,
    submittedBy: submitter,
    reviewedBy: null,
    reviewComment: null,
    createdAt: pr.createdAt.getTime(),
    updatedAt: pr.updatedAt.getTime(),
  }
}

// ========== List PRs ==========

export async function listPrs(promptId: string) {
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!prompt || prompt.deletedAt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  const prs = await prisma.promptPr.findMany({
    where: { promptId },
    orderBy: { createdAt: 'desc' },
  })

  const userIds = [...new Set([...prs.map((p) => p.submittedById), ...prs.map((p) => p.reviewedById).filter(Boolean) as string[]])]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return prs.map((pr) => {
    const submitter = userMap.get(pr.submittedById) ?? {
      id: pr.submittedById,
      name: 'Unknown',
      email: '',
      role: 'DESIGNER' as const,
      avatar: null,
      legacyRoles: [],
    }
    const reviewer = pr.reviewedById ? (userMap.get(pr.reviewedById) ?? null) : null
    return {
      id: pr.id,
      promptId: pr.promptId,
      title: pr.title,
      description: pr.description,
      diff: pr.diff,
      newContent: pr.newContent,
      status: pr.status,
      submittedBy: submitter,
      reviewedBy: reviewer,
      reviewComment: pr.reviewComment,
      createdAt: pr.createdAt.getTime(),
      updatedAt: pr.updatedAt.getTime(),
    }
  })
}

// ========== List my PRs (submitted by me, for "我的反馈" tab) ==========

export interface PrFeedItem {
  id: string
  promptId: string
  promptName: string
  promptCategory: string
  title: string
  description: string
  status: 'OPEN' | 'MERGED' | 'REJECTED'
  submittedBy: UserBriefRow
  reviewedBy: UserBriefRow | null
  reviewComment: string | null
  createdAt: number
  updatedAt: number
}

async function mapPrToFeedItem(
  pr: {
    id: string
    promptId: string
    title: string
    description: string
    status: string
    submittedById: string
    reviewedById: string | null
    reviewComment: string | null
    createdAt: Date
    updatedAt: Date
    prompt: { id: string; name: string; category: string }
  },
  userMap: Map<string, UserBriefRow>,
): Promise<PrFeedItem> {
  const submitter =
    userMap.get(pr.submittedById) ?? (await getUserBrief(pr.submittedById))
  const reviewer = pr.reviewedById
    ? userMap.get(pr.reviewedById) ?? (await getUserBrief(pr.reviewedById))
    : null
  return {
    id: pr.id,
    promptId: pr.promptId,
    promptName: pr.prompt.name,
    promptCategory: pr.prompt.category,
    title: pr.title,
    description: pr.description,
    status: pr.status as 'OPEN' | 'MERGED' | 'REJECTED',
    submittedBy: submitter,
    reviewedBy: reviewer,
    reviewComment: pr.reviewComment,
    createdAt: pr.createdAt.getTime(),
    updatedAt: pr.updatedAt.getTime(),
  }
}

/** 我提交的所有 PR（按时间倒序）。用于"我的反馈"tab */
export async function listMyPrs(
  userId: string,
  filter?: { status?: 'OPEN' | 'MERGED' | 'REJECTED' },
): Promise<PrFeedItem[]> {
  const where: Prisma.PromptPrWhereInput = {
    submittedById: userId,
    prompt: { deletedAt: null },
  }
  if (filter?.status) where.status = filter.status

  const prs = await prisma.promptPr.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      prompt: { select: { id: true, name: true, category: true } },
    },
  })

  const userIds = [
    ...new Set([
      ...prs.map((p) => p.submittedById),
      ...(prs.map((p) => p.reviewedById).filter(Boolean) as string[]),
    ]),
  ]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map<string, UserBriefRow>(users.map((u) => [u.id, u]))

  return Promise.all(prs.map((pr) => mapPrToFeedItem(pr, userMap)))
}

/** 需要我审核的 PR（我创建的提示词上的 OPEN PR）。用于"需要审核"tab */
export async function listPrsToReview(userId: string): Promise<PrFeedItem[]> {
  const prs = await prisma.promptPr.findMany({
    where: {
      status: 'OPEN',
      prompt: { createdById: userId, deletedAt: null },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      prompt: { select: { id: true, name: true, category: true } },
    },
  })

  const userIds = [
    ...new Set([
      ...prs.map((p) => p.submittedById),
      ...(prs.map((p) => p.reviewedById).filter(Boolean) as string[]),
    ]),
  ]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map<string, UserBriefRow>(users.map((u) => [u.id, u]))

  return Promise.all(prs.map((pr) => mapPrToFeedItem(pr, userMap)))
}

// ========== Review PR ==========

export async function reviewPr(
  prId: string,
  userId: string,
  data: { action: 'merge' | 'reject'; comment?: string },
) {
  const pr = await prisma.promptPr.findUnique({ where: { id: prId } })
  if (!pr) {
    throw new AppError(31002, 'PR not found', 404)
  }
  if (pr.status !== 'OPEN') {
    throw new AppError(31003, 'PR is already closed', 400)
  }

  const prompt = await prisma.prompt.findUnique({ where: { id: pr.promptId } })
  if (!prompt) {
    throw new AppError(31001, 'Prompt not found', 404)
  }

  // Only the prompt owner can review PRs
  if (prompt.createdById !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only the prompt owner can review PRs', 403)
  }

  const newStatus = data.action === 'merge' ? 'MERGED' : 'REJECTED'

  const updatedPr = await prisma.promptPr.update({
    where: { id: prId },
    data: {
      status: newStatus,
      reviewedById: userId,
      reviewComment: data.comment ?? null,
    },
  })

  // If merged, apply the changes to the prompt
  if (data.action === 'merge') {
    const newVersion = prompt.version + 1
    await prisma.prompt.update({
      where: { id: prompt.id },
      data: {
        content: pr.newContent,
        version: newVersion,
      },
    })
    await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: newVersion,
        name: prompt.name,
        content: pr.newContent,
        changelog: `Merged PR: ${pr.title}`,
        createdById: userId,
      },
    })

    // Contribution points: +10 value to the submitter
    await awardPoints({
      userId: pr.submittedById,
      eventKey: `pr_merged_submitter:prompt_pr:${pr.id}`,
      eventType: 'pr_merged',
      category: PointCategory.value,
      sourceType: ContributionSourceType.prompt_pr,
      sourceId: pr.id,
      points: 10,
      reason: `对「${prompt.name}」的改进建议被合并`,
    })

    // Contribution points: +5 value to the original prompt creator (if different)
    if (pr.submittedById !== prompt.createdById) {
      await awardPoints({
        userId: prompt.createdById,
        eventKey: `pr_merged_original:prompt_pr:${pr.id}`,
        eventType: 'pr_merged',
        category: PointCategory.value,
        sourceType: ContributionSourceType.prompt,
        sourceId: prompt.id,
        points: 5,
        reason: `你创建的「${prompt.name}」收到了被合并的改进`,
      })
    }
  }

  const submitter = await getUserBrief(updatedPr.submittedById)
  const reviewer = await getUserBrief(userId)

  return {
    id: updatedPr.id,
    promptId: updatedPr.promptId,
    title: updatedPr.title,
    description: updatedPr.description,
    diff: updatedPr.diff,
    newContent: updatedPr.newContent,
    status: updatedPr.status,
    submittedBy: submitter,
    reviewedBy: reviewer,
    reviewComment: updatedPr.reviewComment,
    createdAt: updatedPr.createdAt.getTime(),
    updatedAt: updatedPr.updatedAt.getTime(),
  }
}

// ========== Get single PR ==========

export async function getPrDetail(prId: string) {
  const pr = await prisma.promptPr.findUnique({ where: { id: prId } })
  if (!pr) {
    throw new AppError(31002, 'PR not found', 404)
  }

  const submitter = await getUserBrief(pr.submittedById)
  const reviewer = pr.reviewedById ? await getUserBrief(pr.reviewedById) : null

  return {
    id: pr.id,
    promptId: pr.promptId,
    title: pr.title,
    description: pr.description,
    diff: pr.diff,
    newContent: pr.newContent,
    status: pr.status,
    submittedBy: submitter,
    reviewedBy: reviewer,
    reviewComment: pr.reviewComment,
    createdAt: pr.createdAt.getTime(),
    updatedAt: pr.updatedAt.getTime(),
  }
}
