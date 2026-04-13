import prisma from '../../prisma/client'
import type { IterationStatus as PrismaIterationStatus } from '@prisma/client'

// ========== Types ==========

interface UserBriefRow {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

interface SquadStatusResult {
  squadId: string
  squadName: string
  currentStep: string
  currentTask: string
  blockers: string[]
  monthlyPlan: MonthlyPlanResult[]
}

interface MonthlyPlanResult {
  id: string
  title: string
  status: string
  progress: number
}

interface ProjectOverviewResult {
  projectId: string
  projectName: string
  squads: SquadStatusResult[]
}

interface OkrSnapshotResult {
  krId: string
  krName: string
  targetValue: number
  currentValue: number
  unit: string
  status: 'on_track' | 'at_risk' | 'behind'
}

interface CompanyDashboardResult {
  projects: ProjectOverviewResult[]
  okrSnapshot: OkrSnapshotResult[]
}

// ========== Helpers ==========

const STEP_ORDER: Record<string, number> = {
  SPEC: 1,
  DESIGN: 2,
  REFINE: 3,
  IMPLEMENT: 4,
  ACCEPT: 5,
  DONE: 6,
}

function computeProgress(status: PrismaIterationStatus): number {
  const progressMap: Record<string, number> = {
    SPEC: 10,
    DESIGN: 30,
    REFINE: 50,
    IMPLEMENT: 70,
    ACCEPT: 90,
    DONE: 100,
  }
  return progressMap[status] ?? 0
}

function computeOkrStatus(
  targetValue: number,
  currentValue: number,
): 'on_track' | 'at_risk' | 'behind' {
  if (targetValue <= 0) return 'on_track'
  const ratio = currentValue / targetValue
  if (ratio >= 1) return 'on_track'
  if (ratio >= 0.8) return 'at_risk'
  return 'behind'
}

function getMonthRange(month?: string): { start: Date; end: Date } {
  let year: number
  let mon: number

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const parts = month.split('-')
    year = parseInt(parts[0], 10)
    mon = parseInt(parts[1], 10) - 1
  } else {
    const now = new Date()
    year = now.getFullYear()
    mon = now.getMonth()
  }

  const start = new Date(year, mon, 1)
  const end = new Date(year, mon + 1, 1)
  return { start, end }
}

// ========== Get Company Dashboard ==========

export async function getCompanyDashboard(
  month?: string,
): Promise<CompanyDashboardResult> {
  const { start, end } = getMonthRange(month)

  // Fetch all projects with squads
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    include: {
      squads: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const projectOverviews: ProjectOverviewResult[] = []

  for (const project of projects) {
    const squads: SquadStatusResult[] = []

    for (const squad of project.squads) {
      const squadStatus = await getSquadStatus(
        project.id,
        squad.id,
        squad.name,
        start,
        end,
      )
      squads.push(squadStatus)
    }

    projectOverviews.push({
      projectId: project.id,
      projectName: project.name,
      squads,
    })
  }

  // OKR snapshots
  const okrSnapshot = await getOkrSnapshots()

  return {
    projects: projectOverviews,
    okrSnapshot,
  }
}

// ========== Get Project Dashboard ==========

export async function getProjectDashboard(
  projectId: string,
  month?: string,
): Promise<CompanyDashboardResult> {
  const { start, end } = getMonthRange(month)

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      squads: true,
    },
  })

  if (!project || project.deletedAt) {
    return { projects: [], okrSnapshot: [] }
  }

  const squads: SquadStatusResult[] = []

  for (const squad of project.squads) {
    const squadStatus = await getSquadStatus(
      project.id,
      squad.id,
      squad.name,
      start,
      end,
    )
    squads.push(squadStatus)
  }

  const projectOverview: ProjectOverviewResult = {
    projectId: project.id,
    projectName: project.name,
    squads,
  }

  // OKR snapshots filtered to this project
  const okrSnapshot = await getOkrSnapshots(projectId)

  return {
    projects: [projectOverview],
    okrSnapshot,
  }
}

// ========== Internal: Squad Status ==========

async function getSquadStatus(
  projectId: string,
  squadId: string,
  squadName: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<SquadStatusResult> {
  // Get current active iteration for this squad (most recent non-DONE)
  const activeIteration = await prisma.iteration.findFirst({
    where: {
      projectId,
      squadId,
      status: { not: 'DONE' },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get monthly iterations (created in the given month range)
  const monthlyIterations = await prisma.iteration.findMany({
    where: {
      projectId,
      squadId,
      createdAt: {
        gte: monthStart,
        lt: monthEnd,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const currentStep = activeIteration?.status ?? 'SPEC'
  const currentTask = activeIteration?.name ?? ''

  // Compute blockers: iterations in ACCEPT status (awaiting acceptance)
  const blockerIterations = await prisma.iteration.findMany({
    where: {
      projectId,
      squadId,
      status: 'ACCEPT',
    },
    select: { name: true },
  })
  const blockers = blockerIterations.map((i) => `等待验收: ${i.name}`)

  // Monthly plan items
  const monthlyPlan: MonthlyPlanResult[] = monthlyIterations.map((iter) => ({
    id: iter.id,
    title: iter.name,
    status: iter.status,
    progress: computeProgress(iter.status),
  }))

  return {
    squadId,
    squadName,
    currentStep,
    currentTask,
    blockers,
    monthlyPlan,
  }
}

// ========================================================================
// 我的任务聚合（6 类）+ 个人效率看板
// ========================================================================
//
// 产品形态：
//   - 仪表板改为两个子页："我的任务" 和 "效率看板"
//   - 所有需要当前用户处理的待办，在"我的任务"里按类型聚合显示
//   - 点击每项任务跳转到对应的列表页
//
// 6 类待办（口径）：
//   1. board_card        : 白板上指派给我且未完成的卡片
//   2. feed_implement    : 工作台包指派给我实施的（状态 PENDING/IN_PROGRESS/REWORK）
//   3. feed_design_review: 我作为设计师要审核的工作台推送（designReviewStatus=PENDING_REVIEW）
//   4. manual_design     : 手动设计任务指派给我且状态 PENDING_REFINE/REFINING
//   5. manual_confirm    : 我创建的手动设计任务等待我确认（status=PENDING_CONFIRM）
//   6. feed_rejected     : 我创建的工作台推送被驳回（designReviewStatus=REJECTED）
// ========================================================================

export interface MyTaskItem {
  id: string
  category:
    | 'board_card'
    | 'feed_implement'
    | 'feed_design_review'
    | 'feed_rejected'
    | 'prompt_pr_review'
  title: string
  subtitle: string
  actionLabel: string
  link: string
  createdAt: number
  updatedAt: number
  meta: Record<string, unknown>
}

export interface MyTasksResult {
  summary: {
    total: number
    byCategory: {
      boardCard: number
      feedImplement: number
      feedDesignReview: number
      feedRejected: number
      promptPrReview: number
    }
  }
  tasks: MyTaskItem[]
}

export async function getMyTasks(userId: string): Promise<MyTasksResult> {
  // === 并行拉取 6 类数据 ===
  // Req 4.1: 删除 manualDesigns / manualConfirms 两个分类（手动设计模块不存在了）
  //          feed_design_review 的 link 从 /designs 改成 /workbench
  const [
    boardCards,
    feedImplements,
    feedDesignReviews,
    feedRejected,
    promptPrReviews,
  ] = await Promise.all([
    // 1. 白板卡片指派给我且未完成（任何类型）
    prisma.boardSelection.findMany({
      where: {
        assigneeId: userId,
        completedAt: null,
        board: { deletedAt: null },
      },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            projectId: true,
            iteration: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    // 2. 工作台包指派给我实施的
    prisma.feedPackage.findMany({
      where: {
        assigneeId: userId,
        deletedAt: null,
        OR: [
          {
            status: { in: ['PENDING', 'IN_PROGRESS', 'REWORK'] },
            NOT: { designReviewStatus: 'REJECTED' },
          },
          {
            status: 'REVIEW',
            designReviewStatus: 'APPROVED',
          },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    }),
    // 3. 我作为设计师要审核的工作台推送
    prisma.feedPackage.findMany({
      where: {
        designReviewerId: userId,
        designReviewStatus: 'PENDING_REVIEW',
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    // 4. 工作台推送被驳回（含我创建的和指派给我的）
    prisma.feedPackage.findMany({
      where: {
        OR: [{ createdById: userId }, { assigneeId: userId }],
        designReviewStatus: 'REJECTED',
        deletedAt: null,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    // 5. 我创建的提示词上的 OPEN PR（需要我审核）
    prisma.promptPr.findMany({
      where: {
        status: 'OPEN',
        prompt: { createdById: userId, deletedAt: null },
      },
      include: {
        prompt: { select: { id: true, name: true, category: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // === 批量拉 iteration 名称 ===
  const allIterationIds = new Set<string>()
  for (const f of [...feedImplements, ...feedDesignReviews, ...feedRejected]) {
    allIterationIds.add(f.iterationId)
  }
  const iterations =
    allIterationIds.size > 0
      ? await prisma.iteration.findMany({
          where: { id: { in: [...allIterationIds] } },
          select: { id: true, name: true },
        })
      : []
  const iterationMap = new Map(iterations.map((i) => [i.id, i.name]))

  // === 拼装 tasks ===
  const tasks: MyTaskItem[] = []

  // 1. 白板卡片
  for (const sel of boardCards) {
    const typeLabel =
      sel.type === 'prompt'
        ? '提示词卡片'
        : sel.type === 'sop_doc'
          ? 'SOP 卡片'
          : sel.type === 'text'
            ? '文本卡片'
            : '便利贴'
    const iterName = sel.board?.iteration?.name ?? sel.board?.name ?? '白板协作'
    const subtitleRaw = sel.note ?? sel.content ?? ''
    const subtitle =
      subtitleRaw.length > 0 ? subtitleRaw.slice(0, 60) : '需要你修改并确认'
    tasks.push({
      id: `board-${sel.id}`,
      category: 'board_card',
      title: `${typeLabel} · ${iterName}`,
      subtitle,
      actionLabel: '去确认完成',
      link: sel.board?.iteration
        ? `/tasks/${sel.board.iteration.id}`
        : `/tasks`,
      createdAt: sel.createdAt.getTime(),
      updatedAt: sel.updatedAt.getTime(),
      meta: {
        boardId: sel.boardId,
        selectionId: sel.id,
        cardType: sel.type,
        iterationId: sel.board?.iteration?.id ?? null,
      },
    })
  }

  // 2. 工作台包实施（含"审核通过待完成"的子状态）
  for (const f of feedImplements) {
    const iterName = iterationMap.get(f.iterationId) ?? '任务'
    const isApprovedReadyToComplete =
      f.status === 'REVIEW' && f.designReviewStatus === 'APPROVED'
    const phaseLabel = f.phase === 'DESIGN' ? '设计' : '实施'
    const subtitle = isApprovedReadyToComplete
      ? `✅ 设计已审核通过，请点完成 · 第 ${f.sortOrder} 轮`
      : f.status === 'REWORK'
        ? `⚠️ 返工中 · 第 ${f.sortOrder} 轮 · ${phaseLabel}`
        : `第 ${f.sortOrder} 轮 · ${phaseLabel}${f.designOutputRequired ? ' · 需产出设计图' : ''}`
    tasks.push({
      id: `feed-impl-${f.id}`,
      category: 'feed_implement',
      title: `${f.name} · ${iterName}`,
      subtitle,
      actionLabel: isApprovedReadyToComplete ? '去完成' : '去执行',
      link: `/workbench`,
      createdAt: f.createdAt.getTime(),
      updatedAt: f.updatedAt.getTime(),
      meta: {
        feedPackageId: f.id,
        iterationId: f.iterationId,
        phase: f.phase,
        status: f.status,
        designOutputRequired: f.designOutputRequired,
        designReviewStatus: f.designReviewStatus,
        readyToComplete: isApprovedReadyToComplete,
      },
    })
  }

  // 3. 设计师待审核（Req 4.1：link 从 /designs 改到 /workbench，审核在工作台里做）
  for (const f of feedDesignReviews) {
    const iterName = iterationMap.get(f.iterationId) ?? '任务'
    tasks.push({
      id: `feed-review-${f.id}`,
      category: 'feed_design_review',
      title: `待审核：${f.name} · ${iterName}`,
      subtitle: f.figmaUrl ? `Figma: ${f.figmaUrl}` : '实施工程师已提交设计稿',
      actionLabel: '去审核',
      link: `/workbench`,
      createdAt: f.createdAt.getTime(),
      updatedAt: f.updatedAt.getTime(),
      meta: {
        feedPackageId: f.id,
        designDraftId: f.designDraftId,
        figmaUrl: f.figmaUrl,
        iterationId: f.iterationId,
      },
    })
  }

  // 4. 工作台推送被驳回
  for (const f of feedRejected) {
    const iterName = iterationMap.get(f.iterationId) ?? '任务'
    tasks.push({
      id: `feed-reject-${f.id}`,
      category: 'feed_rejected',
      title: `被驳回：${f.name} · ${iterName}`,
      subtitle: '设计师驳回，请修改后重新提交',
      actionLabel: '去修改',
      link: `/workbench`,
      createdAt: f.createdAt.getTime(),
      updatedAt: f.updatedAt.getTime(),
      meta: {
        feedPackageId: f.id,
        designDraftId: f.designDraftId,
        iterationId: f.iterationId,
      },
    })
  }

  // 5. 提示词改进建议待我审核（我是 prompt.createdById）
  for (const pr of promptPrReviews) {
    const subtitleRaw = pr.description || pr.title
    const subtitle = subtitleRaw.length > 60 ? subtitleRaw.slice(0, 60) + '…' : subtitleRaw
    tasks.push({
      id: `prompt-pr-${pr.id}`,
      category: 'prompt_pr_review',
      title: `改进建议：${pr.prompt.name} · ${pr.title}`,
      subtitle,
      actionLabel: '去审核',
      // 直接跳到 PR 详情页做审核
      link: `/prompts/${pr.promptId}/pr/${pr.id}`,
      createdAt: pr.createdAt.getTime(),
      updatedAt: pr.updatedAt.getTime(),
      meta: {
        promptId: pr.promptId,
        promptName: pr.prompt.name,
        prId: pr.id,
        submittedById: pr.submittedById,
      },
    })
  }

  // 按 updatedAt 降序
  tasks.sort((a, b) => b.updatedAt - a.updatedAt)

  return {
    summary: {
      total: tasks.length,
      byCategory: {
        boardCard: boardCards.length,
        feedImplement: feedImplements.length,
        feedDesignReview: feedDesignReviews.length,
        feedRejected: feedRejected.length,
        promptPrReview: promptPrReviews.length,
      },
    },
    tasks,
  }
}

// ========================================================================
// 效率看板：个人工作处理效率统计
// ========================================================================

export interface EfficiencyResult {
  period: {
    days: number
    start: number
    end: number
  }
  completed: {
    total: number
    boardCards: number
    feedPackages: number
    designDrafts: number
  }
  pending: {
    total: number
    byCategory: MyTasksResult['summary']['byCategory']
  }
  trend: Array<{ date: string; completed: number }>
}

export async function getEfficiency(
  userId: string,
  days: number = 30,
): Promise<EfficiencyResult> {
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  // 当前待办
  const my = await getMyTasks(userId)

  // 过去 N 天完成
  const [completedBoardCards, completedFeeds, completedDesigns] =
    await Promise.all([
      prisma.boardSelection.count({
        where: {
          assigneeId: userId,
          completedAt: { gte: start, lte: end },
        },
      }),
      prisma.feedPackage.count({
        where: {
          assigneeId: userId,
          status: 'DONE',
          updatedAt: { gte: start, lte: end },
          deletedAt: null,
        },
      }),
      prisma.designDraft.count({
        where: {
          OR: [
            {
              assigneeId: userId,
              status: 'CONFIRMED',
              updatedAt: { gte: start, lte: end },
            },
            {
              confirmedById: userId,
              updatedAt: { gte: start, lte: end },
            },
          ],
          deletedAt: null,
        },
      }),
    ])

  // 近 14 天的每日完成趋势
  const trendDays = Math.min(Math.max(days, 7), 14)
  const trendStart = new Date(end.getTime() - trendDays * 24 * 60 * 60 * 1000)

  const [recentCards, recentFeeds, recentDesigns] = await Promise.all([
    prisma.boardSelection.findMany({
      where: {
        assigneeId: userId,
        completedAt: { gte: trendStart, lte: end },
      },
      select: { completedAt: true },
    }),
    prisma.feedPackage.findMany({
      where: {
        assigneeId: userId,
        status: 'DONE',
        updatedAt: { gte: trendStart, lte: end },
        deletedAt: null,
      },
      select: { updatedAt: true },
    }),
    prisma.designDraft.findMany({
      where: {
        OR: [
          { assigneeId: userId, status: 'CONFIRMED' },
          { confirmedById: userId },
        ],
        updatedAt: { gte: trendStart, lte: end },
        deletedAt: null,
      },
      select: { updatedAt: true },
    }),
  ])

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  const bucket = new Map<string, number>()
  for (let i = 0; i < trendDays; i++) {
    const d = new Date(end.getTime() - (trendDays - 1 - i) * 24 * 60 * 60 * 1000)
    bucket.set(ymd(d), 0)
  }
  const addToBucket = (d: Date | null) => {
    if (!d) return
    const key = ymd(d)
    if (bucket.has(key)) bucket.set(key, bucket.get(key)! + 1)
  }
  recentCards.forEach((c) => addToBucket(c.completedAt))
  recentFeeds.forEach((f) => addToBucket(f.updatedAt))
  recentDesigns.forEach((d) => addToBucket(d.updatedAt))

  const trend = [...bucket.entries()].map(([date, completed]) => ({
    date,
    completed,
  }))

  return {
    period: {
      days,
      start: start.getTime(),
      end: end.getTime(),
    },
    completed: {
      total: completedBoardCards + completedFeeds + completedDesigns,
      boardCards: completedBoardCards,
      feedPackages: completedFeeds,
      designDrafts: completedDesigns,
    },
    pending: {
      total: my.summary.total,
      byCategory: my.summary.byCategory,
    },
    trend,
  }
}

// ========== Internal: OKR Snapshots ==========

async function getOkrSnapshots(
  projectId?: string,
): Promise<OkrSnapshotResult[]> {
  const whereClause = projectId
    ? { objective: { projectId, deletedAt: null } }
    : { objective: { deletedAt: null } }

  const keyResults = await prisma.keyResult.findMany({
    where: whereClause,
    include: {
      objective: {
        select: { deletedAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return keyResults.map((kr) => ({
    krId: kr.id,
    krName: kr.name,
    targetValue: kr.targetValue,
    currentValue: kr.currentValue,
    unit: kr.unit,
    status: computeOkrStatus(kr.targetValue, kr.currentValue),
  }))
}

// ========================================================================
// PM Metrics 聚合：8 个专业指标看板（Req 5）
// ========================================================================
//
// 指标定义：
//   1. Throughput      : 时间窗内完成的卡片/包数量（+ 按天分布）
//   2. Cycle Time      : 卡片创建 -> 完成 的平均/p50/p90 小时数 + 分布
//   3. Lead Time       : Iteration 创建 -> 最后一个 Feed DONE 的平均天数
//   4. WIP             : 当前未完成的 BoardSelection / FeedPackage / Iteration
//   5. Rejection Rate  : 设计审核被驳回的 FeedPackage 占比
//   6. Hourly Activity : 24 小时活跃度分布（以 BoardSelection 的 createdAt 为证据）
//   7. Top Collaborators: 完成卡片数 TOP 10
//   8. Layer Distribution: SOP 八层的占比
// ========================================================================

export interface PmMetricsInput {
  projectId?: string
  days?: number
  /** 筛选：只统计指派给此 user 的数据 */
  userId?: string
  /** 筛选：只统计 assignee 属于此 squad 的数据 */
  squadId?: string
}

export interface PmMetricsResult {
  throughput: {
    total: number
    trend: Array<{ date: string; count: number }>
  }
  cycleTime: {
    avgHours: number
    p50Hours: number
    p90Hours: number
    distribution: Array<{ bucket: string; count: number }>
  }
  leadTime: {
    avgDays: number
    p50Days: number
    samples: number
  }
  wip: {
    boardSelections: number
    feedPackages: number
    iterations: number
  }
  rejectionRate: {
    total: number
    rejected: number
    rate: number
  }
  hourlyDistribution: Array<{ hour: number; activityCount: number }>
  topCollaborators: Array<{
    userId: string
    name: string
    avatar: string | null
    completed: number
    avgCycleHours: number
  }>
  layerDistribution: Array<{
    layer: string
    count: number
    percent: number
  }>
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  const frac = rank - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

function bucketizeCycleHours(hoursArr: number[]): Array<{ bucket: string; count: number }> {
  const buckets = [
    { bucket: '< 4h', count: 0 },
    { bucket: '4-24h', count: 0 },
    { bucket: '1-3d', count: 0 },
    { bucket: '3-7d', count: 0 },
    { bucket: '> 7d', count: 0 },
  ]
  for (const h of hoursArr) {
    if (h < 4) buckets[0].count++
    else if (h < 24) buckets[1].count++
    else if (h < 72) buckets[2].count++
    else if (h < 168) buckets[3].count++
    else buckets[4].count++
  }
  return buckets
}

const SOP_LAYERS: string[] = [
  'PRODUCT_REQ',
  'CONTENT',
  'DESIGN_SYSTEM',
  'FRONTEND_ARCH',
  'BACKEND_ARCH',
  'AI_PROMPTS',
  'ACCEPTANCE',
  'APPENDIX',
]

export async function getPmMetrics(
  input: PmMetricsInput = {},
): Promise<PmMetricsResult> {
  const days = Math.max(1, Math.min(365, input.days ?? 30))
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  const projectId = input.projectId
  let userId = input.userId
  const squadId = input.squadId

  // squadId 筛选：展开为 userId IN (squad members)，然后按 assignee 过滤
  // 如果 squadId 和 userId 同时传了，userId 优先（更细的筛选）
  let squadUserIds: string[] | null = null
  if (squadId && !userId) {
    const members = await prisma.user.findMany({
      where: { squadId, deletedAt: null },
      select: { id: true },
    })
    squadUserIds = members.map((m) => m.id)
    // 如果 squad 为空，用一个不可能存在的 id 保证 where 查询返回空
    if (squadUserIds.length === 0) squadUserIds = ['__empty_squad__']
  }

  // BoardSelection 按 projectId 过滤需要走 board.projectId
  const assigneeFilter: Record<string, unknown> | null = userId
    ? { assigneeId: userId }
    : squadUserIds
      ? { assigneeId: { in: squadUserIds } }
      : null

  const boardWhereBase = {
    ...(projectId ? { board: { projectId, deletedAt: null } } : { board: { deletedAt: null } }),
    ...(assigneeFilter ?? {}),
  }
  // FeedPackage 按 projectId 过滤需要先查 iteration.id
  let iterationIdsInProject: string[] | null = null
  if (projectId) {
    const its = await prisma.iteration.findMany({
      where: { projectId },
      select: { id: true },
    })
    iterationIdsInProject = its.map((i) => i.id)
  }

  const feedWhereBase = {
    deletedAt: null,
    ...(iterationIdsInProject ? { iterationId: { in: iterationIdsInProject } } : {}),
    ...(assigneeFilter ?? {}),
  }
  // 避免未使用变量警告（userId 在后续 topCollaborators 等场景可能有用）
  void userId

  // ===== 并行拉取所有需要的数据 =====
  const [
    completedBoardInWindow,
    completedFeedsInWindow,
    allBoardCreatedInWindow,
    allFeedsInWindow,
    wipBoardSelectionsCount,
    wipFeedPackagesCount,
    wipIterationsCount,
    topCollaboratorRows,
    layerRows,
    iterationsForLeadTime,
  ] = await Promise.all([
    // Throughput + CycleTime 源：时间窗内完成的 BoardSelection
    prisma.boardSelection.findMany({
      where: {
        ...boardWhereBase,
        completedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        createdAt: true,
        completedAt: true,
        assigneeId: true,
        layer: true,
        type: true,
      },
    }),
    // Throughput + CycleTime 源：时间窗内完成的 FeedPackage
    prisma.feedPackage.findMany({
      where: {
        ...feedWhereBase,
        status: 'DONE',
        updatedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        assigneeId: true,
      },
    }),
    // Hourly Distribution 源：时间窗内创建的 BoardSelection（按 createdAt）
    prisma.boardSelection.findMany({
      where: {
        ...boardWhereBase,
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true, updatedAt: true },
    }),
    // Rejection Rate 源：时间窗内更新的 FeedPackage（驳回是 updatedAt 语义）
    prisma.feedPackage.findMany({
      where: {
        ...feedWhereBase,
        updatedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        designReviewStatus: true,
      },
    }),
    // WIP
    // P-4 修正：
    // - boardSelection 口径放宽到所有被指派且未完成的卡片（不限 type=prompt）
    //   原来只数 prompt 会漏掉 sop_doc / sticky / text 卡片
    prisma.boardSelection.count({
      where: {
        ...boardWhereBase,
        completedAt: null,
        assigneeId: { not: null },
      },
    }),
    // - feedPackage 口径放宽到所有未 DONE 的包（PENDING / IN_PROGRESS / REVIEW / BLOCKED / REWORK）
    //   原来只数 IN_PROGRESS + REVIEW 会漏掉 advance 刚生成还没开始执行的 PENDING 包
    prisma.feedPackage.count({
      where: {
        ...feedWhereBase,
        status: { not: 'DONE' },
      },
    }),
    prisma.iteration.count({
      where: {
        ...(projectId ? { projectId } : {}),
        status: { not: 'DONE' },
      },
    }),
    // Top Collaborators：按 assigneeId 聚合完成数
    prisma.boardSelection.findMany({
      where: {
        ...boardWhereBase,
        completedAt: { gte: start, lte: end },
        assigneeId: { not: null },
      },
      select: {
        assigneeId: true,
        createdAt: true,
        completedAt: true,
      },
    }),
    // Layer Distribution 源：时间窗内创建的 BoardSelection（含 layer）
    prisma.boardSelection.findMany({
      where: {
        ...boardWhereBase,
        createdAt: { gte: start, lte: end },
      },
      select: { layer: true },
    }),
    // Lead Time 源：DONE 状态的 Iteration（样本）
    prisma.iteration.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        status: 'DONE',
      },
      select: { id: true, createdAt: true, updatedAt: true },
    }),
  ])

  // ===== 1. Throughput =====
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  const trendBucket = new Map<string, number>()
  for (let i = 0; i < days; i++) {
    const d = new Date(end.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000)
    trendBucket.set(ymd(d), 0)
  }
  const addTrend = (d: Date | null) => {
    if (!d) return
    const key = ymd(d)
    if (trendBucket.has(key)) trendBucket.set(key, trendBucket.get(key)! + 1)
  }
  for (const row of completedBoardInWindow) addTrend(row.completedAt)
  for (const row of completedFeedsInWindow) addTrend(row.updatedAt)
  const throughputTrend = [...trendBucket.entries()].map(([date, count]) => ({
    date,
    count,
  }))
  const throughputTotal = completedBoardInWindow.length + completedFeedsInWindow.length

  // ===== 2. Cycle Time =====
  const cycleHoursAll: number[] = []
  for (const row of completedBoardInWindow) {
    if (row.completedAt) {
      const diffMs = row.completedAt.getTime() - row.createdAt.getTime()
      if (diffMs >= 0) cycleHoursAll.push(diffMs / (1000 * 60 * 60))
    }
  }
  for (const row of completedFeedsInWindow) {
    const diffMs = row.updatedAt.getTime() - row.createdAt.getTime()
    if (diffMs >= 0) cycleHoursAll.push(diffMs / (1000 * 60 * 60))
  }
  cycleHoursAll.sort((a, b) => a - b)
  const avgHours =
    cycleHoursAll.length > 0
      ? cycleHoursAll.reduce((a, b) => a + b, 0) / cycleHoursAll.length
      : 0
  const cycleTime = {
    avgHours: Math.round(avgHours * 10) / 10,
    p50Hours: Math.round(percentile(cycleHoursAll, 50) * 10) / 10,
    p90Hours: Math.round(percentile(cycleHoursAll, 90) * 10) / 10,
    distribution: bucketizeCycleHours(cycleHoursAll),
  }

  // ===== 3. Lead Time =====
  // 对每个 DONE 的 Iteration，取它名下所有 FeedPackage 里最晚完成的一个作为上线时间
  const leadTimeIterIds = iterationsForLeadTime.map((i) => i.id)
  let leadDaysList: number[] = []
  if (leadTimeIterIds.length > 0) {
    const feedsForLead = await prisma.feedPackage.findMany({
      where: {
        iterationId: { in: leadTimeIterIds },
        status: 'DONE',
        deletedAt: null,
      },
      select: { iterationId: true, updatedAt: true },
    })
    // 按 iteration 分组，取 updatedAt 的 max
    const lastByIter = new Map<string, Date>()
    for (const f of feedsForLead) {
      const cur = lastByIter.get(f.iterationId)
      if (!cur || f.updatedAt.getTime() > cur.getTime()) {
        lastByIter.set(f.iterationId, f.updatedAt)
      }
    }
    for (const it of iterationsForLeadTime) {
      const last = lastByIter.get(it.id)
      if (last) {
        const diffMs = last.getTime() - it.createdAt.getTime()
        if (diffMs >= 0) leadDaysList.push(diffMs / (1000 * 60 * 60 * 24))
      }
    }
    leadDaysList.sort((a, b) => a - b)
  }
  const avgLeadDays =
    leadDaysList.length > 0
      ? leadDaysList.reduce((a, b) => a + b, 0) / leadDaysList.length
      : 0
  const leadTime = {
    avgDays: Math.round(avgLeadDays * 10) / 10,
    p50Days: Math.round(percentile(leadDaysList, 50) * 10) / 10,
    samples: leadDaysList.length,
  }

  // ===== 4. WIP =====
  const wip = {
    boardSelections: wipBoardSelectionsCount,
    feedPackages: wipFeedPackagesCount,
    iterations: wipIterationsCount,
  }

  // ===== 5. Rejection Rate =====
  const totalFeeds = allFeedsInWindow.length
  const rejectedFeeds = allFeedsInWindow.filter(
    (f) => f.designReviewStatus === 'REJECTED',
  ).length
  const rejectionRate = {
    total: totalFeeds,
    rejected: rejectedFeeds,
    rate: totalFeeds > 0 ? Math.round((rejectedFeeds / totalFeeds) * 1000) / 10 : 0,
  }

  // ===== 6. Hourly Distribution =====
  const hourBuckets: number[] = new Array(24).fill(0)
  for (const row of allBoardCreatedInWindow) {
    hourBuckets[row.createdAt.getUTCHours()]++
    if (
      row.updatedAt &&
      row.updatedAt.getTime() !== row.createdAt.getTime()
    ) {
      hourBuckets[row.updatedAt.getUTCHours()]++
    }
  }
  const hourlyDistribution = hourBuckets.map((activityCount, hour) => ({
    hour,
    activityCount,
  }))

  // ===== 7. Top Collaborators =====
  // 按 assigneeId 分组聚合：完成数 + avg cycle hours
  interface CollabAgg {
    count: number
    cycleSum: number
  }
  const collabAgg = new Map<string, CollabAgg>()
  for (const row of topCollaboratorRows) {
    if (!row.assigneeId) continue
    const prev = collabAgg.get(row.assigneeId) ?? { count: 0, cycleSum: 0 }
    prev.count++
    if (row.completedAt) {
      const diffHours = (row.completedAt.getTime() - row.createdAt.getTime()) / (1000 * 60 * 60)
      if (diffHours >= 0) prev.cycleSum += diffHours
    }
    collabAgg.set(row.assigneeId, prev)
  }
  const collabIds = [...collabAgg.keys()]
  const collabUsers =
    collabIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: collabIds } },
          select: { id: true, name: true, avatar: true },
        })
      : []
  const collabUserMap = new Map(collabUsers.map((u) => [u.id, u]))
  const topCollaborators = collabIds
    .map((id) => {
      const agg = collabAgg.get(id)!
      const u = collabUserMap.get(id)
      return {
        userId: id,
        name: u?.name ?? '未知用户',
        avatar: u?.avatar ?? null,
        completed: agg.count,
        avgCycleHours:
          agg.count > 0 ? Math.round((agg.cycleSum / agg.count) * 10) / 10 : 0,
      }
    })
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10)

  // ===== 8. Layer Distribution =====
  const layerCounts = new Map<string, number>()
  for (const layer of SOP_LAYERS) layerCounts.set(layer, 0)
  let layerTotal = 0
  for (const row of layerRows) {
    if (row.layer) {
      layerCounts.set(row.layer, (layerCounts.get(row.layer) ?? 0) + 1)
      layerTotal++
    }
  }
  const layerDistribution = SOP_LAYERS.map((layer) => {
    const count = layerCounts.get(layer) ?? 0
    return {
      layer,
      count,
      percent: layerTotal > 0 ? Math.round((count / layerTotal) * 1000) / 10 : 0,
    }
  })

  return {
    throughput: {
      total: throughputTotal,
      trend: throughputTrend,
    },
    cycleTime,
    leadTime,
    wip,
    rejectionRate,
    hourlyDistribution,
    topCollaborators,
    layerDistribution,
  }
}
