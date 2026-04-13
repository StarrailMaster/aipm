/**
 * Hypothesis API client
 *
 * 对应后端 /api/v1/hypotheses 全套路由。
 */
import request from './request'

// ============================================================
// Types（与 contracts/api-hypothesis.ts 对齐，但这里保持扁平化便于本地使用）
// ============================================================

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

interface PaginationData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface UserBrief {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

export type HypothesisStatus =
  | 'BACKLOG'
  | 'RUNNING'
  | 'CLOSED_WIN'
  | 'CLOSED_LOSS'
  | 'CLOSED_FLAT'
  | 'ABANDONED'

export type ResultConclusion = 'WIN' | 'LOSS' | 'FLAT' | 'INCONCLUSIVE'
export type VariantStatus = 'CONTROL' | 'TREATMENT'
export type CopilotStatus = 'pending' | 'success' | 'failed' | 'unavailable'

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
  owner: UserBrief
  createdAt: number
  updatedAt: number
  closedAt: number | null
}

export interface HypothesisResult {
  id: string
  hypothesisId: string
  metricType: string
  metricName: string
  baseline: number
  actual: number
  delta: number
  unit: string | null
  conclusion: ResultConclusion
  humanNote: string | null
  createdAt: number
}

export interface HypothesisVariant {
  id: string
  hypothesisId: string
  name: string
  description: string | null
  type: VariantStatus
  sampleSize: number | null
  conversionCount: number | null
  metricValue: number | null
  metricUnit: string | null
  conversionRate: number | null
  stdError: number | null
  pValue: number | null
  confidenceInterval95Low: number | null
  confidenceInterval95High: number | null
  isSignificant: boolean | null
  isWinner: boolean
  createdAt: number
  updatedAt: number
}

export interface LearningBrief {
  id: string
  source: 'HUMAN' | 'AI_GENERATED'
  hypothesisId: string | null
  title: string
  content: string
  linkedPromptId: string | null
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

/** Phase B.3: Iteration 简要信息（挂在 hypothesis 详情下） */
export interface IterationBrief {
  id: string
  name: string
  status: string
  boardId: string | null
  feedCount: number
  createdAt: number
  assigneeId: string | null
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

export interface HypothesisTreeNode {
  id: string
  statement: string
  status: HypothesisStatus
  delta: number | null
  children: HypothesisTreeNode[]
}

export interface HypothesisTreeResponse {
  root: HypothesisTreeNode
  depth: number
  totalNodes: number
  truncated: boolean
}

// ============================================================
// API
// ============================================================

export interface ListHypothesisParams {
  page?: number
  pageSize?: number
  krId?: string
  status?: string // comma-separated
  ownerId?: string
  mine?: boolean
  sortBy?: 'createdAt' | 'closedAt' | 'iceScore' | 'riceScore' | 'updatedAt'
  order?: 'asc' | 'desc'
}

export function listHypothesesApi(params?: ListHypothesisParams) {
  return request.get<ApiResponse<PaginationData<HypothesisBrief>>>('/hypotheses', {
    params,
  })
}

export interface CreateHypothesisRequest {
  krId: string
  parentId?: string | null
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
  templateId?: string | null
  // Phase D.4: 允许创建时直接打分
  iceImpact?: number
  iceConfidence?: number
  iceEase?: number
  riceReach?: number
  riceImpact?: number
  riceConfidence?: number
  riceEffort?: number
}

export function createHypothesisApi(data: CreateHypothesisRequest) {
  return request.post<ApiResponse<HypothesisBrief>>('/hypotheses', data)
}

// Phase B.1: 从假设创建 Iteration
export interface CreateIterationFromHypothesisRequest {
  projectId?: string
  squadId?: string
  name?: string
}

export function createIterationForHypothesisApi(
  hypothesisId: string,
  data: CreateIterationFromHypothesisRequest,
) {
  return request.post<ApiResponse<IterationBrief & { hypothesisId: string }>>(
    `/hypotheses/${hypothesisId}/iterations`,
    data,
  )
}

export function getHypothesisDetailApi(id: string) {
  return request.get<ApiResponse<HypothesisDetail>>(`/hypotheses/${id}`)
}

export interface UpdateHypothesisRequest {
  statement?: string
  mechanism?: string
  expectedImpact?: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
  status?: 'BACKLOG' | 'RUNNING' | 'ABANDONED'
}

export function updateHypothesisApi(id: string, data: UpdateHypothesisRequest) {
  return request.put<ApiResponse<HypothesisBrief>>(`/hypotheses/${id}`, data)
}

export function deleteHypothesisApi(id: string) {
  return request.delete<ApiResponse<null>>(`/hypotheses/${id}`)
}

// Scoring
export function updateIceScoringApi(
  id: string,
  data: { iceImpact: number; iceConfidence: number; iceEase: number },
) {
  return request.put<ApiResponse<HypothesisBrief>>(`/hypotheses/${id}/scoring/ice`, data)
}

export function updateRiceScoringApi(
  id: string,
  data: {
    riceReach: number
    riceImpact: number
    riceConfidence: number
    riceEffort: number
  },
) {
  return request.put<ApiResponse<HypothesisBrief>>(`/hypotheses/${id}/scoring/rice`, data)
}

// Tree
export function getHypothesisTreeApi(id: string) {
  return request.get<ApiResponse<HypothesisTreeResponse>>(`/hypotheses/${id}/tree`)
}

// Close
export interface CloseHypothesisRequest {
  metricType: string
  metricName: string
  baseline: number
  actual: number
  unit?: string
  conclusion: ResultConclusion
  humanNote?: string
}

export interface CloseHypothesisResponse {
  hypothesis: {
    id: string
    status: HypothesisStatus
    closedAt: number
  }
  result: HypothesisResult
  copilotStatus: CopilotStatus
  copilotError?: string
}

export function closeHypothesisApi(id: string, data: CloseHypothesisRequest) {
  return request.post<ApiResponse<CloseHypothesisResponse>>(
    `/hypotheses/${id}/close`,
    data,
  )
}

// Variants
export function listVariantsApi(hypothesisId: string) {
  return request.get<ApiResponse<HypothesisVariant[]>>(
    `/hypotheses/${hypothesisId}/variants`,
  )
}

export function createVariantApi(
  hypothesisId: string,
  data: { name: string; description?: string; type?: VariantStatus },
) {
  return request.post<ApiResponse<HypothesisVariant>>(
    `/hypotheses/${hypothesisId}/variants`,
    data,
  )
}

export function updateVariantResultsApi(
  hypothesisId: string,
  variantId: string,
  data: {
    sampleSize?: number
    conversionCount?: number
    metricValue?: number
    metricUnit?: string
  },
) {
  return request.put<ApiResponse<{ variants: HypothesisVariant[] }>>(
    `/hypotheses/${hypothesisId}/variants/${variantId}/results`,
    data,
  )
}

export function markVariantWinnerApi(
  hypothesisId: string,
  variantId: string,
  force: boolean = false,
) {
  return request.post<
    ApiResponse<{ success: boolean; variantId: string; wasForced: boolean }>
  >(
    `/hypotheses/${hypothesisId}/variants/${variantId}/mark-winner${force ? '?force=true' : ''}`,
  )
}

export function deleteVariantApi(hypothesisId: string, variantId: string) {
  return request.delete<ApiResponse<null>>(
    `/hypotheses/${hypothesisId}/variants/${variantId}`,
  )
}
