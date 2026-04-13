// 项目数据看板 接口契约
// agent-dash 负责实现

import type { IterationStatus } from './common'

// ========== 项目看板（分层下钻）==========

// 公司级看板
export interface CompanyDashboard {
  projects: ProjectOverview[]
  okrSnapshot: OkrSnapshot[]
}

// 项目概览
export interface ProjectOverview {
  projectId: string
  projectName: string
  squads: SquadStatus[]
}

// 小组状态
export interface SquadStatus {
  squadId: string
  squadName: string
  currentStep: IterationStatus   // 当前处于 ①→⑤ 哪一步
  currentTask: string            // 当前在做什么
  blockers: string[]             // 阻塞点
  monthlyPlan: MonthlyPlanItem[]
}

// 月度计划项
export interface MonthlyPlanItem {
  id: string
  title: string
  status: IterationStatus
  progress: number               // 0-100
}

// OKR 快照
export interface OkrSnapshot {
  krId: string
  krName: string
  targetValue: number
  currentValue: number
  unit: string                   // "%", "s", "ms", "次"...
  status: 'on_track' | 'at_risk' | 'behind'
}

// ========== 查询参数 ==========

export interface DashboardQuery {
  projectId?: string             // 不传 = 公司级
  month?: string                 // "2026-04"，不传 = 当月
}

// ============================================================
// Learning Dashboard (Learning Copilot v2.0) — 首页数据
// 对应 GET /api/v1/dashboard/learning
// ============================================================

import type { HypothesisBrief } from './api-hypothesis'
import type { CopilotDigest } from './api-copilot'

/**
 * KR 进度摘要。
 * - progressPercent：绝对百分比 0-100+
 * - progressStatus：综合时间维度 + KPI 维度的健康状态
 */
export interface ActiveKRSummary {
  id: string
  name: string
  objectiveId: string
  objectiveName: string
  targetValue: number
  currentValue: number
  baseline: number
  unit: string

  // G8：时间维度
  startDate: number
  endDate: number | null // null = open-ended
  daysElapsed: number
  daysTotal: number | null // null = open-ended
  daysLeft: number | null // null = open-ended

  /** KPI 进度比率：(current - baseline) / (target - baseline)，0-1+ */
  kpiProgressRatio: number
  /** 时间进度比率：daysElapsed / daysTotal，0-1。open-ended 时为 null */
  timeElapsedRatio: number | null

  /** 综合状态：on_track/behind/critical，open-ended 时退回 KPI 绝对百分比 */
  progressStatus: 'on_track' | 'behind' | 'critical'

  /** 贡献统计 */
  contributionHypothesisCount: number
  lastHypothesisAt: number | null
  isStagnant: boolean // > 7 天无新 RUNNING hypothesis
}

export interface ThisWeekHypothesesBuckets {
  running: HypothesisBrief[]
  closedWins: HypothesisBrief[]
  closedLosses: HypothesisBrief[]
  backlog: HypothesisBrief[]
}

export interface LearningDashboardSummary {
  totalHypothesesThisWeek: number
  winRate: number // 0-1
  learningVelocity: number // 本周闭环的假设数
}

export interface LearningDashboardResponse {
  activeKRs: ActiveKRSummary[]
  thisWeekHypotheses: ThisWeekHypothesesBuckets
  latestCopilotDigest: CopilotDigest | null
  summary: LearningDashboardSummary
}

export interface LearningDashboardQuery {
  projectId?: string
  /** admin 可切换 'all'（全量）| 'mine'（自己 squad）*/
  scope?: 'all' | 'mine'
}

// ============================================================
// Cross-Project Dashboard (G10 — ADMIN only)
// ============================================================

export interface CrossProjectRow {
  projectId: string
  projectName: string
  activeKRCount: number
  kpiAchievementRate: number // 0-1，所有 active KR 的平均 progressPercent
  hypothesisCount: number // 本月
  winRate: number // 0-1
  learningVelocity: number
  stagnantKRs: number
}

export interface CrossProjectPattern {
  title: string
  description: string
  evidenceProjectIds: string[]
  recommendation: string
}

export interface CrossProjectDashboardResponse {
  projects: CrossProjectRow[]
  crossPatterns: CrossProjectPattern[]
  generatedAt: number
}
