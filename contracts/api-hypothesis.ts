// Hypothesis-driven Learning Copilot — 核心 API 契约
// Agent: backend-hypothesis
// 参考 docs/prd-learning-copilot.md §5, §6.1, §6.6, §6.7, §6.9

import type { UserBrief, PaginationQuery, PaginationResponse } from './common'
import type { LearningBrief } from './api-learning'

// ============================================================
// Enums
// ============================================================

export type HypothesisStatus =
  | 'BACKLOG' // 待开始
  | 'RUNNING' // 跑中
  | 'CLOSED_WIN' // 胜出
  | 'CLOSED_LOSS' // 失败
  | 'CLOSED_FLAT' // 持平（统计上不显著）
  | 'ABANDONED' // 放弃

/**
 * metricType 是 string 不是 enum（D25 决策）——用 whitelist 维护。
 * 当前合法值：
 * - conversion_rate (0.0-1.0)
 * - count
 * - ratio
 * - revenue_cny
 * - duration_seconds
 * - duration_ms
 * - latency_ms
 * - score (0-10 / NPS 等)
 * - percentage
 * - custom
 */
export type MetricType = string

export type ResultConclusion = 'WIN' | 'LOSS' | 'FLAT' | 'INCONCLUSIVE'

export type VariantStatus = 'CONTROL' | 'TREATMENT'

export type CopilotConfidence = 'high' | 'medium' | 'low'

// ============================================================
// Hypothesis
// ============================================================

export interface HypothesisBrief {
  id: string
  krId: string
  krName: string
  parentId: string | null

  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue: number | null
  expectedImpactUnit: string | null

  status: HypothesisStatus

  /** 可选：从哪个模板创建的 */
  templateId: string | null

  /** ICE 打分（可选，可选填一套） */
  iceImpact: number | null // 1-10
  iceConfidence: number | null // 1-10
  iceEase: number | null // 1-10
  iceScore: number | null // 服务端计算

  /** RICE 打分（可选） */
  riceReach: number | null // 用户数/周
  riceImpact: number | null // 0.25/0.5/1/2/3
  riceConfidence: number | null // 50/80/100
  riceEffort: number | null // 人周
  riceScore: number | null // 服务端计算

  owner: UserBrief
  createdAt: number
  updatedAt: number
  closedAt: number | null
}

export interface HypothesisDetail extends HypothesisBrief {
  parent: HypothesisBrief | null
  children: HypothesisBrief[]
  iterations: IterationBrief[]
  result: HypothesisResult | null
  variants: HypothesisVariant[]
  learnings: LearningBrief[]
}

export interface IterationBrief {
  id: string
  name: string
  status: string // IterationStatus
  /** Phase B: 任务工作区 boardId，前端拿来跳 /tasks/:boardId */
  boardId: string | null
  /** Phase B: 该 iteration 下的 feed 包数量 */
  feedCount: number
  createdAt: number
  assigneeId: string | null
  closedAt: number | null
}

// ============================================================
// HypothesisResult (1:1 with Hypothesis, 单变体场景)
// ============================================================

export interface HypothesisResult {
  id: string
  hypothesisId: string
  metricType: MetricType
  metricName: string
  baseline: number
  actual: number
  delta: number // 服务端计算 actual - baseline
  unit: string | null
  conclusion: ResultConclusion
  humanNote: string | null
  createdAt: number
}

// ============================================================
// HypothesisVariant (G7: A/B 测试 + 显著性检验)
// ============================================================

export interface HypothesisVariant {
  id: string
  hypothesisId: string
  name: string // "A - 原版" / "B - 红色按钮"
  description: string | null
  type: VariantStatus // CONTROL | TREATMENT

  /** 手填（不接外部 analytics） */
  sampleSize: number | null
  conversionCount: number | null
  metricValue: number | null
  metricUnit: string | null

  /** 服务端计算，不接受客户端传值 */
  conversionRate: number | null
  stdError: number | null
  pValue: number | null // 相对 CONTROL 的 p-value
  confidenceInterval95Low: number | null
  confidenceInterval95High: number | null
  isSignificant: boolean | null // p < 0.05
  isWinner: boolean

  createdAt: number
  updatedAt: number
}

// ============================================================
// Requests
// ============================================================

export interface CreateHypothesisRequest {
  krId: string
  parentId?: string | null
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
  /** 可选：从模板创建时传 */
  templateId?: string | null
}

export interface CreateHypothesisFromTemplateRequest {
  templateId: string
  krId: string
  parentId?: string | null
  /** 替换模板 placeholder 的实际值 */
  placeholderValues: Record<string, string | number>
}

export interface UpdateHypothesisRequest {
  statement?: string
  mechanism?: string
  expectedImpact?: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
  status?: Extract<HypothesisStatus, 'BACKLOG' | 'RUNNING' | 'ABANDONED'>
}

export interface CloseHypothesisRequest {
  metricType: MetricType
  metricName: string
  baseline: number
  actual: number
  unit?: string
  conclusion: ResultConclusion
  humanNote?: string
}

export interface CloseHypothesisResponse {
  hypothesis: HypothesisDetail
  result: HypothesisResult
  /** Copilot 处理异步：close 时总是 pending，前端需要轮询 hypothesis detail 看 learnings 更新 */
  copilotStatus: 'pending' | 'success' | 'failed' | 'unavailable'
  copilotError?: string
}

export interface CreateVariantRequest {
  name: string
  description?: string
  type: VariantStatus
}

export interface UpdateVariantResultsRequest {
  sampleSize?: number
  conversionCount?: number
  metricValue?: number
  metricUnit?: string
}

export interface UpdateVariantResultsResponse {
  /** 所有 variants（含本 hypothesis 的其他 variant），pValue 已重算 */
  variants: HypothesisVariant[]
}

export interface MarkWinnerRequest {
  force?: boolean // 非显著时需要 force=true
}

// ============================================================
// Scoring (G9: ICE / RICE)
// ============================================================

export interface UpdateIceScoringRequest {
  iceImpact: number // 1-10
  iceConfidence: number // 1-10
  iceEase: number // 1-10
}

export interface UpdateRiceScoringRequest {
  riceReach: number
  riceImpact: number // 0.25/0.5/1/2/3
  riceConfidence: number // 50/80/100
  riceEffort: number
}

// ============================================================
// Tree (G11: Parent Chain Visualization)
// ============================================================

export interface HypothesisTreeNode {
  id: string
  statement: string
  status: HypothesisStatus
  /** 对应 hypothesis_result.delta 或 variant winner delta。null 表示未闭环或 ABANDONED */
  delta: number | null
  /** 递归子节点（深度限制 20） */
  children: HypothesisTreeNode[]
}

export interface HypothesisTreeResponse {
  root: HypothesisTreeNode
  depth: number
  totalNodes: number
  /** 如果 depth > 20 被截断 */
  truncated: boolean
}

// ============================================================
// Query
// ============================================================

export interface ListHypothesisQuery extends PaginationQuery {
  krId?: string
  /** 可传单个或 comma 分隔多个 */
  status?: HypothesisStatus | HypothesisStatus[]
  ownerId?: string
  mine?: boolean
  /** 按 iceScore / riceScore / createdAt / closedAt 排序 */
  sortBy?: 'createdAt' | 'closedAt' | 'iceScore' | 'riceScore' | 'updatedAt'
  order?: 'asc' | 'desc'
}

export type ListHypothesisResponse = PaginationResponse<HypothesisBrief>
