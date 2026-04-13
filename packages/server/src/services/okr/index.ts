import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'

// ========== Types ==========

interface UserBriefRow {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

// ========== Helpers ==========

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

// ========== List Objectives ==========

export async function listObjectives(projectId: string) {
  const objectives = await prisma.objective.findMany({
    where: {
      projectId,
      deletedAt: null,
    },
    include: {
      keyResults: {
        include: {
          iterations: {
            orderBy: { roundNumber: 'desc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Collect all user IDs for bulk query
  const userIds = new Set<string>()
  for (const obj of objectives) {
    userIds.add(obj.createdById)
    for (const kr of obj.keyResults) {
      for (const iter of kr.iterations) {
        userIds.add(iter.recordedById)
      }
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const fallbackUser = (id: string): UserBriefRow => ({
    id,
    name: 'Unknown',
    email: '',
    role: 'DESIGNER',
    avatar: null,
    legacyRoles: [],
  })

  // Resolve squad names
  const squadIds = objectives
    .map((o) => o.squadId)
    .filter((id): id is string => id !== null)
  const squads = squadIds.length > 0
    ? await prisma.squad.findMany({
      where: { id: { in: squadIds } },
      select: { id: true, name: true },
    })
    : []
  const squadMap = new Map(squads.map((s) => [s.id, s.name]))

  return objectives.map((obj) => ({
    id: obj.id,
    projectId: obj.projectId,
    name: obj.name,
    description: obj.description,
    squadId: obj.squadId,
    squadName: obj.squadId ? (squadMap.get(obj.squadId) ?? null) : null,
    keyResults: obj.keyResults.map((kr) => ({
      id: kr.id,
      objectiveId: kr.objectiveId,
      name: kr.name,
      targetValue: kr.targetValue,
      currentValue: kr.currentValue,
      unit: kr.unit,
      status: (kr.currentValue >= kr.targetValue ? 'achieved' : 'not_achieved') as
        | 'achieved'
        | 'not_achieved',
      iterations: kr.iterations.map((iter) => ({
        id: iter.id,
        keyResultId: iter.keyResultId,
        roundNumber: iter.roundNumber,
        changes: iter.changes,
        dataFeedback: iter.dataFeedback,
        isAchieved: iter.isAchieved,
        recordedBy: userMap.get(iter.recordedById) ?? fallbackUser(iter.recordedById),
        createdAt: iter.createdAt.getTime(),
      })),
      createdAt: kr.createdAt.getTime(),
      updatedAt: kr.updatedAt.getTime(),
    })),
    createdBy: userMap.get(obj.createdById) ?? fallbackUser(obj.createdById),
    createdAt: obj.createdAt.getTime(),
    updatedAt: obj.updatedAt.getTime(),
  }))
}

// ========== Phase E.1: KR Detail ==========

export async function getKeyResultDetail(id: string) {
  const kr = await prisma.keyResult.findUnique({
    where: { id },
    include: {
      objective: {
        include: {
          // 拿 project 名字
        },
      },
      iterations: {
        orderBy: { roundNumber: 'desc' },
      },
    },
  })
  if (!kr) {
    throw new AppError(ErrorCodes.KEY_RESULT_NOT_FOUND, 'KR 不存在', 404)
  }

  // 拉该 KR 下的所有假设 (未软删)
  const hypotheses = await prisma.hypothesis.findMany({
    where: { krId: id, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true } },
      result: { select: { delta: true, conclusion: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // 拉 project 名称
  const project = await prisma.project.findUnique({
    where: { id: kr.objective.projectId },
    select: { name: true },
  })

  // 统计
  const total = hypotheses.length
  const running = hypotheses.filter((h) => h.status === 'RUNNING').length
  const won = hypotheses.filter((h) => h.status === 'CLOSED_WIN').length
  const lost = hypotheses.filter((h) => h.status === 'CLOSED_LOSS').length
  const closed = hypotheses.filter((h) =>
    ['CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_FLAT'].includes(h.status),
  ).length
  const winRate = closed > 0 ? won / closed : 0

  // 进度比率
  const range = kr.targetValue - kr.baseline
  const kpiProgressRatio = range > 0 ? (kr.currentValue - kr.baseline) / range : 0

  // 剩余天数
  const daysLeft = kr.endDate
    ? Math.max(
        0,
        Math.floor(
          (kr.endDate.getTime() - Date.now()) / 86400000,
        ),
      )
    : null

  return {
    id: kr.id,
    name: kr.name,
    targetValue: kr.targetValue,
    currentValue: kr.currentValue,
    baseline: kr.baseline,
    unit: kr.unit,
    startDate: kr.startDate.getTime(),
    endDate: kr.endDate?.getTime() ?? null,
    kpiProgressRatio,
    daysLeft,
    objective: {
      id: kr.objective.id,
      name: kr.objective.name,
      projectName: project?.name ?? null,
    },
    hypotheses: hypotheses.map((h) => ({
      id: h.id,
      statement: h.statement,
      status: h.status,
      iceScore: h.iceScore,
      closedAt: h.closedAt?.getTime() ?? null,
      ownerName: h.owner.name,
      result: h.result
        ? { delta: h.result.delta, conclusion: h.result.conclusion }
        : null,
    })),
    iterations: kr.iterations.map((iter) => ({
      id: iter.id,
      roundNumber: iter.roundNumber,
      changes: iter.changes,
      dataFeedback: iter.dataFeedback,
      isAchieved: iter.isAchieved,
      createdAt: iter.createdAt.getTime(),
    })),
    hypothesisStats: {
      total,
      running,
      won,
      lost,
      winRate,
    },
  }
}

// ========== Create Objective ==========

export async function createObjective(
  userId: string,
  data: {
    projectId: string
    name: string
    description?: string
    squadId?: string
  },
) {
  const objective = await prisma.objective.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      squadId: data.squadId ?? null,
      createdById: userId,
    },
  })

  const creator = await getUserBrief(userId)

  let squadName: string | null = null
  if (objective.squadId) {
    const squad = await prisma.squad.findUnique({
      where: { id: objective.squadId },
      select: { name: true },
    })
    squadName = squad?.name ?? null
  }

  return {
    id: objective.id,
    projectId: objective.projectId,
    name: objective.name,
    description: objective.description,
    squadId: objective.squadId,
    squadName,
    keyResults: [],
    createdBy: creator,
    createdAt: objective.createdAt.getTime(),
    updatedAt: objective.updatedAt.getTime(),
  }
}

// ========== Update Objective ==========

export async function updateObjective(
  id: string,
  data: {
    name?: string
    description?: string
    squadId?: string
  },
) {
  const existing = await prisma.objective.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.OBJECTIVE_NOT_FOUND, 'Objective not found', 404)
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.squadId !== undefined) updateData.squadId = data.squadId || null

  const updated = await prisma.objective.update({
    where: { id },
    data: updateData,
  })

  const creator = await getUserBrief(updated.createdById)

  let squadName: string | null = null
  if (updated.squadId) {
    const squad = await prisma.squad.findUnique({
      where: { id: updated.squadId },
      select: { name: true },
    })
    squadName = squad?.name ?? null
  }

  return {
    id: updated.id,
    projectId: updated.projectId,
    name: updated.name,
    description: updated.description,
    squadId: updated.squadId,
    squadName,
    keyResults: [],
    createdBy: creator,
    createdAt: updated.createdAt.getTime(),
    updatedAt: updated.updatedAt.getTime(),
  }
}

// ========== Delete Objective (soft) ==========

export async function deleteObjective(id: string) {
  const existing = await prisma.objective.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.OBJECTIVE_NOT_FOUND, 'Objective not found', 404)
  }

  await prisma.objective.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ========== Create Key Result ==========

export async function createKeyResult(data: {
  objectiveId: string
  name: string
  targetValue: number
  unit: string
}) {
  const objective = await prisma.objective.findUnique({
    where: { id: data.objectiveId },
  })
  if (!objective || objective.deletedAt) {
    throw new AppError(ErrorCodes.OBJECTIVE_NOT_FOUND, 'Objective not found', 404)
  }

  const kr = await prisma.keyResult.create({
    data: {
      objectiveId: data.objectiveId,
      name: data.name,
      targetValue: data.targetValue,
      unit: data.unit,
    },
  })

  return {
    id: kr.id,
    objectiveId: kr.objectiveId,
    name: kr.name,
    targetValue: kr.targetValue,
    currentValue: kr.currentValue,
    unit: kr.unit,
    status: 'not_achieved' as const,
    iterations: [],
    createdAt: kr.createdAt.getTime(),
    updatedAt: kr.updatedAt.getTime(),
  }
}

// ========== Update Key Result ==========

export async function updateKeyResult(
  id: string,
  data: {
    name?: string
    targetValue?: number
    unit?: string
  },
) {
  const existing = await prisma.keyResult.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError(ErrorCodes.KEY_RESULT_NOT_FOUND, 'Key result not found', 404)
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.targetValue !== undefined) updateData.targetValue = data.targetValue
  if (data.unit !== undefined) updateData.unit = data.unit

  const updated = await prisma.keyResult.update({
    where: { id },
    data: updateData,
  })

  return {
    id: updated.id,
    objectiveId: updated.objectiveId,
    name: updated.name,
    targetValue: updated.targetValue,
    currentValue: updated.currentValue,
    unit: updated.unit,
    status: (updated.currentValue >= updated.targetValue ? 'achieved' : 'not_achieved') as
      | 'achieved'
      | 'not_achieved',
    iterations: [],
    createdAt: updated.createdAt.getTime(),
    updatedAt: updated.updatedAt.getTime(),
  }
}

// ========== Delete Key Result ==========

export async function deleteKeyResult(id: string) {
  const existing = await prisma.keyResult.findUnique({ where: { id } })
  if (!existing) {
    throw new AppError(ErrorCodes.KEY_RESULT_NOT_FOUND, 'Key result not found', 404)
  }

  // Delete related iterations first
  await prisma.krIteration.deleteMany({
    where: { keyResultId: id },
  })

  await prisma.keyResult.delete({
    where: { id },
  })
}

// ========== Record Iteration ==========

export async function recordIteration(
  userId: string,
  data: {
    keyResultId: string
    changes: string
    dataFeedback: number
  },
) {
  const kr = await prisma.keyResult.findUnique({ where: { id: data.keyResultId } })
  if (!kr) {
    throw new AppError(ErrorCodes.KEY_RESULT_NOT_FOUND, 'Key result not found', 404)
  }

  // Get current max round number
  const maxRound = await prisma.krIteration.aggregate({
    where: { keyResultId: data.keyResultId },
    _max: { roundNumber: true },
  })
  const nextRound = (maxRound._max.roundNumber ?? 0) + 1

  // Determine if achieved
  const isAchieved = data.dataFeedback >= kr.targetValue

  // Create iteration and update currentValue on KeyResult in a transaction
  const [iteration] = await prisma.$transaction([
    prisma.krIteration.create({
      data: {
        keyResultId: data.keyResultId,
        roundNumber: nextRound,
        changes: data.changes,
        dataFeedback: data.dataFeedback,
        isAchieved,
        recordedById: userId,
      },
    }),
    prisma.keyResult.update({
      where: { id: data.keyResultId },
      data: { currentValue: data.dataFeedback },
    }),
  ])

  const recordedBy = await getUserBrief(userId)

  return {
    id: iteration.id,
    keyResultId: iteration.keyResultId,
    roundNumber: iteration.roundNumber,
    changes: iteration.changes,
    dataFeedback: iteration.dataFeedback,
    isAchieved: iteration.isAchieved,
    recordedBy,
    createdAt: iteration.createdAt.getTime(),
  }
}

// ========== Get Iteration History ==========

export async function getIterationHistory(keyResultId: string) {
  const kr = await prisma.keyResult.findUnique({ where: { id: keyResultId } })
  if (!kr) {
    throw new AppError(ErrorCodes.KEY_RESULT_NOT_FOUND, 'Key result not found', 404)
  }

  const iterations = await prisma.krIteration.findMany({
    where: { keyResultId },
    orderBy: { roundNumber: 'desc' },
  })

  const userIds = [...new Set(iterations.map((i) => i.recordedById))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const fallbackUser = (id: string): UserBriefRow => ({
    id,
    name: 'Unknown',
    email: '',
    role: 'DESIGNER',
    avatar: null,
    legacyRoles: [],
  })

  return iterations.map((iter) => ({
    id: iter.id,
    keyResultId: iter.keyResultId,
    roundNumber: iter.roundNumber,
    changes: iter.changes,
    dataFeedback: iter.dataFeedback,
    isAchieved: iter.isAchieved,
    recordedBy: userMap.get(iter.recordedById) ?? fallbackUser(iter.recordedById),
    createdAt: iter.createdAt.getTime(),
  }))
}
