import prisma from '../../prisma/client'
import type { Prisma } from '@prisma/client'
import { PointCategory, ContributionSourceType } from '@prisma/client'

// ========================================================================
// Types
// ========================================================================

export interface AwardInput {
  userId: string
  eventKey: string
  eventType: string
  category: PointCategory
  sourceType: ContributionSourceType
  sourceId: string
  points: number
  reason: string
}

export interface ContributionEventItem {
  id: string
  eventType: string
  category: PointCategory
  sourceType: ContributionSourceType
  sourceId: string
  points: number
  reason: string
  createdAt: number
}

export interface LeaderboardItem {
  rank: number
  user: { id: string; name: string; email: string; avatar: string | null }
  totalPoints: number
  basePoints: number // category='base' 的总和
  valuePoints: number // category='value' 的总和
  breakdown: {
    // 按 sourceType 拆分
    prompt: number
    skill: number
    sop_project: number
    sop_document: number
    prompt_pr: number
    hypothesis: number
    learning: number
  }
  recentEventCount: number // 窗口内的事件数
}

export interface MyContributionResult {
  totalPoints: number
  weekPoints: number
  monthPoints: number
  basePoints: number
  valuePoints: number
  breakdown: {
    prompt: number
    skill: number
    sop_project: number
    sop_document: number
    prompt_pr: number
    hypothesis: number
    learning: number
  }
  recentEvents: ContributionEventItem[] // 最近 20 条
  rank: {
    week: number | null // 在周榜的排名
    month: number | null
    all: number | null
  }
}

export type ContributionWindow = 'week' | 'month' | 'all'

// ========================================================================
// 幂等发放
// ========================================================================

/**
 * 幂等发放：相同 eventKey 已存在则直接返回 false，不抛错。
 * 所有现有业务 service 都走这个入口发放积分，不阻塞主流程。
 */
export async function awardPoints(input: AwardInput): Promise<boolean> {
  try {
    await prisma.contributionPoint.create({ data: input })
    return true
  } catch (err) {
    // Prisma P2002 = unique constraint violation = 已经发过了
    const code = (err as { code?: string })?.code
    if (code === 'P2002') return false
    // 其它错误：只 log 不 throw，保证不影响主业务
    console.error('[contribution] awardPoints failed:', err)
    return false
  }
}

// ========================================================================
// 里程碑
// ========================================================================

// 星标/Fork/使用次数里程碑的积分表
const STAR_POINTS: Record<number, number> = { 1: 5, 5: 10, 10: 20, 25: 40 }
const FORK_POINTS: Record<number, number> = { 1: 8, 5: 15 }

const STAR_THRESHOLDS = [1, 5, 10, 25]
const FORK_THRESHOLDS = [1, 5]
const USED_THRESHOLDS = [1, 5]

export interface MilestoneParams {
  ownerId: string // 积分接收者（资源创建者）
  sourceType: ContributionSourceType
  sourceId: string
  sourceName: string // 用于 reason 文案
  currentCount: number // 当前累计数
  kind: 'star' | 'fork' | 'used'
  /** 当 kind='used' 时，调用方必须提供积分表（prompt 和 sop_project 积分不同）*/
  usedPointsTable?: Record<number, number>
}

/**
 * 星标/Fork/使用次数里程碑判定
 * 给定当前计数，如果跨过某些阈值则触发里程碑事件
 *
 * 阈值（收藏）：1, 5, 10, 25  → 积分 5, 10, 20, 40
 * 阈值（Fork）：1, 5          → 积分 8, 15
 * 阈值（使用）：1, 5          → 积分由调用方决定
 *
 * 幂等 key 格式：<kind>_milestone_<threshold>:<sourceType>:<sourceId>
 * 同一个里程碑只会触发一次
 */
export async function checkAndAwardMilestones(params: MilestoneParams): Promise<void> {
  const { ownerId, sourceType, sourceId, sourceName, currentCount, kind, usedPointsTable } = params

  let thresholds: number[]
  let pointsTable: Record<number, number>
  let eventType: string
  let labelPrefix: string

  switch (kind) {
    case 'star':
      thresholds = STAR_THRESHOLDS
      pointsTable = STAR_POINTS
      eventType = 'star_milestone'
      labelPrefix = '收藏数达到'
      break
    case 'fork':
      thresholds = FORK_THRESHOLDS
      pointsTable = FORK_POINTS
      eventType = 'fork_milestone'
      labelPrefix = 'Fork 数达到'
      break
    case 'used':
      thresholds = USED_THRESHOLDS
      pointsTable = usedPointsTable ?? {}
      eventType = 'used_milestone'
      labelPrefix = '被使用次数达到'
      break
    default:
      return
  }

  for (const threshold of thresholds) {
    if (currentCount < threshold) continue
    const points = pointsTable[threshold]
    if (!points || points <= 0) continue

    const eventKey = `${kind}_milestone_${threshold}:${sourceType}:${sourceId}`
    const unit =
      kind === 'star' ? `${threshold} 颗星` : kind === 'fork' ? `${threshold} 次` : `${threshold} 次`
    const reason = `「${sourceName}」${labelPrefix} ${unit}`

    await awardPoints({
      userId: ownerId,
      eventKey,
      eventType,
      category: PointCategory.value,
      sourceType,
      sourceId,
      points,
      reason,
    })
  }
}

// ========================================================================
// 查询层
// ========================================================================

const BREAKDOWN_KEYS: ContributionSourceType[] = [
  ContributionSourceType.prompt,
  ContributionSourceType.skill,
  ContributionSourceType.sop_project,
  ContributionSourceType.sop_document,
  ContributionSourceType.prompt_pr,
]

function emptyBreakdown(): LeaderboardItem['breakdown'] {
  return {
    prompt: 0,
    skill: 0,
    sop_project: 0,
    sop_document: 0,
    prompt_pr: 0,
    hypothesis: 0,
    learning: 0,
  }
}

function getWindowStart(window: ContributionWindow): Date | null {
  if (window === 'all') return null
  const now = new Date()
  if (window === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  }
  // week: 本周一 0:00
  const day = now.getDay() // 0=Sun, 1=Mon ... 6=Sat
  const diffToMonday = (day + 6) % 7 // Monday=0, Sun=6
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0)
  return monday
}

function buildWindowWhere(window: ContributionWindow): Prisma.ContributionPointWhereInput {
  const start = getWindowStart(window)
  if (!start) return {}
  return { createdAt: { gte: start } }
}

/**
 * 获取排行榜
 * window='week'  当前自然周一到今天
 * window='month' 当月 1 号到今天
 * window='all'   全部时间
 * sourceType 可选：筛选某类贡献物
 * 返回前 limit 名
 */
export async function getLeaderboard(params: {
  window: ContributionWindow
  sourceType?: ContributionSourceType
  limit?: number
}): Promise<LeaderboardItem[]> {
  const { window, sourceType, limit = 50 } = params

  const where: Prisma.ContributionPointWhereInput = {
    ...buildWindowWhere(window),
    ...(sourceType ? { sourceType } : {}),
  }

  // 1. 按 userId 聚合总分，取前 limit 名
  const agg = await prisma.contributionPoint.groupBy({
    by: ['userId'],
    where,
    _sum: { points: true },
    _count: { id: true },
    orderBy: { _sum: { points: 'desc' } },
    take: limit,
  })

  if (agg.length === 0) return []

  const userIds = agg.map((a) => a.userId)

  // 2. 一次性拉出这些用户在窗口内的所有细分（按 category + sourceType）
  const detail = await prisma.contributionPoint.groupBy({
    by: ['userId', 'category', 'sourceType'],
    where: { ...where, userId: { in: userIds } },
    _sum: { points: true },
  })

  // 3. 拉用户基本信息
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, avatar: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  // 4. 组装
  const aggMap = new Map(agg.map((a) => [a.userId, a]))

  // 按 userId 归类细分
  const detailMap = new Map<
    string,
    { base: number; value: number; breakdown: LeaderboardItem['breakdown'] }
  >()
  for (const uid of userIds) {
    detailMap.set(uid, { base: 0, value: 0, breakdown: emptyBreakdown() })
  }
  for (const d of detail) {
    const slot = detailMap.get(d.userId)
    if (!slot) continue
    const points = d._sum.points ?? 0
    if (d.category === PointCategory.base) slot.base += points
    else if (d.category === PointCategory.value) slot.value += points
    if (BREAKDOWN_KEYS.includes(d.sourceType)) {
      const key = d.sourceType as keyof LeaderboardItem['breakdown']
      slot.breakdown[key] += points
    }
  }

  const items: LeaderboardItem[] = []
  let rank = 0
  for (const a of agg) {
    rank += 1
    const u = userMap.get(a.userId)
    const d = detailMap.get(a.userId)!
    items.push({
      rank,
      user: {
        id: a.userId,
        name: u?.name ?? 'Unknown',
        email: u?.email ?? '',
        avatar: u?.avatar ?? null,
      },
      totalPoints: aggMap.get(a.userId)?._sum.points ?? 0,
      basePoints: d.base,
      valuePoints: d.value,
      breakdown: d.breakdown,
      recentEventCount: a._count.id,
    })
  }

  return items
}

/**
 * 查单个用户在某窗口内的排名（从 1 开始）
 * 通过 count 比该用户 totalPoints 高的用户数得出
 */
async function computeRank(userId: string, window: ContributionWindow): Promise<number | null> {
  const windowWhere = buildWindowWhere(window)

  // 先算出这个用户在窗口内的总分
  const mine = await prisma.contributionPoint.aggregate({
    where: { ...windowWhere, userId },
    _sum: { points: true },
  })
  const myPoints = mine._sum.points ?? 0
  if (myPoints === 0) return null

  // 再算出所有用户的总分，count 比我高的
  const others = await prisma.contributionPoint.groupBy({
    by: ['userId'],
    where: windowWhere,
    _sum: { points: true },
  })

  let higher = 0
  for (const o of others) {
    if (o.userId === userId) continue
    if ((o._sum.points ?? 0) > myPoints) higher += 1
  }
  return higher + 1
}

export async function getMyContribution(userId: string): Promise<MyContributionResult> {
  // 1. 全部时间的细分（base/value + breakdown）
  const allDetail = await prisma.contributionPoint.groupBy({
    by: ['category', 'sourceType'],
    where: { userId },
    _sum: { points: true },
  })

  let basePoints = 0
  let valuePoints = 0
  const breakdown = emptyBreakdown()
  for (const d of allDetail) {
    const points = d._sum.points ?? 0
    if (d.category === PointCategory.base) basePoints += points
    else if (d.category === PointCategory.value) valuePoints += points
    if (BREAKDOWN_KEYS.includes(d.sourceType)) {
      breakdown[d.sourceType as keyof LeaderboardItem['breakdown']] += points
    }
  }
  const totalPoints = basePoints + valuePoints

  // 2. 本周 / 本月 的总分
  const weekStart = getWindowStart('week')!
  const monthStart = getWindowStart('month')!
  const [weekAgg, monthAgg] = await Promise.all([
    prisma.contributionPoint.aggregate({
      where: { userId, createdAt: { gte: weekStart } },
      _sum: { points: true },
    }),
    prisma.contributionPoint.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { points: true },
    }),
  ])

  // 3. 最近 20 条事件
  const recent = await prisma.contributionPoint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const recentEvents: ContributionEventItem[] = recent.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    category: r.category,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    points: r.points,
    reason: r.reason,
    createdAt: r.createdAt.getTime(),
  }))

  // 4. 三个窗口的排名
  const [weekRank, monthRank, allRank] = await Promise.all([
    computeRank(userId, 'week'),
    computeRank(userId, 'month'),
    computeRank(userId, 'all'),
  ])

  return {
    totalPoints,
    weekPoints: weekAgg._sum.points ?? 0,
    monthPoints: monthAgg._sum.points ?? 0,
    basePoints,
    valuePoints,
    breakdown,
    recentEvents,
    rank: {
      week: weekRank,
      month: monthRank,
      all: allRank,
    },
  }
}

/** 团队最近贡献事件流（用于团队看板右侧时间线）*/
export async function listRecentEvents(params: {
  limit?: number
  sourceType?: ContributionSourceType
}): Promise<Array<ContributionEventItem & { user: { id: string; name: string; avatar: string | null } }>> {
  const { limit = 30, sourceType } = params

  const where: Prisma.ContributionPointWhereInput = sourceType ? { sourceType } : {}

  const events = await prisma.contributionPoint.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  if (events.length === 0) return []

  const userIds = [...new Set(events.map((e) => e.userId))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatar: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    category: e.category,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    points: e.points,
    reason: e.reason,
    createdAt: e.createdAt.getTime(),
    user: {
      id: e.userId,
      name: userMap.get(e.userId)?.name ?? 'Unknown',
      avatar: userMap.get(e.userId)?.avatar ?? null,
    },
  }))
}

/**
 * 查某用户的公开贡献概况（比 getMyContribution 更精简，面向展示）
 */
export async function getUserContribution(userId: string): Promise<MyContributionResult> {
  return getMyContribution(userId)
}
