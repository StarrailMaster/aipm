import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { Prisma, FeedPackage as PrismaFeedPackage, FeedFile as PrismaFeedFile, ExecutionRecord as PrismaExecutionRecord } from '@prisma/client'
import { ensureCanWriteFeed } from './permission'

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

function toFeedFileResponse(file: PrismaFeedFile) {
  return {
    id: file.id,
    name: file.name,
    content: file.content,
    layer: file.layer as 'core' | 'context',
  }
}

function toFeedPackageResponse(
  pkg: PrismaFeedPackage & { files?: PrismaFeedFile[] },
  createdBy: UserBriefRow,
  designReviewer?: UserBriefRow | null,
) {
  const files = pkg.files ?? []
  return {
    id: pkg.id,
    iterationId: pkg.iterationId,
    name: pkg.name,
    phase: pkg.phase,
    status: pkg.status,
    promptId: pkg.promptId,
    coreFiles: files.filter((f) => f.layer === 'core').map(toFeedFileResponse),
    contextFiles: files.filter((f) => f.layer === 'context').map(toFeedFileResponse),
    dependsOn: pkg.dependsOn,
    canParallel: pkg.canParallel,
    assigneeId: pkg.assigneeId,
    sortOrder: pkg.sortOrder,
    // ===== 设计审核流转字段 =====
    designOutputRequired: pkg.designOutputRequired,
    figmaUrl: pkg.figmaUrl,
    designReviewStatus: pkg.designReviewStatus,
    designReviewerId: pkg.designReviewerId,
    designReviewer: designReviewer ?? null,
    designDraftId: pkg.designDraftId,
    createdBy,
    createdAt: pkg.createdAt.getTime(),
    updatedAt: pkg.updatedAt.getTime(),
  }
}

function toExecutionResponse(
  record: PrismaExecutionRecord,
  executedBy: UserBriefRow,
) {
  return {
    id: record.id,
    feedPackageId: record.feedPackageId,
    executedBy,
    aiTool: record.aiTool,
    outputSummary: record.outputSummary,
    issues: record.issues,
    executedAt: record.executedAt.getTime(),
  }
}

// ========== List Feed Packages ==========

export async function listFeedPackages(query: {
  page: number
  pageSize: number
  skip: number
  iterationId?: string
  phase?: string
  status?: string
  search?: string
}) {
  const where: Prisma.FeedPackageWhereInput = {
    deletedAt: null,
  }

  if (query.iterationId) {
    where.iterationId = query.iterationId
  }

  if (query.phase) {
    where.phase = query.phase as Prisma.EnumFeedPhaseFilter
  }

  if (query.status) {
    where.status = query.status as Prisma.EnumFeedStatusFilter
  }

  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' }
  }

  const [items, total] = await Promise.all([
    prisma.feedPackage.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: query.skip,
      take: query.pageSize,
      include: { files: true },
    }),
    prisma.feedPackage.count({ where }),
  ])

  // Get all unique user IDs (创建人 + 设计审核人)
  const userIds = new Set<string>()
  for (const i of items) {
    userIds.add(i.createdById)
    if (i.designReviewerId) userIds.add(i.designReviewerId)
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
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
    const reviewer = item.designReviewerId ? userMap.get(item.designReviewerId) ?? null : null
    return toFeedPackageResponse(item, creator, reviewer)
  })

  return { items: responseItems, total }
}

// ========== Create Feed Package ==========

export async function createFeedPackage(
  userId: string,
  data: {
    iterationId: string
    name: string
    phase: string
    promptId?: string
    dependsOn?: string[]
    canParallel?: boolean
    designOutputRequired?: boolean
  },
) {
  // Determine initial status based on dependencies
  let initialStatus: 'PENDING' | 'BLOCKED' = 'PENDING'
  if (data.dependsOn && data.dependsOn.length > 0) {
    const depPackages = await prisma.feedPackage.findMany({
      where: { id: { in: data.dependsOn }, deletedAt: null },
      select: { id: true, status: true },
    })
    const allDone = depPackages.length === data.dependsOn.length &&
      depPackages.every((d) => d.status === 'DONE')
    if (!allDone) {
      initialStatus = 'BLOCKED'
    }
  }

  // Get max sort order for this iteration
  const maxSort = await prisma.feedPackage.aggregate({
    where: { iterationId: data.iterationId, deletedAt: null },
    _max: { sortOrder: true },
  })

  const pkg = await prisma.feedPackage.create({
    data: {
      iterationId: data.iterationId,
      name: data.name,
      phase: data.phase as PrismaFeedPackage['phase'],
      status: initialStatus,
      promptId: data.promptId ?? null,
      dependsOn: data.dependsOn ?? [],
      canParallel: data.canParallel ?? true,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      createdById: userId,
      designOutputRequired: data.designOutputRequired ?? false,
    },
    include: { files: true },
  })

  const creator = await getUserBrief(userId)
  return toFeedPackageResponse(pkg, creator)
}

// ========== Get Feed Package Detail ==========

export async function getFeedPackageDetail(id: string) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id },
    include: {
      files: true,
      executions: { orderBy: { executedAt: 'desc' } },
    },
  })

  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  const creator = await getUserBrief(pkg.createdById)
  const reviewer = pkg.designReviewerId ? await getUserBrief(pkg.designReviewerId) : null

  // Get execution user info
  const execUserIds = [...new Set(pkg.executions.map((e) => e.executedById))]
  const execUsers = await prisma.user.findMany({
    where: { id: { in: execUserIds } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const execUserMap = new Map(execUsers.map((u) => [u.id, u]))

  const executions = pkg.executions.map((e) => {
    const executedBy = execUserMap.get(e.executedById) ?? {
      id: e.executedById,
      name: 'Unknown',
      email: '',
      role: 'DESIGNER' as const,
      avatar: null,
      legacyRoles: [],
    }
    return toExecutionResponse(e, executedBy)
  })

  return {
    ...toFeedPackageResponse(pkg, creator, reviewer),
    executions,
  }
}

// ========== Update Feed Package ==========

export async function updateFeedPackage(
  id: string,
  data: {
    name?: string
    phase?: string
    promptId?: string
    dependsOn?: string[]
    canParallel?: boolean
    assigneeId?: string
    sortOrder?: number
    designOutputRequired?: boolean
  },
) {
  const existing = await prisma.feedPackage.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  const updateData: Prisma.FeedPackageUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.phase !== undefined) updateData.phase = data.phase as PrismaFeedPackage['phase']
  if (data.promptId !== undefined) updateData.promptId = data.promptId
  if (data.dependsOn !== undefined) updateData.dependsOn = data.dependsOn
  if (data.canParallel !== undefined) updateData.canParallel = data.canParallel
  if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
  if (data.designOutputRequired !== undefined) {
    updateData.designOutputRequired = data.designOutputRequired
    // 如果从 required=true 改回 false 且当前未进入审核流程，重置审核状态
    if (!data.designOutputRequired && existing.designReviewStatus === 'NOT_REQUIRED') {
      // no-op，保持 NOT_REQUIRED
    } else if (!data.designOutputRequired && existing.designReviewStatus !== 'NOT_REQUIRED') {
      // 从有审核改为无审核 → 强制取消审核流程
      updateData.designReviewStatus = 'NOT_REQUIRED'
      updateData.designReviewerId = null
      updateData.figmaUrl = null
    }
  }

  const pkg = await prisma.feedPackage.update({
    where: { id },
    data: updateData,
    include: { files: true },
  })

  // Recalculate BLOCKED status if dependencies changed
  if (data.dependsOn !== undefined) {
    await recalculateBlockedStatus(id)
  }

  const updated = await prisma.feedPackage.findUnique({
    where: { id },
    include: { files: true },
  })

  const creator = await getUserBrief(pkg.createdById)
  const reviewer = updated?.designReviewerId ? await getUserBrief(updated.designReviewerId) : null
  return toFeedPackageResponse(updated!, creator, reviewer)
}

// ========== Delete Feed Package (soft) ==========

export async function deleteFeedPackage(id: string) {
  const existing = await prisma.feedPackage.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  await prisma.feedPackage.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ========== Add File ==========

export async function addFile(
  feedPackageId: string,
  data: { name: string; content: string; layer: string },
) {
  const pkg = await prisma.feedPackage.findUnique({ where: { id: feedPackageId } })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  const file = await prisma.feedFile.create({
    data: {
      feedPackageId,
      name: data.name,
      content: data.content,
      layer: data.layer,
    },
  })

  return toFeedFileResponse(file)
}

// ========== Update File ==========

export async function updateFile(
  feedPackageId: string,
  fileId: string,
  data: { name?: string; content?: string },
) {
  const file = await prisma.feedFile.findUnique({ where: { id: fileId } })
  if (!file || file.feedPackageId !== feedPackageId) {
    throw new AppError(ErrorCodes.FEED_FILE_NOT_FOUND, 'Feed file not found', 404)
  }

  const updateData: Prisma.FeedFileUpdateInput = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.content !== undefined) updateData.content = data.content

  const updated = await prisma.feedFile.update({
    where: { id: fileId },
    data: updateData,
  })

  return toFeedFileResponse(updated)
}

// ========== Delete File ==========

export async function deleteFile(feedPackageId: string, fileId: string) {
  const file = await prisma.feedFile.findUnique({ where: { id: fileId } })
  if (!file || file.feedPackageId !== feedPackageId) {
    throw new AppError(ErrorCodes.FEED_FILE_NOT_FOUND, 'Feed file not found', 404)
  }

  await prisma.feedFile.delete({ where: { id: fileId } })
}

// ========== Update Status ==========

export async function updateStatus(
  id: string,
  newStatus: string,
  actor: { userId: string; role: string },
) {
  await ensureCanWriteFeed(id, actor.userId, actor.role, '修改工作台包状态')

  const pkg = await prisma.feedPackage.findUnique({ where: { id } })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  // Validate status transition
  const validTransitions: Record<string, string[]> = {
    BLOCKED: ['PENDING'],
    PENDING: ['IN_PROGRESS', 'BLOCKED'],
    IN_PROGRESS: ['REVIEW', 'REWORK', 'PENDING'],
    REVIEW: ['DONE', 'REWORK'],
    DONE: ['REWORK'],
    REWORK: ['IN_PROGRESS', 'PENDING'],
  }

  const allowed = validTransitions[pkg.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new AppError(
      ErrorCodes.FEED_INVALID_STATUS_TRANSITION,
      `Cannot transition from ${pkg.status} to ${newStatus}`,
    )
  }

  // ===== 流程闭环 Gate：要求产出设计图的工作台包，必须审核通过才能完成 =====
  if (
    (newStatus === 'DONE' || newStatus === 'REVIEW') &&
    pkg.designOutputRequired &&
    pkg.designReviewStatus !== 'APPROVED'
  ) {
    const hint =
      pkg.designReviewStatus === 'NOT_REQUIRED'
        ? '请先点"推给设计"提交 Figma 文件'
        : pkg.designReviewStatus === 'PENDING_REVIEW'
          ? '设计师还未审核，请耐心等待'
          : pkg.designReviewStatus === 'REJECTED'
            ? '设计被驳回，请修改 Figma 后重新提交'
            : '设计审核状态异常'
    throw new AppError(
      ErrorCodes.FEED_INVALID_STATUS_TRANSITION,
      `该工作台包需要产出设计图，必须等设计审核通过才能完成。${hint}`,
    )
  }

  // If transitioning to IN_PROGRESS, check dependencies
  if (newStatus === 'IN_PROGRESS' && pkg.dependsOn.length > 0) {
    const deps = await prisma.feedPackage.findMany({
      where: { id: { in: pkg.dependsOn }, deletedAt: null },
      select: { id: true, status: true, name: true },
    })

    const notDone = deps.filter((d) => d.status !== 'DONE')
    if (notDone.length > 0) {
      const names = notDone.map((d) => d.name).join(', ')
      throw new AppError(
        ErrorCodes.FEED_DEPENDENCY_BLOCKED,
        `Dependencies not completed: ${names}`,
      )
    }
  }

  // ===== Fix P2-7: REWORK 回退清审核状态 =====
  // 场景：用户主动把一个 APPROVED 的包退回 REWORK，需要清审核状态强制重新走审核流程
  // 约束：只清 APPROVED 的情况。REJECTED 保留（driven by rejectDesign，feed_rejected 分类还要用）。
  //
  // 注意：这个逻辑只在用户手动 updateStatus 进入 REWORK 时触发。
  //      rejectDesign 直接 prisma.update 不走这里，它的 REJECTED 状态不会被清掉。
  const updateData: Prisma.FeedPackageUpdateInput = {
    status: newStatus as PrismaFeedPackage['status'],
  }
  const shouldClearReviewOnRollback =
    newStatus === 'REWORK' &&
    pkg.designOutputRequired &&
    pkg.designReviewStatus === 'APPROVED'

  if (shouldClearReviewOnRollback) {
    updateData.designReviewStatus = 'NOT_REQUIRED'
    updateData.designReviewerId = null
    updateData.figmaUrl = null
    updateData.designDraft = { disconnect: true }

    // 软删关联的 FEED_PUSH DesignDraft（失效的设计稿）
    if (pkg.designDraftId) {
      await prisma.designDraft.updateMany({
        where: {
          id: pkg.designDraftId,
          sourceType: 'FEED_PUSH',
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      })
    }
  }

  // 注：status 变更只需回传轻量字段，无需把全量 files 拉回来（响应可能达 80KB+）
  const updated = await prisma.feedPackage.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      iterationId: true,
      status: true,
      phase: true,
      designReviewStatus: true,
      designReviewerId: true,
      figmaUrl: true,
      updatedAt: true,
    },
  })

  // When a package becomes DONE, auto-unblock downstream packages
  if (newStatus === 'DONE') {
    await unblockDownstream(id)
  }

  // Fix P3-9: 触发 iteration.status 自动流转检查
  const { autoAdvanceIterationStatus } = await import('../iteration.service')
  await autoAdvanceIterationStatus(updated.iterationId)

  return {
    id: updated.id,
    iterationId: updated.iterationId,
    status: updated.status,
    phase: updated.phase,
    designReviewStatus: updated.designReviewStatus,
    designReviewerId: updated.designReviewerId,
    figmaUrl: updated.figmaUrl,
    updatedAt: updated.updatedAt.getTime(),
  }
}

// ========== One-shot 完成 ==========

/**
 * 一键把工作台包从任意中间状态推到 DONE。
 *
 * 服务端封装的好处：
 *   1. 前端只需点一下，不用在客户端循环调 updateStatus（会让 interceptor 弹多条错误）
 *   2. 状态机跳板在事务语义下执行，过程中依赖检查、设计审核检查一次完成
 *   3. 如果 package 还没有 assignee，会自动把当前用户设为 assignee
 *
 * 允许条件：同 squad / assignee / createdBy / ADMIN。
 */
export async function completeFeed(
  feedPackageId: string,
  actor: { userId: string; role: string },
) {
  await ensureCanWriteFeed(feedPackageId, actor.userId, actor.role, '完成工作台包')

  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
  })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  if (pkg.status === 'DONE') {
    // 幂等：已经完成就直接返回
    return {
      id: pkg.id,
      iterationId: pkg.iterationId,
      status: pkg.status,
      phase: pkg.phase,
      designReviewStatus: pkg.designReviewStatus,
      designReviewerId: pkg.designReviewerId,
      figmaUrl: pkg.figmaUrl,
      assigneeId: pkg.assigneeId,
      updatedAt: pkg.updatedAt.getTime(),
      alreadyDone: true as const,
    }
  }

  // 需要产出设计图的，必须先走完审核流程
  if (pkg.designOutputRequired && pkg.designReviewStatus !== 'APPROVED') {
    const hint =
      pkg.designReviewStatus === 'NOT_REQUIRED'
        ? '请先点"推给设计"提交 Figma 文件'
        : pkg.designReviewStatus === 'PENDING_REVIEW'
          ? '设计师还未审核，请耐心等待'
          : pkg.designReviewStatus === 'REJECTED'
            ? '设计被驳回，请修改 Figma 后重新提交'
            : '设计审核状态异常'
    throw new AppError(
      ErrorCodes.FEED_INVALID_STATUS_TRANSITION,
      `该包需要产出设计图，必须等设计审核通过才能完成。${hint}`,
    )
  }

  // 检查依赖：所有 dependsOn 必须是 DONE 才能完成
  if (pkg.dependsOn.length > 0) {
    const deps = await prisma.feedPackage.findMany({
      where: { id: { in: pkg.dependsOn }, deletedAt: null },
      select: { name: true, status: true },
    })
    const notDone = deps.filter((d) => d.status !== 'DONE')
    if (notDone.length > 0) {
      throw new AppError(
        ErrorCodes.FEED_DEPENDENCY_BLOCKED,
        `前置依赖未完成：${notDone.map((d) => d.name).join('、')}`,
      )
    }
  }

  // 自动 claim + 更新到 DONE，一次性写入
  const updated = await prisma.feedPackage.update({
    where: { id: feedPackageId },
    data: {
      status: 'DONE',
      assigneeId: pkg.assigneeId ?? actor.userId,
    },
    select: {
      id: true,
      iterationId: true,
      status: true,
      phase: true,
      designReviewStatus: true,
      designReviewerId: true,
      figmaUrl: true,
      assigneeId: true,
      updatedAt: true,
    },
  })

  // 解锁下游 + 触发 iteration.status 自动流转
  await unblockDownstream(feedPackageId)
  const { autoAdvanceIterationStatus } = await import('../iteration.service')
  await autoAdvanceIterationStatus(updated.iterationId)

  return {
    id: updated.id,
    iterationId: updated.iterationId,
    status: updated.status,
    phase: updated.phase,
    designReviewStatus: updated.designReviewStatus,
    designReviewerId: updated.designReviewerId,
    figmaUrl: updated.figmaUrl,
    assigneeId: updated.assigneeId,
    updatedAt: updated.updatedAt.getTime(),
    alreadyDone: false as const,
  }
}

// ========== Claim / Release ==========

/**
 * 领取工作台包：把当前用户设为 assignee。
 * 允许条件：同 squad 成员或 ADMIN。已有 assignee 且不是自己时，拒绝（避免抢单）。
 */
export async function claimFeed(
  feedPackageId: string,
  actor: { userId: string; role: string },
) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
    select: { id: true, assigneeId: true, iterationId: true, deletedAt: true },
  })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  // 已被别人领了 → 拒绝（只有当前 assignee 自己调可以无感）
  if (pkg.assigneeId && pkg.assigneeId !== actor.userId && actor.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '这个工作台包已被他人领取，如需接管请联系原负责人或管理员',
      403,
    )
  }

  // 非 ADMIN：必须是同 squad 成员
  if (actor.role !== 'ADMIN') {
    const iter = await prisma.iteration.findUnique({
      where: { id: pkg.iterationId },
      select: { squadId: true },
    })
    const me = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { squadId: true },
    })
    if (!iter || !me?.squadId || me.squadId !== iter.squadId) {
      throw new AppError(
        ErrorCodes.PERMISSION_DENIED,
        '只能领取自己所在小组的工作台包',
        403,
      )
    }
  }

  const updated = await prisma.feedPackage.update({
    where: { id: feedPackageId },
    data: { assigneeId: actor.userId },
    select: { id: true, assigneeId: true, updatedAt: true },
  })

  return {
    id: updated.id,
    assigneeId: updated.assigneeId,
    updatedAt: updated.updatedAt.getTime(),
  }
}

/**
 * 释放工作台包：清空 assigneeId。
 * 只能是当前 assignee 自己或 ADMIN 操作。
 */
export async function releaseFeed(
  feedPackageId: string,
  actor: { userId: string; role: string },
) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
    select: { id: true, assigneeId: true, deletedAt: true },
  })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  if (pkg.assigneeId !== actor.userId && actor.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有当前负责人或管理员才能释放这个工作台包',
      403,
    )
  }

  const updated = await prisma.feedPackage.update({
    where: { id: feedPackageId },
    data: { assigneeId: null },
    select: { id: true, assigneeId: true, updatedAt: true },
  })

  return {
    id: updated.id,
    assigneeId: updated.assigneeId,
    updatedAt: updated.updatedAt.getTime(),
  }
}

// ========== Record Execution ==========

export async function recordExecution(
  feedPackageId: string,
  actor: { userId: string; role: string },
  data: { aiTool: string; outputSummary: string; issues?: string },
) {
  await ensureCanWriteFeed(feedPackageId, actor.userId, actor.role, '记录执行结果')

  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
    select: { id: true, deletedAt: true },
  })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  const record = await prisma.executionRecord.create({
    data: {
      feedPackageId,
      executedById: actor.userId,
      aiTool: data.aiTool,
      outputSummary: data.outputSummary,
      issues: data.issues ?? null,
    },
  })

  const executedBy = await getUserBrief(actor.userId)
  return toExecutionResponse(record, executedBy)
}

// ========== Assemble Feed Package ==========

export async function assembleFeedPackage(id: string) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id },
    include: { files: true },
  })

  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  const sections: string[] = []

  // Section 1: Package header
  sections.push(`# 投喂包: ${pkg.name}`)
  sections.push(`Phase: ${pkg.phase} | Status: ${pkg.status}`)
  sections.push('')

  // Section 2: Prompt content (public layer)
  if (pkg.promptId) {
    const prompt = await prisma.prompt.findUnique({
      where: { id: pkg.promptId },
      select: { name: true, content: true },
    })
    if (prompt) {
      sections.push('## 公开层 - 关联提示词')
      sections.push(`### ${prompt.name}`)
      sections.push(prompt.content)
      sections.push('')
    }
  }

  // Section 3: Core files
  const coreFiles = pkg.files.filter((f) => f.layer === 'core')
  if (coreFiles.length > 0) {
    sections.push('## 核心层')
    for (const file of coreFiles) {
      sections.push(`### ${file.name}`)
      sections.push(file.content)
      sections.push('')
    }
  }

  // Section 4: Context files
  const contextFiles = pkg.files.filter((f) => f.layer === 'context')
  if (contextFiles.length > 0) {
    sections.push('## 上下文层')
    for (const file of contextFiles) {
      sections.push(`### ${file.name}`)
      sections.push(file.content)
      sections.push('')
    }
  }

  return {
    feedPackageId: id,
    feedPackageName: pkg.name,
    assembledContent: sections.join('\n'),
  }
}

// ========== Dependency Graph ==========

export async function getDependencyGraph(iterationId: string) {
  const packages = await prisma.feedPackage.findMany({
    where: { iterationId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      phase: true,
      status: true,
      dependsOn: true,
      canParallel: true,
      sortOrder: true,
    },
  })

  // Build nodes and edges
  const nodes = packages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    phase: pkg.phase,
    status: pkg.status,
    canParallel: pkg.canParallel,
    sortOrder: pkg.sortOrder,
  }))

  const edges: Array<{ from: string; to: string }> = []
  for (const pkg of packages) {
    for (const depId of pkg.dependsOn) {
      edges.push({ from: depId, to: pkg.id })
    }
  }

  return { nodes, edges }
}

// ========== Internal Helpers ==========

async function recalculateBlockedStatus(id: string) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id },
    select: { id: true, status: true, dependsOn: true },
  })
  if (!pkg) return

  if (pkg.dependsOn.length === 0) {
    // No dependencies, ensure not blocked
    if (pkg.status === 'BLOCKED') {
      await prisma.feedPackage.update({
        where: { id },
        data: { status: 'PENDING' },
      })
    }
    return
  }

  const deps = await prisma.feedPackage.findMany({
    where: { id: { in: pkg.dependsOn }, deletedAt: null },
    select: { status: true },
  })

  const allDone = deps.length === pkg.dependsOn.length && deps.every((d) => d.status === 'DONE')

  if (allDone && pkg.status === 'BLOCKED') {
    await prisma.feedPackage.update({
      where: { id },
      data: { status: 'PENDING' },
    })
  } else if (!allDone && (pkg.status === 'PENDING' || pkg.status === 'BLOCKED')) {
    await prisma.feedPackage.update({
      where: { id },
      data: { status: 'BLOCKED' },
    })
  }
}

// ========== 点赞 / 点踩 ==========

export async function rateFeedPackage(id: string, type: 'up' | 'down') {
  const pkg = await prisma.feedPackage.findUnique({ where: { id } })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, 'Feed package not found', 404)
  }

  const updated = await prisma.feedPackage.update({
    where: { id },
    data: type === 'up' ? { thumbsUp: { increment: 1 } } : { thumbsDown: { increment: 1 } },
  })

  return {
    id: updated.id,
    thumbsUp: updated.thumbsUp,
    thumbsDown: updated.thumbsDown,
  }
}

// ========== 按项目获取投喂包（含任务分组） ==========

export async function listFeedsByProject(projectId: string) {
  // Get all iterations for this project
  const iterations = await prisma.iteration.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, squadId: true },
  })

  const iterationIds = iterations.map((i) => i.id)
  if (iterationIds.length === 0) return []

  // Get all feed packages for these iterations
  // 按 sortOrder（即"第 N 轮"）升序，sortOrder 相同再按创建时间升序
  const packages = await prisma.feedPackage.findMany({
    where: { iterationId: { in: iterationIds }, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      files: { select: { id: true, name: true, layer: true } },
    },
  })

  // FeedPackage 没在 schema 里建到 User 的关系，手动按 assigneeId 批量查 User
  const assigneeIds = Array.from(
    new Set(
      packages
        .map((p) => p.assigneeId)
        .filter((id): id is string => id !== null),
    ),
  )
  const assigneeMap = new Map<
    string,
    {
      id: string
      name: string
      email: string
      role: string
      avatar: string | null
      legacyRoles: string[]
    }
  >()
  if (assigneeIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        legacyRoles: true,
      },
    })
    for (const u of users) assigneeMap.set(u.id, u)
  }

  // Group by iteration；round 字段 = 在同一 iteration 内的 1-based 序号
  return iterations.map((iter) => {
    const iterPackages = packages.filter((p) => p.iterationId === iter.id)
    return {
      iterationId: iter.id,
      iterationName: iter.name,
      iterationStatus: iter.status,
      // 附带 squadId 让前端判断"这个任务是不是我所在组的"
      squadId: iter.squadId,
      packages: iterPackages.map((p, idx) => ({
        id: p.id,
        name: p.name,
        phase: p.phase,
        status: p.status,
        round: idx + 1, // 1-based 轮次序号
        thumbsUp: p.thumbsUp,
        thumbsDown: p.thumbsDown,
        fileCount: p.files.length,
        designReviewStatus: p.designReviewStatus, // Req 4.2: 用于前端显示"被驳回"红标
        // 前端据此显示"我的"徽章、隐藏不相关的状态按钮
        assigneeId: p.assigneeId,
        assignee: p.assigneeId ? (assigneeMap.get(p.assigneeId) ?? null) : null,
        designReviewerId: p.designReviewerId,
        createdAt: p.createdAt.getTime(),
      })),
    }
  })
}

async function unblockDownstream(completedId: string) {
  // Find all packages that depend on this completed package
  const downstream = await prisma.feedPackage.findMany({
    where: {
      dependsOn: { has: completedId },
      deletedAt: null,
      status: 'BLOCKED',
    },
    select: { id: true, dependsOn: true },
  })

  for (const pkg of downstream) {
    // Check if all dependencies are now DONE
    const deps = await prisma.feedPackage.findMany({
      where: { id: { in: pkg.dependsOn }, deletedAt: null },
      select: { status: true },
    })

    const allDone = deps.length === pkg.dependsOn.length && deps.every((d) => d.status === 'DONE')
    if (allDone) {
      await prisma.feedPackage.update({
        where: { id: pkg.id },
        data: { status: 'PENDING' },
      })
    }
  }
}

// ========================================================================
// 设计审核流转：推给设计 → 审核通过 / 驳回
// ========================================================================
//
// 流程：
//   1. 实施工程师完成这一轮的 Figma 产出
//   2. 调 pushToDesign(feedPkgId, { figmaUrl, designerId })
//      → 创建/更新 DesignDraft(sourceType=FEED_PUSH, assigneeId=designer)
//      → FeedPackage.designReviewStatus = PENDING_REVIEW
//   3. 设计师在"我的任务"里看到，点进去审核
//   4. 通过：approveDesign(feedPkgId)
//      → FeedPackage.designReviewStatus = APPROVED
//      → DesignDraft.status = CONFIRMED
//      → 相关人员可以把这一轮 updateStatus(DONE) 了（DONE gate 已通过）
//   5. 驳回：rejectDesign(feedPkgId, reason)
//      → FeedPackage.designReviewStatus = REJECTED
//      → DesignDraft.status = PENDING_REFINE + changeLog 追加驳回原因
//      → 实施工程师在"我的任务"里看到，修改 figmaUrl 后重新调 pushToDesign
// ========================================================================

/**
 * 推给设计审核（首次提交 / 驳回后重新提交 都走这个）
 *
 * 权限：必须是工作台包的 assignee / 创建人，或 ADMIN
 *
 * 副作用：
 *   - DesignDraft: 创建或复用一个 sourceType=FEED_PUSH 的草稿，状态 PENDING_REFINE
 *   - FeedPackage.designReviewStatus → PENDING_REVIEW
 *   - FeedPackage.status → REVIEW（进入"等审核"阶段，从 feed_implement 列表自动消失）
 */
export async function pushToDesign(
  feedPackageId: string,
  userId: string,
  userRole: string,
  data: { figmaUrl: string; designerId: string },
) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
    include: { files: true },
  })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, '工作台包不存在', 404)
  }

  // 权限校验：必须是 assignee / createdBy / ADMIN
  if (
    pkg.assigneeId !== userId &&
    pkg.createdById !== userId &&
    userRole !== 'ADMIN'
  ) {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有工作台包的负责人或创建人才能推给设计',
      403,
    )
  }

  if (!pkg.designOutputRequired) {
    throw new AppError(
      ErrorCodes.FEED_DESIGN_NOT_REQUIRED,
      '这一轮未标记为"需要产出设计图"，不能走审核流。请先到编辑界面打开"产出设计图"开关。',
    )
  }

  if (pkg.designReviewStatus === 'APPROVED') {
    throw new AppError(
      ErrorCodes.FEED_DESIGN_ALREADY_APPROVED,
      '设计已审核通过，不能重复提交',
    )
  }

  if (!data.figmaUrl || data.figmaUrl.trim().length === 0) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '请填写 Figma 文件地址')
  }

  // 验证 designer 存在且角色合法
  const designer = await prisma.user.findUnique({
    where: { id: data.designerId },
    select: { id: true, name: true, email: true, role: true, legacyRoles: true, deletedAt: true },
  })
  if (!designer || designer.deletedAt) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, '指定的设计师不存在', 404)
  }
  if (designer.role !== 'DESIGNER' && designer.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.FEED_DESIGN_INVALID_REVIEWER,
      `只能把设计审核任务推给设计师或管理员，${designer.name} 的角色是 ${designer.role}`,
    )
  }

  // 分两种情况：首次提交 vs 驳回后重新提交
  let draftId: string

  if (pkg.designDraftId) {
    // 重新提交：复用原 DesignDraft，更新 figmaUrl / assignee / 状态
    const existingDraft = await prisma.designDraft.findUnique({
      where: { id: pkg.designDraftId },
    })
    if (!existingDraft || existingDraft.deletedAt) {
      // 原 draft 丢了，当成首次提交处理
      const newDraft = await prisma.designDraft.create({
        data: {
          iterationId: pkg.iterationId,
          name: `${pkg.name} · 设计审核`,
          status: 'PENDING_REFINE',
          figmaUrl: data.figmaUrl,
          assigneeId: data.designerId,
          sourceType: 'FEED_PUSH',
          createdById: userId,
          changeLog: '实施工程师首次提交，等待设计师审核',
        },
      })
      draftId = newDraft.id
    } else {
      // 真的是重新提交
      await prisma.designDraft.update({
        where: { id: existingDraft.id },
        data: {
          figmaUrl: data.figmaUrl,
          assigneeId: data.designerId,
          status: 'PENDING_REFINE',
          changeLog:
            (existingDraft.changeLog ? existingDraft.changeLog + '\n---\n' : '') +
            `[${new Date().toISOString()}] 实施工程师重新提交`,
        },
      })
      await prisma.designHistory.create({
        data: {
          draftId: existingDraft.id,
          fromStatus: existingDraft.status,
          toStatus: 'PENDING_REFINE',
          changeLog: '实施工程师重新提交（驳回后修改）',
          changedById: userId,
        },
      })
      draftId = existingDraft.id
    }
  } else {
    // 首次提交
    const newDraft = await prisma.designDraft.create({
      data: {
        iterationId: pkg.iterationId,
        name: `${pkg.name} · 设计审核`,
        status: 'PENDING_REFINE',
        figmaUrl: data.figmaUrl,
        assigneeId: data.designerId,
        sourceType: 'FEED_PUSH',
        createdById: userId,
        changeLog: '实施工程师首次提交，等待设计师审核',
      },
    })
    draftId = newDraft.id
  }

  // 更新 FeedPackage：关联 draft + 双状态同步更新
  //   - designReviewStatus → PENDING_REVIEW
  //   - status → REVIEW（从实施工程师的 feed_implement 自动消失，进入"等审核"）
  const updated = await prisma.feedPackage.update({
    where: { id: feedPackageId },
    data: {
      designDraftId: draftId,
      designReviewStatus: 'PENDING_REVIEW',
      designReviewerId: data.designerId,
      figmaUrl: data.figmaUrl,
      status: 'REVIEW',
    },
    include: { files: true },
  })

  // Fix P3-9: 触发 iteration.status 自动流转检查
  //   DESIGN → REFINE 由 pushToDesign 触发（首次进入审核期）
  const { autoAdvanceIterationStatus } = await import('../iteration.service')
  await autoAdvanceIterationStatus(updated.iterationId)

  const creator = await getUserBrief(updated.createdById)
  const reviewer = await getUserBrief(data.designerId)
  return toFeedPackageResponse(updated, creator, reviewer)
}

/**
 * 设计师审核通过
 *
 * 权限：必须是指派的 designReviewer，或 ADMIN
 *
 * 副作用：
 *   - FeedPackage.designReviewStatus → APPROVED
 *   - FeedPackage.status 保持 REVIEW（等实施工程师点"完成"从 REVIEW → DONE）
 *   - DesignDraft.status → CONFIRMED
 *
 * 注意：status 不动，审核通过后实施工程师在 getMyTasks 的 feed_implement 里
 *   会看到这个包（REVIEW + APPROVED 的组合），subtitle 显示"审核通过，可完成"
 */
export async function approveDesign(
  feedPackageId: string,
  userId: string,
  userRole: string,
) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
    include: { files: true },
  })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, '工作台包不存在', 404)
  }
  // 权限校验：必须是指派的审核人或 ADMIN
  if (pkg.designReviewerId !== userId && userRole !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有指派的设计师才能执行"审核通过"',
      403,
    )
  }
  if (pkg.designReviewStatus !== 'PENDING_REVIEW') {
    throw new AppError(
      ErrorCodes.FEED_DESIGN_NOT_PENDING,
      `当前审核状态是 ${pkg.designReviewStatus}，不能执行"审核通过"`,
    )
  }
  if (!pkg.designDraftId) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, '未找到关联的设计稿', 404)
  }

  // 更新 FeedPackage
  const updated = await prisma.feedPackage.update({
    where: { id: feedPackageId },
    data: { designReviewStatus: 'APPROVED' },
    include: { files: true },
  })

  // 更新 DesignDraft → CONFIRMED
  const existing = await prisma.designDraft.findUnique({ where: { id: pkg.designDraftId } })
  if (existing && !existing.deletedAt) {
    await prisma.designDraft.update({
      where: { id: pkg.designDraftId },
      data: {
        status: 'CONFIRMED',
        changeLog:
          (existing.changeLog ? existing.changeLog + '\n---\n' : '') +
          `[${new Date().toISOString()}] 审核通过`,
      },
    })
    await prisma.designHistory.create({
      data: {
        draftId: pkg.designDraftId,
        fromStatus: existing.status,
        toStatus: 'CONFIRMED',
        changeLog: '设计审核通过',
        changedById: userId,
      },
    })
  }

  // Fix P3-9: 触发 iteration.status 自动流转检查
  //   REFINE → IMPLEMENT 由 approveDesign 触发（当所有审核都 APPROVED 时）
  const { autoAdvanceIterationStatus } = await import('../iteration.service')
  await autoAdvanceIterationStatus(updated.iterationId)

  const creator = await getUserBrief(updated.createdById)
  const reviewer = updated.designReviewerId ? await getUserBrief(updated.designReviewerId) : null
  return toFeedPackageResponse(updated, creator, reviewer)
}

/**
 * 设计师驳回
 *
 * 权限：必须是指派的 designReviewer，或 ADMIN
 *
 * 副作用：
 *   - FeedPackage.designReviewStatus → REJECTED
 *   - FeedPackage.status → REWORK（实施工程师在 feed_rejected 看到）
 *   - DesignDraft.status → PENDING_REFINE + changeLog 追加驳回原因
 */
export async function rejectDesign(
  feedPackageId: string,
  userId: string,
  userRole: string,
  data: { reason: string },
) {
  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
    include: { files: true },
  })
  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, '工作台包不存在', 404)
  }
  // 权限校验：必须是指派的审核人或 ADMIN
  if (pkg.designReviewerId !== userId && userRole !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有指派的设计师才能执行"驳回"',
      403,
    )
  }
  if (pkg.designReviewStatus !== 'PENDING_REVIEW') {
    throw new AppError(
      ErrorCodes.FEED_DESIGN_NOT_PENDING,
      `当前审核状态是 ${pkg.designReviewStatus}，不能执行"驳回"`,
    )
  }
  if (!data.reason || data.reason.trim().length === 0) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '请填写驳回原因')
  }
  if (!pkg.designDraftId) {
    throw new AppError(ErrorCodes.DESIGN_NOT_FOUND, '未找到关联的设计稿', 404)
  }

  // 更新 FeedPackage：双状态同步
  //   - designReviewStatus → REJECTED
  //   - status → REWORK（实施工程师在 feed_rejected 里看到需要重做）
  const updated = await prisma.feedPackage.update({
    where: { id: feedPackageId },
    data: {
      designReviewStatus: 'REJECTED',
      status: 'REWORK',
    },
    include: { files: true },
  })

  // 更新 DesignDraft：状态回到 PENDING_REFINE，changeLog 追加原因
  const existing = await prisma.designDraft.findUnique({ where: { id: pkg.designDraftId } })
  if (existing && !existing.deletedAt) {
    await prisma.designDraft.update({
      where: { id: pkg.designDraftId },
      data: {
        status: 'PENDING_REFINE',
        changeLog:
          (existing.changeLog ? existing.changeLog + '\n---\n' : '') +
          `[${new Date().toISOString()}] 驳回原因：${data.reason}`,
      },
    })
    await prisma.designHistory.create({
      data: {
        draftId: pkg.designDraftId,
        fromStatus: existing.status,
        toStatus: 'PENDING_REFINE',
        changeLog: `驳回：${data.reason}`,
        changedById: userId,
      },
    })
  }

  const creator = await getUserBrief(updated.createdById)
  const reviewer = updated.designReviewerId ? await getUserBrief(updated.designReviewerId) : null
  return toFeedPackageResponse(updated, creator, reviewer)
}
