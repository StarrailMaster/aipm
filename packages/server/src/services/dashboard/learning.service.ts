/**
 * Learning Dashboard Service — Learning Copilot v2.0 首页数据聚合
 *
 * 决策（Eng Review Issue 6）：
 *   - 并行查询 + in-memory join（不用深层 Prisma include）
 *   - SLO: p50 < 200ms, p95 < 500ms
 *   - 不加 Redis cache（先测量）
 *
 * 数据来源：
 *   - KR 列表（用户/admin 可见范围）
 *   - 最近 7 天 hypothesis 分桶（running / closedWins / closedLosses / backlog）
 *   - 最新一条 CopilotDigest
 *   - Stagnant KR 检测（> 7 天无 running hypothesis）
 */
import type {
  Hypothesis as PrismaHypothesis,
  HypothesisStatus as PrismaHypothesisStatus,
  User as PrismaUser,
  KeyResult as PrismaKeyResult,
} from '@prisma/client'
import prisma from '../../prisma/client'

const STAGNANT_THRESHOLD_DAYS = 7
const WEEK_MS = 7 * 86400000

// ============================================================
// Types
// ============================================================

export interface LearningDashboardQuery {
  userId: string
  userSquadId: string | null
  userRole: string
  projectId?: string
  scope?: 'all' | 'mine'
}

interface HypothesisBriefRow {
  id: string
  krId: string
  krName: string
  parentId: string | null
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue: number | null
  expectedImpactUnit: string | null
  status: PrismaHypothesisStatus
  templateId: string | null
  iceImpact: number | null
  iceConfidence: number | null
  iceEase: number | null
  iceScore: number | null
  riceReach: number | null
  riceImpact: number | null
  riceConfidence: number | null
  riceEffort: number | null
  riceScore: number | null
  owner: {
    id: string
    name: string
    email: string
    role: string
    avatar: string | null
    legacyRoles: string[]
  }
  createdAt: number
  updatedAt: number
  closedAt: number | null
}

interface ActiveKRSummary {
  id: string
  name: string
  objectiveId: string
  objectiveName: string
  targetValue: number
  currentValue: number
  baseline: number
  unit: string
  startDate: number
  endDate: number | null
  daysElapsed: number
  daysTotal: number | null
  daysLeft: number | null
  kpiProgressRatio: number
  timeElapsedRatio: number | null
  progressStatus: 'on_track' | 'behind' | 'critical'
  contributionHypothesisCount: number
  lastHypothesisAt: number | null
  isStagnant: boolean
}

// ============================================================
// Helpers
// ============================================================

function mapHypothesisBrief(
  h: PrismaHypothesis & { owner: PrismaUser; keyResult: PrismaKeyResult },
): HypothesisBriefRow {
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
    owner: {
      id: h.owner.id,
      name: h.owner.name,
      email: h.owner.email,
      role: h.owner.role,
      avatar: h.owner.avatar,
      legacyRoles: h.owner.legacyRoles,
    },
    createdAt: h.createdAt.getTime(),
    updatedAt: h.updatedAt.getTime(),
    closedAt: h.closedAt?.getTime() ?? null,
  }
}

function computeKrProgress(kr: {
  targetValue: number
  currentValue: number
  baseline: number
  startDate: Date
  endDate: Date | null
}): {
  daysElapsed: number
  daysTotal: number | null
  daysLeft: number | null
  kpiProgressRatio: number
  timeElapsedRatio: number | null
  progressStatus: 'on_track' | 'behind' | 'critical'
} {
  const now = Date.now()
  const start = kr.startDate.getTime()
  const daysElapsed = Math.max(0, Math.floor((now - start) / 86400000))

  let daysTotal: number | null = null
  let daysLeft: number | null = null
  let timeElapsedRatio: number | null = null
  if (kr.endDate) {
    daysTotal = Math.max(
      1,
      Math.ceil((kr.endDate.getTime() - start) / 86400000),
    )
    daysLeft = Math.max(0, Math.ceil((kr.endDate.getTime() - now) / 86400000))
    timeElapsedRatio = Math.min(1, daysElapsed / daysTotal)
  }

  const range = kr.targetValue - kr.baseline
  const kpiProgressRatio =
    range === 0 ? 0 : (kr.currentValue - kr.baseline) / range

  let progressStatus: 'on_track' | 'behind' | 'critical'
  if (timeElapsedRatio === null) {
    if (kpiProgressRatio >= 0.8) progressStatus = 'on_track'
    else if (kpiProgressRatio >= 0.5) progressStatus = 'behind'
    else progressStatus = 'critical'
  } else {
    const ratio = timeElapsedRatio === 0 ? Infinity : kpiProgressRatio / timeElapsedRatio
    if (ratio >= 0.9) progressStatus = 'on_track'
    else if (ratio >= 0.6) progressStatus = 'behind'
    else progressStatus = 'critical'
  }

  return {
    daysElapsed,
    daysTotal,
    daysLeft,
    kpiProgressRatio,
    timeElapsedRatio,
    progressStatus,
  }
}

// ============================================================
// Main function
// ============================================================

export async function getLearningDashboard(query: LearningDashboardQuery) {
  const weekAgo = new Date(Date.now() - WEEK_MS)

  // Step 1: 决定 KR 过滤条件
  // - ADMIN: 全量（或 projectId 限定）
  // - 普通 user: 自己 squad 可见的 OKR
  const krWhere: Record<string, unknown> = {}
  const objectiveFilter: Record<string, unknown> = { deletedAt: null }
  if (query.projectId) objectiveFilter.projectId = query.projectId
  if (query.userRole !== 'ADMIN' && query.scope !== 'all') {
    if (query.userSquadId) {
      objectiveFilter.squadId = query.userSquadId
    } else {
      // 没 squad 的用户，看不见任何 KR
      objectiveFilter.squadId = '__none__'
    }
  }
  krWhere.objective = objectiveFilter

  // Step 2: 并行查询
  const [krs, weekHypotheses, latestDigest] = await Promise.all([
    prisma.keyResult.findMany({
      where: krWhere,
      include: { objective: { select: { id: true, name: true, squadId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.hypothesis.findMany({
      where: {
        deletedAt: null,
        OR: [
          { createdAt: { gte: weekAgo } },
          { closedAt: { gte: weekAgo } },
          { status: { in: ['BACKLOG', 'RUNNING'] } },
        ],
        ...(query.projectId
          ? {
              keyResult: { objective: { projectId: query.projectId } },
            }
          : {}),
      },
      include: { owner: true, keyResult: true },
      orderBy: [{ closedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.copilotDigest.findFirst({
      where: {
        scope: query.projectId ? `project:${query.projectId}` : 'global',
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Step 3: 计算 active KR summaries
  const krIds = krs.map((kr) => kr.id)
  // 每个 KR 关联的 hypothesis 计数 + 最近一次活跃
  const hypsByKr = new Map<
    string,
    { count: number; lastAt: number | null; hasRunning: boolean }
  >()
  for (const id of krIds) {
    hypsByKr.set(id, { count: 0, lastAt: null, hasRunning: false })
  }
  for (const h of weekHypotheses) {
    const entry = hypsByKr.get(h.krId)
    if (!entry) continue
    entry.count += 1
    const t = h.updatedAt.getTime()
    if (entry.lastAt === null || t > entry.lastAt) entry.lastAt = t
    if (h.status === 'RUNNING' || h.status === 'BACKLOG') entry.hasRunning = true
  }

  const activeKRs: ActiveKRSummary[] = krs.map((kr) => {
    const computed = computeKrProgress(kr)
    const entry = hypsByKr.get(kr.id)!
    const isStagnant =
      !entry.hasRunning &&
      (entry.lastAt === null ||
        Date.now() - entry.lastAt > STAGNANT_THRESHOLD_DAYS * 86400000)
    return {
      id: kr.id,
      name: kr.name,
      objectiveId: kr.objectiveId,
      objectiveName: kr.objective.name,
      targetValue: kr.targetValue,
      currentValue: kr.currentValue,
      baseline: kr.baseline,
      unit: kr.unit,
      startDate: kr.startDate.getTime(),
      endDate: kr.endDate?.getTime() ?? null,
      ...computed,
      contributionHypothesisCount: entry.count,
      lastHypothesisAt: entry.lastAt,
      isStagnant,
    }
  })

  // Step 4: 分桶 hypothesis
  const running: HypothesisBriefRow[] = []
  const closedWins: HypothesisBriefRow[] = []
  const closedLosses: HypothesisBriefRow[] = []
  const backlog: HypothesisBriefRow[] = []
  for (const h of weekHypotheses) {
    // 过滤到 krIds 内
    if (!krIds.includes(h.krId)) continue
    const brief = mapHypothesisBrief(
      h as PrismaHypothesis & { owner: PrismaUser; keyResult: PrismaKeyResult },
    )
    switch (h.status) {
      case 'RUNNING':
        running.push(brief)
        break
      case 'BACKLOG':
        backlog.push(brief)
        break
      case 'CLOSED_WIN':
        if (h.closedAt && h.closedAt >= weekAgo) closedWins.push(brief)
        break
      case 'CLOSED_LOSS':
      case 'CLOSED_FLAT':
        if (h.closedAt && h.closedAt >= weekAgo) closedLosses.push(brief)
        break
    }
  }

  // Step 5: summary
  const totalHypothesesThisWeek =
    running.length + closedWins.length + closedLosses.length + backlog.length
  const closedCount = closedWins.length + closedLosses.length
  const winRate = closedCount === 0 ? 0 : closedWins.length / closedCount

  return {
    activeKRs,
    thisWeekHypotheses: {
      running,
      closedWins,
      closedLosses,
      backlog,
    },
    latestCopilotDigest: latestDigest
      ? {
          id: latestDigest.id,
          scope: latestDigest.scope,
          triggerType: latestDigest.triggerType,
          payload: latestDigest.payload,
          createdAt: latestDigest.createdAt.getTime(),
        }
      : null,
    summary: {
      totalHypothesesThisWeek,
      winRate,
      learningVelocity: closedCount,
    },
  }
}

// ============================================================
// Cross-project dashboard (G10 — ADMIN only)
// ============================================================

export async function getCrossProjectDashboard() {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: {
      squads: {
        include: {
          // KR 反向关联要通过 objective
        },
      },
    },
  })

  const projectSummaries = await Promise.all(
    projects.map(async (p) => {
      const [kRs, hypCount, winCount, stagnantKRs] = await Promise.all([
        prisma.keyResult.findMany({
          where: {
            objective: { projectId: p.id, deletedAt: null },
          },
        }),
        prisma.hypothesis.count({
          where: {
            deletedAt: null,
            createdAt: { gte: startOfMonth },
            keyResult: { objective: { projectId: p.id } },
          },
        }),
        prisma.hypothesis.count({
          where: {
            deletedAt: null,
            status: 'CLOSED_WIN',
            closedAt: { gte: startOfMonth },
            keyResult: { objective: { projectId: p.id } },
          },
        }),
        prisma.keyResult.count({
          where: {
            objective: { projectId: p.id, deletedAt: null },
            hypotheses: {
              none: {
                status: { in: ['RUNNING', 'BACKLOG'] },
                deletedAt: null,
              },
            },
          },
        }),
      ])

      const kpiAchievementRate =
        kRs.length === 0
          ? 0
          : kRs.reduce((sum, kr) => {
              const range = kr.targetValue - kr.baseline
              if (range === 0) return sum
              return sum + Math.min(1, (kr.currentValue - kr.baseline) / range)
            }, 0) / kRs.length

      const closedCount = await prisma.hypothesis.count({
        where: {
          deletedAt: null,
          status: { in: ['CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_FLAT'] },
          closedAt: { gte: startOfMonth },
          keyResult: { objective: { projectId: p.id } },
        },
      })
      const winRate = closedCount === 0 ? 0 : winCount / closedCount

      return {
        projectId: p.id,
        projectName: p.name,
        activeKRCount: kRs.length,
        kpiAchievementRate,
        hypothesisCount: hypCount,
        winRate,
        learningVelocity: closedCount,
        stagnantKRs,
      }
    }),
  )

  // Global cross-project patterns from latest global digest
  const latestGlobalDigest = await prisma.copilotDigest.findFirst({
    where: { scope: 'global' },
    orderBy: { createdAt: 'desc' },
  })

  return {
    projects: projectSummaries,
    crossPatterns: latestGlobalDigest
      ? ((latestGlobalDigest.payload as unknown as { patterns?: unknown[] })
          .patterns ?? [])
      : [],
    generatedAt: Date.now(),
  }
}
