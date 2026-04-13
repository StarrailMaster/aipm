/**
 * Learning Copilot Dashboard API client
 *
 * - GET /dashboard/learning: 首页数据
 * - POST /dashboard/learning/digest: 手动触发 digest
 * - GET /dashboard/cross-project: ADMIN only 跨项目看板
 * - GET /dashboard/copilot-cost: ADMIN only 月度成本摘要
 */
import request from './request'
import type { HypothesisBrief } from './hypothesis'

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

// ============================================================
// Learning Dashboard
// ============================================================

export type KrProgressStatus = 'on_track' | 'behind' | 'critical'

export interface ActiveKRSummary {
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
  progressStatus: KrProgressStatus
  contributionHypothesisCount: number
  lastHypothesisAt: number | null
  isStagnant: boolean
}

export interface ThisWeekHypothesesBuckets {
  running: HypothesisBrief[]
  closedWins: HypothesisBrief[]
  closedLosses: HypothesisBrief[]
  backlog: HypothesisBrief[]
}

export interface CopilotLearningItem {
  hypothesisId: string
  text: string
  squadId: string | null
}

export interface CopilotPattern {
  title: string
  description: string
  evidenceHypothesisIds: string[]
  recommendation: string
  confidence: 'high' | 'medium' | 'low'
  relatedSquadIds: string[]
}

export interface CopilotNextHypothesisSuggestion {
  krId: string
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue: number | null
  expectedImpactUnit: string | null
  targetSquadId: string | null
}

export interface CopilotAlert {
  type: string
  krId?: string
  krName?: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  evidenceHypothesisIds?: string[]
  squadId: string | null
}

export interface CopilotDigest {
  id: string
  scope: string
  triggerType: string
  payload: {
    learnings: CopilotLearningItem[]
    patterns: CopilotPattern[]
    nextHypothesisSuggestions: CopilotNextHypothesisSuggestion[]
    alerts: CopilotAlert[]
  } | null
  createdAt: number
}

export interface LearningDashboardResponse {
  activeKRs: ActiveKRSummary[]
  thisWeekHypotheses: ThisWeekHypothesesBuckets
  latestCopilotDigest: CopilotDigest | null
  summary: {
    totalHypothesesThisWeek: number
    winRate: number
    learningVelocity: number
  }
}

export function getLearningDashboardApi(params?: {
  projectId?: string
  scope?: 'all' | 'mine'
}) {
  return request.get<ApiResponse<LearningDashboardResponse>>('/dashboard/learning', {
    params,
  })
}

export function triggerDigestApi(scope: string = 'global') {
  return request.post<ApiResponse<{ jobId: string; scope: string }>>(
    '/dashboard/learning/digest',
    { scope },
  )
}

// ============================================================
// Cross-Project Dashboard (ADMIN only)
// ============================================================

export interface CrossProjectRow {
  projectId: string
  projectName: string
  activeKRCount: number
  kpiAchievementRate: number
  hypothesisCount: number
  winRate: number
  learningVelocity: number
  stagnantKRs: number
}

export interface CrossProjectDashboardResponse {
  projects: CrossProjectRow[]
  crossPatterns: Array<{
    title: string
    description: string
    evidenceHypothesisIds: string[]
    recommendation: string
  }>
  generatedAt: number
}

export function getCrossProjectDashboardApi() {
  return request.get<ApiResponse<CrossProjectDashboardResponse>>(
    '/dashboard/cross-project',
  )
}

// ============================================================
// Cost Summary (ADMIN only)
// ============================================================

export interface CopilotCostSummary {
  month: string
  totalCalls: number
  totalTokensIn: number
  totalTokensOut: number
  totalCostUsd: number
  breakdownByTrigger: Record<string, { calls: number; costUsd: number }>
  remainingQuota: number
}

export function getCopilotCostSummaryApi(month?: string) {
  return request.get<ApiResponse<CopilotCostSummary>>('/dashboard/copilot-cost', {
    params: month ? { month } : undefined,
  })
}
