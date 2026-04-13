import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { Prisma } from '@prisma/client'
import { PointCategory, ContributionSourceType } from '@prisma/client'
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

function toSkillResponse(
  skill: Prisma.SkillGetPayload<Record<string, never>>,
  createdBy: UserBriefRow,
  isStarred?: boolean,
) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    content: skill.content,
    gitRepoUrl: skill.gitRepoUrl,
    visibility: skill.visibility,
    starCount: skill.starCount,
    forkCount: skill.forkCount,
    sourceId: skill.sourceId,
    createdBy,
    isStarred: isStarred ?? false,
    createdAt: skill.createdAt.getTime(),
    updatedAt: skill.updatedAt.getTime(),
  }
}

// ========== List Skills ==========

export async function listSkills(query: {
  page: number
  pageSize: number
  skip: number
  keyword?: string
  category?: string
  sort?: string
  userId?: string
  userRole?: string
}) {
  const where: Prisma.SkillWhereInput = {
    deletedAt: null,
  }

  const andClauses: Prisma.SkillWhereInput[] = []

  if (query.keyword) {
    andClauses.push({
      OR: [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
      ],
    })
  }

  if (query.category) {
    where.category = query.category as Prisma.EnumSkillCategoryFilter
  }

  // 可见性强制：非 ADMIN 只能看 team/public 或自己的 private
  if (query.userRole !== 'ADMIN' && query.userId) {
    andClauses.push({
      OR: [
        { visibility: { in: ['team', 'public'] } },
        { visibility: 'private', createdById: query.userId },
      ],
    })
  }

  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  let orderBy: Prisma.SkillOrderByWithRelationInput = { updatedAt: 'desc' }
  if (query.sort === 'star') {
    orderBy = { starCount: 'desc' }
  }

  const [items, total] = await Promise.all([
    prisma.skill.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.pageSize,
    }),
    prisma.skill.count({ where }),
  ])

  // Get user stars
  let starredIds: Set<string> = new Set()
  if (query.userId) {
    const stars = await prisma.star.findMany({
      where: {
        userId: query.userId,
        targetType: 'skill',
        skillId: { in: items.map((i) => i.id) },
      },
      select: { skillId: true },
    })
    starredIds = new Set(stars.map((s) => s.skillId).filter(Boolean) as string[])
  }

  // Get creators
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
    return toSkillResponse(item, creator, starredIds.has(item.id))
  })

  return { items: responseItems, total }
}

// ========== Create Skill ==========

export async function createSkill(
  userId: string,
  data: {
    name: string
    description?: string
    category: string
    tags?: string[]
    content: string
    gitRepoUrl?: string
    visibility?: string
  },
) {
  const skill = await prisma.skill.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      category: data.category as Prisma.SkillCreateInput['category'],
      tags: data.tags ?? [],
      content: data.content,
      gitRepoUrl: data.gitRepoUrl ?? null,
      visibility: (data.visibility ?? 'team') as Prisma.SkillCreateInput['visibility'],
      createdById: userId,
    },
  })

  // Contribution points: +10 for creating a skill
  await awardPoints({
    userId,
    eventKey: `create:skill:${skill.id}`,
    eventType: 'create',
    category: PointCategory.base,
    sourceType: ContributionSourceType.skill,
    sourceId: skill.id,
    points: 10,
    reason: `创建技能「${skill.name}」`,
  })

  const creator = await getUserBrief(userId)
  return toSkillResponse(skill, creator, false)
}

// ========== Get Skill Detail ==========

export async function getSkillDetail(skillId: string, userId?: string) {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
  })

  if (!skill || skill.deletedAt) {
    throw new AppError(32001, 'Skill not found', 404)
  }

  let isStarred = false
  if (userId) {
    const star = await prisma.star.findFirst({
      where: { userId, targetType: 'skill', skillId },
    })
    isStarred = !!star
  }

  const creator = await getUserBrief(skill.createdById)
  return toSkillResponse(skill, creator, isStarred)
}

// ========== Update Skill ==========

export async function updateSkill(
  skillId: string,
  userId: string,
  data: {
    name?: string
    description?: string
    category?: string
    tags?: string[]
    content?: string
    gitRepoUrl?: string
  },
) {
  const existing = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(32001, 'Skill not found', 404)
  }

  if (existing.createdById !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only the owner can update this skill', 403)
  }

  const updateData: Prisma.SkillUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.category !== undefined) updateData.category = data.category as Prisma.SkillUpdateInput['category']
  if (data.tags !== undefined) updateData.tags = data.tags
  if (data.content !== undefined) updateData.content = data.content
  if (data.gitRepoUrl !== undefined) updateData.gitRepoUrl = data.gitRepoUrl

  const skill = await prisma.skill.update({
    where: { id: skillId },
    data: updateData,
  })

  const creator = await getUserBrief(skill.createdById)
  return toSkillResponse(skill, creator)
}

// ========== Delete Skill (soft) ==========

export async function deleteSkill(skillId: string, userId: string) {
  const existing = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(32001, 'Skill not found', 404)
  }

  if (existing.createdById !== userId) {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only the owner can delete this skill', 403)
  }

  await prisma.skill.update({
    where: { id: skillId },
    data: { deletedAt: new Date() },
  })
}

// ========== Toggle Star ==========

export async function toggleStar(skillId: string, userId: string) {
  const skill = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!skill || skill.deletedAt) {
    throw new AppError(32001, 'Skill not found', 404)
  }

  const existing = await prisma.star.findFirst({
    where: { userId, targetType: 'skill', skillId },
  })

  if (existing) {
    await prisma.star.delete({ where: { id: existing.id } })
    await prisma.skill.update({
      where: { id: skillId },
      data: { starCount: { decrement: 1 } },
    })
    return { starred: false, starCount: skill.starCount - 1 }
  } else {
    await prisma.star.create({
      data: {
        userId,
        targetType: 'skill',
        skillId,
      },
    })
    await prisma.skill.update({
      where: { id: skillId },
      data: { starCount: { increment: 1 } },
    })

    const newStarCount = skill.starCount + 1
    // Contribution points: milestone check for skill creator (exclude self-star)
    if (userId !== skill.createdById) {
      await checkAndAwardMilestones({
        ownerId: skill.createdById,
        sourceType: ContributionSourceType.skill,
        sourceId: skill.id,
        sourceName: skill.name,
        currentCount: newStarCount,
        kind: 'star',
      })
    }

    return { starred: true, starCount: newStarCount }
  }
}

// ========== Fork Skill ==========

export async function forkSkill(skillId: string, userId: string, newName?: string) {
  const source = await prisma.skill.findUnique({ where: { id: skillId } })
  if (!source || source.deletedAt) {
    throw new AppError(32001, 'Skill not found', 404)
  }

  const forkedSkill = await prisma.skill.create({
    data: {
      name: newName ?? `${source.name} (fork)`,
      description: source.description,
      category: source.category,
      tags: source.tags,
      content: source.content,
      gitRepoUrl: source.gitRepoUrl,
      visibility: 'private',
      sourceId: source.id,
      createdById: userId,
    },
  })

  await prisma.fork.create({
    data: {
      userId,
      sourceType: 'skill',
      sourceId: source.id,
      forkedItemId: forkedSkill.id,
    },
  })

  await prisma.skill.update({
    where: { id: skillId },
    data: { forkCount: { increment: 1 } },
  })

  const newForkCount = source.forkCount + 1
  // Contribution points: milestone check for skill creator (exclude self-fork)
  if (userId !== source.createdById) {
    await checkAndAwardMilestones({
      ownerId: source.createdById,
      sourceType: ContributionSourceType.skill,
      sourceId: source.id,
      sourceName: source.name,
      currentCount: newForkCount,
      kind: 'fork',
    })
  }

  const creator = await getUserBrief(userId)
  return toSkillResponse(forkedSkill, creator, false)
}
