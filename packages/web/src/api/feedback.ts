import request from './request'

// ========== Types ==========

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

export interface AiSummary {
  problemCategory: string
  relatedPromptId: string | null
  relatedPromptName: string | null
  problemSummary: string
  suggestedConstraint: string
}

export interface WarehouseResult {
  qualityCheck: 'pass' | 'fail'
  qualityNote: string | null
  isDuplicate: boolean
  similarFeedbackId: string | null
  similarityNote: string | null
  targetPromptId: string | null
  targetSection: string | null
  autoTags: string[]
}

export type FeedbackStatusType =
  | 'SUBMITTED'
  | 'AI_SUMMARIZED'
  | 'AGENT_PROCESSED'
  | 'PENDING_REVIEW'
  | 'MERGED'
  | 'REJECTED'

export interface FeedbackItem {
  id: string
  rawDescription: string
  attachments: string[]
  aiSummary: AiSummary | null
  warehouseResult: WarehouseResult | null
  status: FeedbackStatusType
  reviewedBy: UserBrief | null
  reviewComment: string | null
  iterationId: string | null
  feedPackageId: string | null
  submittedBy: UserBrief
  createdAt: number
  updatedAt: number
}

// ========== API Functions ==========

export function listFeedbacksApi(params: {
  page?: number
  pageSize?: number
  status?: string
  promptId?: string
  submittedBy?: string
}) {
  return request.get<ApiResponse<PaginationData<FeedbackItem>>>('/feedback', { params })
}

export function submitFeedbackApi(data: {
  rawDescription: string
  attachments?: string[]
  iterationId?: string
  feedPackageId?: string
}) {
  return request.post<ApiResponse<FeedbackItem>>('/feedback', data)
}

export function getFeedbackDetailApi(id: string) {
  return request.get<ApiResponse<FeedbackItem>>(`/feedback/${id}`)
}

export function deleteFeedbackApi(id: string) {
  return request.delete<ApiResponse<null>>(`/feedback/${id}`)
}

export function triggerAiSummaryApi(id: string) {
  return request.post<ApiResponse<FeedbackItem>>(`/feedback/${id}/ai-summary`)
}

export function confirmAiSummaryApi(
  id: string,
  data: {
    problemCategory?: string
    relatedPromptId?: string
    problemSummary?: string
    suggestedConstraint?: string
  },
) {
  return request.post<ApiResponse<FeedbackItem>>(`/feedback/${id}/confirm`, data)
}

export function reviewFeedbackApi(
  id: string,
  data: { action: 'merge' | 'reject'; comment?: string },
) {
  return request.post<ApiResponse<FeedbackItem>>(`/feedback/${id}/review`, data)
}
