/**
 * Hypothesis service — Learning Copilot v2.0 core
 *
 * 提供：
 *   - CRUD (createHypothesis / getHypothesisDetail / listHypotheses / updateHypothesis)
 *   - 循环检测 (delegated to permission.ts)
 *   - 权限 (delegated to permission.ts)
 *   - ICE / RICE 打分（服务端自动计算 score）
 *   - Tree 查询 (subtree 构造，深度上限 20)
 *
 * 关闭 / Variants 逻辑在 close.service.ts 和 variants.service.ts 分开。
 *
 * 约束（PRD §5 + Eng Review D7 / D24）：
 *   - krId 必填
 *   - parentId 循环检测 + 深度上限 20
 *   - 已 CLOSED_* 状态的假设不允许 PUT 更新
 *   - ICE score = (impact * confidence * ease) / 10（服务端计算）
 *   - RICE score = (reach * impact * confidence) / effort（服务端计算）
 */
import type {
  Hypothesis as PrismaHypothesis,
  HypothesisStatus as PrismaHypothesisStatus,
  User as PrismaUser,
  KeyResult as PrismaKeyResult,
  HypothesisResult as PrismaHypothesisResult,
  HypothesisVariant as PrismaHypothesisVariant,
  Learning as PrismaLearning,
  Iteration as PrismaIteration,
} from '@prisma/client'
import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import { ensureCanWriteHypothesis, validateNoCycleAndDepth } from './permission'

// ============================================================
// Types
// ============================================================

type HypothesisCreateInput = {
  krId: string
  parentId?: string | null
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
  templateId?: string | null
  // Phase D.4: 允许创建时直接打 ICE/RICE 分
  iceImpact?: number
  iceConfidence?: number
  iceEase?: number
  riceReach?: number
  riceImpact?: number
  riceConfidence?: number
  riceEffort?: number
}

type HypothesisUpdateInput = {
  statement?: string
  mechanism?: string
  expectedImpact?: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
  status?: Extract<
    PrismaHypothesisStatus,
    'BACKLOG' | 'RUNNING' | 'ABANDONED'
  >
}

type ListQuery = {
  page: number
  pageSize: number
  skip: number
  krId?: string
  status?: PrismaHypothesisStatus | PrismaHypothesisStatus[]
  ownerId?: string
  mine?: boolean
  userId?: string // for mine=true 过滤
  sortBy?: 'createdAt' | 'closedAt' | 'iceScore' | 'riceScore' | 'updatedAt'
  order?: 'asc' | 'desc'
}

type HypothesisWithRelations = PrismaHypothesis & {
  owner: PrismaUser
  keyResult: PrismaKeyResult
  parent?: PrismaHypothesis | null
  children?: PrismaHypothesis[]
  iterations?: PrismaIteration[]
  result?: PrismaHypothesisResult | null
  variants?: PrismaHypothesisVariant[]
  learnings?: PrismaLearning[]
}

// ============================================================
// Mapping helpers
// ============================================================

function userBrief(user: PrismaUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    legacyRoles: user.legacyRoles,
  }
}

function hypothesisBrief(h: PrismaHypothesis & { owner: PrismaUser; keyResult: PrismaKeyResult }) {
  return {
    id: h.id,
    krId: h.krId,
    krName: h.keyResult.name,
    parentId: h.parentId,
    statement: h.statement,
    mechanism: h.mechanism,
    expectedImpact: h.expectedImpact,
    expectedImpactValue: h.expectedImpactValue,
    expectedImpactUnit: h.expectedImpactUnit,
    status: h.status,
    templateId: h.templateId,
    iceImpact: h.iceImpact,
    iceConfidence: h.iceConfidence,
    iceEase: h.iceEase,
    iceScore: h.iceScore,
    riceReach: h.riceReach,
    riceImpact: h.riceImpact,
    riceConfidence: h.riceConfidence,
    riceEffort: h.riceEffort,
    riceScore: h.riceScore,
    owner: userBrief(h.owner),
    createdAt: h.createdAt.getTime(),
    updatedAt: h.updatedAt.getTime(),
    closedAt: h.closedAt?.getTime() ?? null,
  }
}

function mapResult(r: PrismaHypothesisResult) {
  return {
    id: r.id,
    hypothesisId: r.hypothesisId,
    metricType: r.metricType,
    metricName: r.metricName,
    baseline: r.baseline,
    actual: r.actual,
    delta: r.delta,
    unit: r.unit,
    conclusion: r.conclusion,
    humanNote: r.humanNote,
    createdAt: r.createdAt.getTime(),
  }
}

function mapVariant(v: PrismaHypothesisVariant) {
  return {
    id: v.id,
    hypothesisId: v.hypothesisId,
    name: v.name,
    description: v.description,
    type: v.type,
    sampleSize: v.sampleSize,
    conversionCount: v.conversionCount,
    metricValue: v.metricValue,
    metricUnit: v.metricUnit,
    conversionRate: v.conversionRate,
    stdError: v.stdError,
    pValue: v.pValue,
    confidenceInterval95Low: v.confidenceInterval95Low,
    confidenceInterval95High: v.confidenceInterval95High,
    isSignificant: v.isSignificant,
    isWinner: v.isWinner,
    createdAt: v.createdAt.getTime(),
    updatedAt: v.updatedAt.getTime(),
  }
}

function mapLearning(l: PrismaLearning) {
  return {
    id: l.id,
    source: l.source,
    hypothesisId: l.hypothesisId,
    title: l.title,
    content: l.content,
    linkedPromptId: l.linkedPromptId,
    // createdBy / createdAt 从 include 已带
    createdBy: null, // 上层补 — 这里只返回 stub
    createdAt: l.createdAt.getTime(),
    updatedAt: l.updatedAt.getTime(),
  }
}

function mapIterationBrief(
  i: PrismaIteration & { _feedCount?: number },
) {
  return {
    id: i.id,
    name: i.name,
    status: i.status,
    boardId: i.boardId,
    feedCount: i._feedCount ?? 0,
    createdAt: i.createdAt.getTime(),
    assigneeId: null, // Iteration 模型没 assigneeId 字段，这里占位
    closedAt: null,
  }
}

// ============================================================
// Services
// ============================================================

export async function createHypothesis(
  data: HypothesisCreateInput,
  actorUserId: string,
) {
  // 校验 KR 存在
  const kr = await prisma.keyResult.findUnique({ where: { id: data.krId } })
  if (!kr) {
    throw new AppError(
      ErrorCodes.KEY_RESULT_NOT_FOUND,
      'KR 不存在',
      404,
    )
  }

  // parentId 循环 + 深度校验
  if (data.parentId) {
    const parent = await prisma.hypothesis.findUnique({
      where: { id: data.parentId },
      select: { id: true, deletedAt: true, krId: true },
    })
    if (!parent || parent.deletedAt) {
      throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '父假设不存在', 404)
    }
    // 创建时 currentId 为 null（还没存）——第一次调用不会遇到 self 但避免 cursor 卡住
    await validateNoCycleAndDepth(data.parentId, null)
  }

  // Template 合法性校验 + usageCount +1
  if (data.templateId) {
    const tpl = await prisma.hypothesisTemplate.findUnique({
      where: { id: data.templateId },
      select: { id: true, deletedAt: true },
    })
    if (!tpl || tpl.deletedAt) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_TEMPLATE_NOT_FOUND,
        '模板不存在',
        404,
      )
    }
  }

  // Phase D.4: 计算 ICE/RICE score
  const iceScore =
    data.iceImpact !== undefined &&
    data.iceConfidence !== undefined &&
    data.iceEase !== undefined
      ? (data.iceImpact * data.iceConfidence * data.iceEase) / 10
      : null
  const riceScore =
    data.riceReach !== undefined &&
    data.riceImpact !== undefined &&
    data.riceConfidence !== undefined &&
    data.riceEffort !== undefined &&
    data.riceEffort > 0
      ? (data.riceReach * data.riceImpact * data.riceConfidence) / data.riceEffort
      : null

  const created = await prisma.$transaction(async (tx) => {
    const hyp = await tx.hypothesis.create({
      data: {
        krId: data.krId,
        parentId: data.parentId ?? null,
        statement: data.statement,
        mechanism: data.mechanism,
        expectedImpact: data.expectedImpact,
        expectedImpactValue: data.expectedImpactValue,
        expectedImpactUnit: data.expectedImpactUnit,
        templateId: data.templateId ?? null,
        status: 'BACKLOG',
        ownerId: actorUserId,
        iceImpact: data.iceImpact ?? null,
        iceConfidence: data.iceConfidence ?? null,
        iceEase: data.iceEase ?? null,
        iceScore,
        riceReach: data.riceReach ?? null,
        riceImpact: data.riceImpact ?? null,
        riceConfidence: data.riceConfidence ?? null,
        riceEffort: data.riceEffort ?? null,
        riceScore,
      },
      include: {
        owner: true,
        keyResult: true,
      },
    })
    if (data.templateId) {
      await tx.hypothesisTemplate.update({
        where: { id: data.templateId },
        data: { usageCount: { increment: 1 } },
      })
    }
    return hyp
  })

  return hypothesisBrief(created)
}

/**
 * Phase B.1: 从某假设创建一个 Iteration，自动挂 hypothesisId。
 *
 * 约定：
 *   - projectId / squadId 可选，不传时从 hypothesis.keyResult.objective 或 user.squad 推断
 *   - name 可选，不传时默认 "{statement 前 40 字} · 执行"
 *   - 复用 iterationService.createIteration()，避免重复实现 Board 创建
 */
export async function createIterationForHypothesis(
  hypothesisId: string,
  input: { projectId?: string; squadId?: string; name?: string },
  actorUserId: string,
) {
  // 用 dynamic import 避免和 iteration.service 形成循环依赖
  const iterationService = await import('../iteration.service')

  const hyp = await prisma.hypothesis.findFirst({
    where: { id: hypothesisId, deletedAt: null },
    include: {
      keyResult: {
        include: { objective: true },
      },
    },
  })
  if (!hyp) {
    throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '假设不存在', 404)
  }

  // 推断 projectId：优先用户传的，否则从 KR → Objective.projectId
  const projectId = input.projectId ?? hyp.keyResult.objective.projectId
  if (!projectId) {
    throw new AppError(
      ErrorCodes.MISSING_REQUIRED_FIELD,
      '无法推断 projectId，请显式传入',
    )
  }

  // 推断 squadId：优先用户传的，否则 user.squadId → objective.squadId → 项目下任一 squad
  let squadId = input.squadId
  if (!squadId) {
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { squadId: true },
    })
    squadId = user?.squadId ?? hyp.keyResult.objective.squadId ?? undefined
  }
  if (!squadId) {
    // 最后的回退：取项目下的任一 squad
    const anySquad = await prisma.squad.findFirst({
      where: { projectId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    squadId = anySquad?.id
  }
  if (!squadId) {
    throw new AppError(
      ErrorCodes.MISSING_REQUIRED_FIELD,
      '该项目下没有任何小组，无法创建执行任务。请先到「设置」添加小组。',
    )
  }

  // 推断 name：优先用户传的，否则 statement 前 40 字 + " · 执行"
  const defaultName = `${hyp.statement.slice(0, 40)} · 执行`
  const name = input.name?.trim() || defaultName

  // 复用现有 iterationService.createIteration()
  const iteration = await iterationService.createIteration({
    projectId,
    squadId,
    name,
    userId: actorUserId,
  })

  // 关联 hypothesisId
  await prisma.iteration.update({
    where: { id: iteration.id },
    data: { hypothesisId: hyp.id },
  })

  return {
    ...iteration,
    hypothesisId: hyp.id,
  }
}

export async function getHypothesisDetail(id: string) {
  const hyp = await prisma.hypothesis.findFirst({
    where: { id, deletedAt: null },
    include: {
      owner: true,
      keyResult: true,
      parent: { include: { owner: true, keyResult: true } },
      children: {
        where: { deletedAt: null },
        include: { owner: true, keyResult: true },
        orderBy: { createdAt: 'asc' },
      },
      iterations: { orderBy: { createdAt: 'asc' } },
      result: true,
      variants: { orderBy: { createdAt: 'asc' } },
      learnings: {
        where: { deletedAt: null },
        include: { createdBy: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!hyp) {
    throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '假设不存在', 404)
  }

  // Phase B.3: 批量查每个 iteration 的 feed 包数量
  const iterationIds = (hyp.iterations ?? []).map((i) => i.id)
  const feedCounts =
    iterationIds.length > 0
      ? await prisma.feedPackage.groupBy({
          by: ['iterationId'],
          where: { iterationId: { in: iterationIds }, deletedAt: null },
          _count: true,
        })
      : []
  const feedCountMap = new Map(feedCounts.map((fc) => [fc.iterationId, fc._count]))

  const base = hypothesisBrief(hyp as HypothesisWithRelations)
  return {
    ...base,
    parent: hyp.parent ? hypothesisBrief(hyp.parent as HypothesisWithRelations) : null,
    children: (hyp.children ?? []).map((c) =>
      hypothesisBrief(c as HypothesisWithRelations),
    ),
    iterations: (hyp.iterations ?? []).map((i) =>
      mapIterationBrief({ ...i, _feedCount: feedCountMap.get(i.id) ?? 0 }),
    ),
    result: hyp.result ? mapResult(hyp.result) : null,
    variants: (hyp.variants ?? []).map(mapVariant),
    learnings: (hyp.learnings ?? []).map((l) => ({
      ...mapLearning(l),
      createdBy: userBrief((l as unknown as { createdBy: PrismaUser }).createdBy),
    })),
  }
}

export async function listHypotheses(query: ListQuery) {
  const where: Record<string, unknown> = { deletedAt: null }

  if (query.krId) where.krId = query.krId
  if (query.ownerId) where.ownerId = query.ownerId
  if (query.mine && query.userId) where.ownerId = query.userId
  if (query.status) {
    if (Array.isArray(query.status)) {
      where.status = { in: query.status }
    } else {
      where.status = query.status
    }
  }

  const sortField = query.sortBy ?? 'createdAt'
  const order = query.order ?? 'desc'
  const orderBy = { [sortField]: order }

  const [items, total] = await Promise.all([
    prisma.hypothesis.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.pageSize,
      include: { owner: true, keyResult: true },
    }),
    prisma.hypothesis.count({ where }),
  ])

  return {
    items: items.map((h) => hypothesisBrief(h as HypothesisWithRelations)),
    total,
  }
}

export async function updateHypothesis(
  id: string,
  data: HypothesisUpdateInput,
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(id, actor.userId, actor.role, '编辑假设')

  const existing = await prisma.hypothesis.findFirst({
    where: { id, deletedAt: null },
  })
  if (!existing) {
    throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '假设不存在', 404)
  }

  // 已 close 的不允许 PUT
  if (
    existing.status === 'CLOSED_WIN' ||
    existing.status === 'CLOSED_LOSS' ||
    existing.status === 'CLOSED_FLAT'
  ) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_ALREADY_CLOSED,
      '已关闭的假设不允许修改，请创建下一版',
      409,
    )
  }

  // Status 合法转换
  if (data.status) {
    const valid: Record<string, readonly PrismaHypothesisStatus[]> = {
      BACKLOG: ['RUNNING', 'ABANDONED'] as const,
      RUNNING: ['BACKLOG', 'ABANDONED'] as const,
      ABANDONED: [] as const,
    }
    const allowed = valid[existing.status] ?? []
    if (!allowed.includes(data.status)) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_INVALID_STATUS_TRANSITION,
        `不能从 ${existing.status} 转到 ${data.status}`,
      )
    }
  }

  const updated = await prisma.hypothesis.update({
    where: { id },
    data: {
      statement: data.statement,
      mechanism: data.mechanism,
      expectedImpact: data.expectedImpact,
      expectedImpactValue: data.expectedImpactValue,
      expectedImpactUnit: data.expectedImpactUnit,
      status: data.status,
    },
    include: { owner: true, keyResult: true },
  })

  return hypothesisBrief(updated as HypothesisWithRelations)
}

export async function deleteHypothesis(
  id: string,
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(id, actor.userId, actor.role, '删除假设')
  await prisma.hypothesis.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ============================================================
// ICE / RICE Scoring (G9)
// ============================================================

export async function updateIceScoring(
  hypothesisId: string,
  data: { iceImpact: number; iceConfidence: number; iceEase: number },
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(hypothesisId, actor.userId, actor.role, '打分')

  // 校验 1-10
  for (const [key, val] of Object.entries(data)) {
    if (!Number.isInteger(val) || val < 1 || val > 10) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_INVALID_SCORING,
        `${key} 必须是 1-10 的整数，got ${val}`,
      )
    }
  }

  // ICE = (impact * confidence * ease) / 10
  const iceScore =
    (data.iceImpact * data.iceConfidence * data.iceEase) / 10

  const updated = await prisma.hypothesis.update({
    where: { id: hypothesisId },
    data: {
      iceImpact: data.iceImpact,
      iceConfidence: data.iceConfidence,
      iceEase: data.iceEase,
      iceScore,
    },
    include: { owner: true, keyResult: true },
  })
  return hypothesisBrief(updated as HypothesisWithRelations)
}

export async function updateRiceScoring(
  hypothesisId: string,
  data: {
    riceReach: number
    riceImpact: number
    riceConfidence: number
    riceEffort: number
  },
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(hypothesisId, actor.userId, actor.role, '打分')

  if (data.riceReach < 0) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_INVALID_SCORING,
      'reach 必须 >= 0',
    )
  }
  const allowedImpact = [0.25, 0.5, 1, 2, 3]
  if (!allowedImpact.includes(data.riceImpact)) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_INVALID_SCORING,
      `impact 必须是 ${allowedImpact.join('/')} 之一`,
    )
  }
  if (
    data.riceConfidence < 0 ||
    data.riceConfidence > 100
  ) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_INVALID_SCORING,
      'confidence 必须在 0-100 之间',
    )
  }
  if (data.riceEffort <= 0) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_INVALID_SCORING,
      'effort 必须 > 0',
    )
  }

  // RICE = (reach * impact * confidence%) / effort
  const riceScore =
    (data.riceReach * data.riceImpact * (data.riceConfidence / 100)) /
    data.riceEffort

  const updated = await prisma.hypothesis.update({
    where: { id: hypothesisId },
    data: {
      riceReach: data.riceReach,
      riceImpact: data.riceImpact,
      riceConfidence: data.riceConfidence,
      riceEffort: data.riceEffort,
      riceScore,
    },
    include: { owner: true, keyResult: true },
  })
  return hypothesisBrief(updated as HypothesisWithRelations)
}

// ============================================================
// Tree (G11 — parent chain visualization)
// ============================================================

const MAX_TREE_DEPTH = 20

interface TreeNode {
  id: string
  statement: string
  status: PrismaHypothesisStatus
  delta: number | null
  children: TreeNode[]
}

/**
 * 返回以 id 为根的完整 subtree（向下递归 children）。
 * - 深度上限 20：超出时 children 为空，返回 truncated=true
 * - 软删节点不进树
 */
export async function getHypothesisTree(id: string) {
  // Step 1: 向下 BFS 收集所有 descendant ids（限制深度）
  const allIds: string[] = [id]
  let currentLayer: string[] = [id]
  let depth = 0
  let truncated = false

  while (currentLayer.length > 0) {
    depth += 1
    if (depth > MAX_TREE_DEPTH) {
      truncated = true
      break
    }
    const children: { id: string; parentId: string | null }[] =
      await prisma.hypothesis.findMany({
        where: {
          parentId: { in: currentLayer },
          deletedAt: null,
        },
        select: { id: true, parentId: true },
      })
    if (children.length === 0) break
    const childIds = children.map((c) => c.id)
    allIds.push(...childIds)
    currentLayer = childIds
  }

  // Step 2: 一次性 fetch 所有节点 + result（用于 delta）
  const nodes = await prisma.hypothesis.findMany({
    where: { id: { in: allIds } },
    select: {
      id: true,
      statement: true,
      status: true,
      parentId: true,
      result: { select: { delta: true } },
      variants: {
        where: { isWinner: true },
        select: {
          conversionRate: true,
        },
      },
    },
  })
  if (nodes.length === 0) {
    throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '假设不存在', 404)
  }

  // Step 3: 在内存里构树
  const byId = new Map<string, TreeNode>()
  for (const n of nodes) {
    const delta =
      n.result?.delta ??
      n.variants[0]?.conversionRate ??
      null
    byId.set(n.id, {
      id: n.id,
      statement: n.statement,
      status: n.status,
      delta,
      children: [],
    })
  }
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) {
      const parent = byId.get(n.parentId)!
      const child = byId.get(n.id)
      if (child) parent.children.push(child)
    }
  }

  const root = byId.get(id)
  if (!root) {
    throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '假设不存在', 404)
  }

  return {
    root,
    depth,
    totalNodes: nodes.length,
    truncated,
  }
}

export {
  ensureCanWriteHypothesis,
  validateNoCycleAndDepth,
} from './permission'
