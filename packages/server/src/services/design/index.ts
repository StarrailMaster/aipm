import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { Prisma, DesignStatus, DesignSourceType } from '@prisma/client'

// ========== Helpers ==========

interface UserBriefRow {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

// 说明：PENDING_CONFIRM 是手动任务的"设计师完成 → 等创建人确认"中间态
const VALID_TRANSITIONS: Record<string, string[]> = {
  AI_GENERATED: ['PENDING_REFINE'],
  PENDING_REFINE: ['REFINING', 'PENDING_CONFIRM', 'CONFIRMED'], // CONFIRMED 给 FEED_PUSH 走
  REFINING: ['CONFIRMED', 'PENDING_CONFIRM'],
  PENDING_CONFIRM: ['CONFIRMED', 'REFINING'], // 创建人确认或要求返工
  CONFIRMED: ['LOCKED'],
  LOCKED: ['PENDING_REFINE'],
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

async function getUserBriefMap(userIds: string[]): Promise<Map<string, UserBriefRow>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  return new Map(users.map((u) => [u.id, u]))
}

interface DesignResponseOptions {
  assigneeName?: string | null
  assignee?: UserBriefRow | null
  lockedBy?: UserBriefRow | null
  createdBy?: UserBriefRow | null
  confirmedBy?: UserBriefRow | null
  sourceFeedPackage?: { id: string; name: string; iterationId: string } | null
}

function toDesignResponse(
  draft: Prisma.DesignDraftGetPayload<Record<string, never>>,
  opts: DesignResponseOptions = {},
) {
  return {
    id: draft.id,
    iterationId: draft.iterationId,
    name: draft.name,
    status: draft.status,
    figmaUrl: draft.figmaUrl,
    thumbnailUrl: draft.thumbnailUrl,
    assigneeId: draft.assigneeId,
    assigneeName: opts.assigneeName ?? opts.assignee?.name ?? null,
    assignee: opts.assignee ?? null,
    changeLog: draft.changeLog,
    lockedAt: draft.lockedAt ? draft.lockedAt.getTime() : null,
    lockedBy: opts.lockedBy ?? null,
    createdById: draft.createdById,
    createdBy: opts.createdBy ?? null,
    // ===== 双通道 + 创建人确认（新字段） =====
    sourceType: draft.sourceType,
    sourceFeedPackage: opts.sourceFeedPackage ?? null,
    confirmedAt: draft.confirmedAt ? draft.confirmedAt.getTime() : null,
    confirmedBy: opts.confirmedBy ?? null,
    createdAt: draft.createdAt.getTime(),
    updatedAt: draft.updatedAt.getTime(),
  }
}

// ========== List Designs ==========

export async function listDesigns(query: {
  page: number
  pageSize: number
  skip: number
  iterationId?: string
  status?: string
  sourceType?: string
  assigneeId?: string
  createdById?: string
}) {
  const where: Prisma.DesignDraftWhereInput = {
    deletedAt: null,
  }

  if (query.iterationId) {
    where.iterationId = query.iterationId
  }

  if (query.status) {
    where.status = query.status as DesignStatus
  }

  if (query.sourceType) {
    where.sourceType = query.sourceType as DesignSourceType
  }

  if (query.assigneeId) {
    where.assigneeId = query.assigneeId
  }

  if (query.createdById) {
    where.createdById = query.createdById
  }

  const [items, total] = await Promise.all([
    prisma.designDraft.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: query.skip,
      take: query.pageSize,
      include: {
        sourceFeedPackage: { select: { id: true, name: true, iterationId: true } },
      },
    }),
    prisma.designDraft.count({ where }),
  ])

  // 批量拉用户（assignee + lockedBy + createdBy + confirmedBy）
  const userIds = new Set<string>()
  for (const i of items) {
    if (i.assigneeId) userIds.add(i.assigneeId)
    if (i.lockedById) userIds.add(i.lockedById)
    if (i.createdById) userIds.add(i.createdById)
    if (i.confirmedById) userIds.add(i.confirmedById)
  }
  const userMap = await getUserBriefMap([...userIds])

  const responseItems = items.map((item) => {
    return toDesignResponse(item, {
      assignee: item.assigneeId ? userMap.get(item.assigneeId) ?? null : null,
      lockedBy: item.lockedById ? userMap.get(item.lockedById) ?? null : null,
      createdBy: item.createdById ? userMap.get(item.createdById) ?? null : null,
      confirmedBy: item.confirmedById ? userMap.get(item.confirmedById) ?? null : null,
      sourceFeedPackage: item.sourceFeedPackage,
    })
  })

  return { items: responseItems, total }
}

// ========== Create Design Draft（手动添加） ==========
// 注意：FEED_PUSH 场景不走这里，由 feed.service 的 pushToDesign 直接创建
//
// 业务约束：手动添加必须指派给一位设计师（assigneeId 必填），否则任务会成孤儿
// —— 没人能在"我的任务"里看到它，流程会在这里断掉。

export async function createDesignDraft(
  userId: string,
  data: {
    iterationId: string
    name: string
    figmaUrl?: string
    assigneeId: string // 必填：手动添加必须指派给设计师
  },
) {
  if (!data.assigneeId) {
    throw new AppError(
      ErrorCodes.MISSING_REQUIRED_FIELD,
      '手动添加的设计任务必须指派给一位设计师',
    )
  }

  // 验证指派对象存在且是设计师
  const assignee = await prisma.user.findUnique({
    where: { id: data.assigneeId },
    select: { id: true, name: true, role: true, deletedAt: true },
  })
  if (!assignee || assignee.deletedAt) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '指定的设计师不存在', 404)
  }
  if (assignee.role !== 'DESIGNER' && assignee.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `指派对象 ${assignee.name} 不是设计师`,
    )
  }

  // 手动任务起点状态：PENDING_REFINE（设计师的 queue）
  const draft = await prisma.designDraft.create({
    data: {
      iterationId: data.iterationId,
      name: data.name,
      figmaUrl: data.figmaUrl ?? null,
      assigneeId: data.assigneeId,
      status: 'PENDING_REFINE',
      sourceType: 'MANUAL',
      createdById: userId,
    },
  })

  const assigneeBrief = await getUserBrief(draft.assigneeId!)
  const createdBy = await getUserBrief(userId)
  return toDesignResponse(draft, { assignee: assigneeBrief, createdBy })
}

// ========== Get Design Detail ==========

export async function getDesignDetail(draftId: string) {
  const draft = await prisma.designDraft.findUnique({
    where: { id: draftId },
    include: {
      sourceFeedPackage: { select: { id: true, name: true, iterationId: true } },
    },
  })

  if (!draft || draft.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, 'Design draft not found', 404)
  }

  const assignee = draft.assigneeId ? await getUserBrief(draft.assigneeId) : null
  const lockedBy = draft.lockedById ? await getUserBrief(draft.lockedById) : null
  const createdBy = await getUserBrief(draft.createdById)
  const confirmedBy = draft.confirmedById ? await getUserBrief(draft.confirmedById) : null

  return toDesignResponse(draft, {
    assignee,
    lockedBy,
    createdBy,
    confirmedBy,
    sourceFeedPackage: draft.sourceFeedPackage,
  })
}

// ========== Update Design Draft ==========

export async function updateDesignDraft(
  draftId: string,
  data: {
    name?: string
    figmaUrl?: string
    assigneeId?: string
    changeLog?: string
  },
) {
  const existing = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, 'Design draft not found', 404)
  }

  if (existing.status === 'LOCKED') {
    throw new AppError(ErrorCodes.DESIGN_LOCKED, 'Cannot modify a locked design', 403)
  }

  const updateData: Prisma.DesignDraftUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.figmaUrl !== undefined) updateData.figmaUrl = data.figmaUrl
  if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId
  if (data.changeLog !== undefined) updateData.changeLog = data.changeLog

  const draft = await prisma.designDraft.update({
    where: { id: draftId },
    data: updateData,
  })

  const assignee = draft.assigneeId ? await getUserBrief(draft.assigneeId) : null
  const lockedBy = draft.lockedById ? await getUserBrief(draft.lockedById) : null
  const createdBy = await getUserBrief(draft.createdById)

  return toDesignResponse(draft, { assignee, lockedBy, createdBy })
}

// ========== Soft Delete Design ==========

export async function deleteDesignDraft(draftId: string) {
  const existing = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, 'Design draft not found', 404)
  }

  if (existing.status === 'LOCKED') {
    throw new AppError(ErrorCodes.DESIGN_LOCKED, 'Cannot delete a locked design', 403)
  }

  await prisma.designDraft.update({
    where: { id: draftId },
    data: { deletedAt: new Date() },
  })
}

// ========== Change Status ==========

export async function changeDesignStatus(
  draftId: string,
  userId: string,
  data: {
    status: string
    changeLog?: string
  },
) {
  const existing = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, 'Design draft not found', 404)
  }

  const allowedTransitions = VALID_TRANSITIONS[existing.status] ?? []
  if (!allowedTransitions.includes(data.status)) {
    throw new AppError(
      ErrorCodes.DESIGN_INVALID_TRANSITION,
      `Cannot transition from ${existing.status} to ${data.status}`,
    )
  }

  // Record history and update in a transaction
  const [draft] = await prisma.$transaction([
    prisma.designDraft.update({
      where: { id: draftId },
      data: {
        status: data.status as DesignStatus,
        changeLog: data.changeLog ?? existing.changeLog,
      },
    }),
    prisma.designHistory.create({
      data: {
        draftId,
        fromStatus: existing.status,
        toStatus: data.status as DesignStatus,
        changeLog: data.changeLog ?? null,
        changedById: userId,
      },
    }),
  ])

  const assignee = draft.assigneeId ? await getUserBrief(draft.assigneeId) : null
  const lockedBy = draft.lockedById ? await getUserBrief(draft.lockedById) : null
  const createdBy = await getUserBrief(draft.createdById)

  return toDesignResponse(draft, { assignee, lockedBy, createdBy })
}

// ========== Lock Design ==========

export async function lockDesign(draftId: string, userId: string, userRole: string) {
  if (userRole !== 'ADMIN' && userRole !== 'ARCHITECT') {
    throw new AppError(ErrorCodes.DESIGN_UNLOCK_PERMISSION, 'Only ADMIN or ARCHITECT can lock designs', 403)
  }

  const existing = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, 'Design draft not found', 404)
  }

  if (existing.status !== 'CONFIRMED') {
    throw new AppError(
      ErrorCodes.DESIGN_INVALID_TRANSITION,
      `Cannot lock a design in ${existing.status} status, must be CONFIRMED`,
    )
  }

  const now = new Date()

  const [draft] = await prisma.$transaction([
    prisma.designDraft.update({
      where: { id: draftId },
      data: {
        status: 'LOCKED',
        lockedAt: now,
        lockedById: userId,
      },
    }),
    prisma.designHistory.create({
      data: {
        draftId,
        fromStatus: existing.status,
        toStatus: 'LOCKED',
        changeLog: 'Design locked',
        changedById: userId,
      },
    }),
  ])

  const assignee = draft.assigneeId ? await getUserBrief(draft.assigneeId) : null
  const lockedBy = await getUserBrief(userId)
  const createdBy = await getUserBrief(draft.createdById)

  return toDesignResponse(draft, { assignee, lockedBy, createdBy })
}

// ========== Unlock Design ==========

export async function unlockDesign(draftId: string, userId: string, userRole: string, reason: string) {
  if (userRole !== 'ADMIN' && userRole !== 'ARCHITECT') {
    throw new AppError(ErrorCodes.DESIGN_UNLOCK_PERMISSION, 'Only ADMIN or ARCHITECT can unlock designs', 403)
  }

  const existing = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, 'Design draft not found', 404)
  }

  if (existing.status !== 'LOCKED') {
    throw new AppError(
      ErrorCodes.DESIGN_INVALID_TRANSITION,
      `Cannot unlock a design in ${existing.status} status, must be LOCKED`,
    )
  }

  const [draft] = await prisma.$transaction([
    prisma.designDraft.update({
      where: { id: draftId },
      data: {
        status: 'PENDING_REFINE',
        lockedAt: null,
        lockedById: null,
      },
    }),
    prisma.designHistory.create({
      data: {
        draftId,
        fromStatus: 'LOCKED',
        toStatus: 'PENDING_REFINE',
        changeLog: `Unlock reason: ${reason}`,
        changedById: userId,
      },
    }),
  ])

  const assignee = draft.assigneeId ? await getUserBrief(draft.assigneeId) : null
  const createdBy = await getUserBrief(draft.createdById)

  return toDesignResponse(draft, { assignee, createdBy })
}

// ========================================================================
// 手动设计任务专用：设计师完成 → 创建人确认
// ========================================================================

/**
 * 设计师标记手动任务完成 → 推给创建人确认
 */
export async function completeDesign(draftId: string, userId: string) {
  const existing = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, '设计任务不存在', 404)
  }
  if (existing.sourceType !== 'MANUAL') {
    throw new AppError(
      ErrorCodes.DESIGN_INVALID_TRANSITION,
      '只有手动添加的设计任务才走"完成 → 创建人确认"流程。工作台推送的任务请用"审核通过/驳回"',
    )
  }
  if (existing.status !== 'PENDING_REFINE' && existing.status !== 'REFINING') {
    throw new AppError(
      ErrorCodes.DESIGN_INVALID_TRANSITION,
      `当前状态 ${existing.status} 不允许标记完成`,
    )
  }
  // 防御：如果由于历史数据原因 assigneeId 为空，拒绝操作
  // （createDesignDraft 已强制必填，但老数据可能有缺失）
  if (!existing.assigneeId) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      '该任务未指派负责人，无法标记完成。请先指派设计师。',
    )
  }
  if (existing.assigneeId !== userId) {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有被指派的设计师才能点"完成"',
      403,
    )
  }

  const [draft] = await prisma.$transaction([
    prisma.designDraft.update({
      where: { id: draftId },
      data: { status: 'PENDING_CONFIRM' },
    }),
    prisma.designHistory.create({
      data: {
        draftId,
        fromStatus: existing.status,
        toStatus: 'PENDING_CONFIRM',
        changeLog: '设计师完成工作，等待创建人确认',
        changedById: userId,
      },
    }),
  ])

  const assignee = draft.assigneeId ? await getUserBrief(draft.assigneeId) : null
  const createdBy = await getUserBrief(draft.createdById)
  return toDesignResponse(draft, { assignee, createdBy })
}

/**
 * 创建人确认手动任务完成 → 流程结束
 */
export async function confirmDesign(draftId: string, userId: string) {
  const existing = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, '设计任务不存在', 404)
  }
  if (existing.sourceType !== 'MANUAL') {
    throw new AppError(
      ErrorCodes.DESIGN_INVALID_TRANSITION,
      '只有手动添加的设计任务才走创建人确认流程',
    )
  }
  if (existing.status !== 'PENDING_CONFIRM') {
    throw new AppError(
      ErrorCodes.DESIGN_INVALID_TRANSITION,
      `当前状态 ${existing.status} 无法确认，请先让设计师点"完成"`,
    )
  }
  if (existing.createdById !== userId) {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有任务创建人才能执行确认',
      403,
    )
  }

  const now = new Date()
  const [draft] = await prisma.$transaction([
    prisma.designDraft.update({
      where: { id: draftId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: now,
        confirmedById: userId,
      },
    }),
    prisma.designHistory.create({
      data: {
        draftId,
        fromStatus: 'PENDING_CONFIRM',
        toStatus: 'CONFIRMED',
        changeLog: '创建人确认完成，流程结束',
        changedById: userId,
      },
    }),
  ])

  const assignee = draft.assigneeId ? await getUserBrief(draft.assigneeId) : null
  const createdBy = await getUserBrief(draft.createdById)
  const confirmedBy = await getUserBrief(userId)
  return toDesignResponse(draft, { assignee, createdBy, confirmedBy })
}

// ========== Get Status History ==========

export async function getDesignHistory(draftId: string) {
  const draft = await prisma.designDraft.findUnique({ where: { id: draftId } })
  if (!draft || draft.deletedAt) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, 'Design draft not found', 404)
  }

  const histories = await prisma.designHistory.findMany({
    where: { draftId },
    orderBy: { createdAt: 'desc' },
  })

  const userIds = [...new Set(histories.map((h) => h.changedById))]
  const userMap = await getUserBriefMap(userIds)

  return histories.map((h) => {
    const changedBy = userMap.get(h.changedById) ?? {
      id: h.changedById,
      name: 'Unknown',
      email: '',
      role: 'DESIGNER' as const,
      avatar: null,
      legacyRoles: [],
    }
    return {
      id: h.id,
      draftId: h.draftId,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changeLog: h.changeLog,
      changedBy,
      createdAt: h.createdAt.getTime(),
    }
  })
}
