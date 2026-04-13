import request from './request'

// ========== Types ==========

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

export interface OkrSnapshotItem {
  krId: string
  krName: string
  targetValue: number
  currentValue: number
  unit: string
  status: 'on_track' | 'at_risk' | 'behind'
}

export interface MonthlyPlanItem {
  id: string
  title: string
  status: string
  progress: number
}

export interface SquadStatusItem {
  squadId: string
  squadName: string
  currentStep: string
  currentTask: string
  blockers: string[]
  monthlyPlan: MonthlyPlanItem[]
}

export interface ProjectOverviewItem {
  projectId: string
  projectName: string
  squads: SquadStatusItem[]
}

export interface CompanyDashboardData {
  projects: ProjectOverviewItem[]
  okrSnapshot: OkrSnapshotItem[]
}

// ========== 我的任务聚合（Phase 2 新增） ==========

/** "我的任务" 的类别 */
export type MyTaskCategory =
  | 'board_card' // 白板上指派给我且未完成
  | 'feed_implement' // 工作台包待我实施
  | 'feed_design_review' // 我作为设计师待审核
  | 'feed_rejected' // 我的工作台推送被驳回
  | 'prompt_pr_review' // 我创建的提示词上有 OPEN PR 待我审核

export interface MyTaskItem {
  /** 唯一 ID（前缀 + 实体 id）*/
  id: string
  category: MyTaskCategory
  /** 卡片标题 */
  title: string
  /** 卡片副标题（状态/进度提示） */
  subtitle: string
  /** 操作按钮文本 */
  actionLabel: string
  /** 点击跳转目标路由 */
  link: string
  createdAt: number
  updatedAt: number
  /** 类型相关元数据（boardId/selectionId/feedPackageId/designDraftId 等） */
  meta: Record<string, unknown>
}

export interface MyTasksSummary {
  total: number
  byCategory: {
    boardCard: number
    feedImplement: number
    feedDesignReview: number
    feedRejected: number
    promptPrReview: number
  }
}

export interface MyTasksResult {
  summary: MyTasksSummary
  tasks: MyTaskItem[]
}

// ========== 效率看板（Phase 2 新增） ==========

export interface EfficiencyTrendPoint {
  date: string // YYYY-MM-DD
  completed: number
}

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
    byCategory: MyTasksSummary['byCategory']
  }
  trend: EfficiencyTrendPoint[]
}

// ========== 团队效能看板（Req 5 新增） ==========

export interface PmMetricsThroughput {
  total: number
  trend: Array<{ date: string; count: number }>
}

export interface PmMetricsCycleTime {
  avgHours: number
  p50Hours: number
  p90Hours: number
  distribution: Array<{ bucket: string; count: number }>
}

export interface PmMetricsLeadTime {
  avgDays: number
  p50Days: number
  samples: number
}

export interface PmMetricsWip {
  boardSelections: number
  feedPackages: number
  iterations: number
}

export interface PmMetricsRejectionRate {
  total: number
  rejected: number
  rate: number
}

export interface PmMetricsHourlyBucket {
  hour: number
  activityCount: number
}

export interface PmMetricsCollaborator {
  userId: string
  name: string
  avatar: string | null
  completed: number
  avgCycleHours: number
}

export interface PmMetricsLayerBucket {
  layer: string
  count: number
  percent: number
}

export type PmMetricsScope = 'all' | 'project' | 'squad' | 'user'

/** 后端返回的 "_scope" 字段：实际生效的权限 / 筛选状态 */
export interface PmMetricsScopeInfo {
  isAdmin: boolean
  effectiveScope: PmMetricsScope
  effectiveUserId: string | null
  effectiveProjectId: string | null
  effectiveSquadId: string | null
}

export interface PmMetrics {
  throughput: PmMetricsThroughput
  cycleTime: PmMetricsCycleTime
  leadTime: PmMetricsLeadTime
  wip: PmMetricsWip
  rejectionRate: PmMetricsRejectionRate
  hourlyDistribution: PmMetricsHourlyBucket[]
  topCollaborators: PmMetricsCollaborator[]
  layerDistribution: PmMetricsLayerBucket[]
  /** 服务端回传的权限 / 筛选 snapshot */
  _scope: PmMetricsScopeInfo
}

// ========== API Functions ==========

export function getDashboardApi(params?: { projectId?: string; month?: string }) {
  return request.get<ApiResponse<CompanyDashboardData>>('/dashboard', { params })
}

/**
 * 获取当前用户的"我的任务"聚合（6 类待办）
 */
export function getMyTasksApi() {
  return request.get<ApiResponse<MyTasksResult>>('/dashboard/my-tasks')
}

/**
 * 获取当前用户的效率看板
 * @param days 统计窗口天数，默认 30
 */
export function getEfficiencyApi(days: number = 30) {
  return request.get<ApiResponse<EfficiencyResult>>('/dashboard/efficiency', {
    params: { days },
  })
}

/**
 * 获取团队效能看板（8 个专业 PM 指标）
 *
 * 权限：
 *   - 普通用户无论传什么 scope，后端都会强制 scope='user' + userId=自己
 *   - ADMIN 可以选 scope='all'|'project'|'squad'|'user'
 */
export function getPmMetricsApi(params?: {
  scope?: PmMetricsScope
  projectId?: string
  squadId?: string
  userId?: string
  days?: number
}) {
  return request.get<ApiResponse<PmMetrics>>('/dashboard/pm-metrics', {
    params,
  })
}
