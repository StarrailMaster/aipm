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

export interface LinkedPromptBrief {
  id: string
  name: string
  category: string
}

export interface ExperienceFeedbackItem {
  id: string
  problemDescription: string
  markdownContent: string | null
  markdownFileName: string | null
  linkedPromptId: string | null
  linkedPrompt: LinkedPromptBrief | null
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

// ========== API Functions ==========

export function listFeedbacksApi(params: {
  page?: number
  pageSize?: number
  createdBy?: string
  linkedPromptId?: string
}) {
  return request.get<ApiResponse<PaginationData<ExperienceFeedbackItem>>>(
    '/experience/feedbacks',
    { params },
  )
}

export function createFeedbackApi(data: {
  problemDescription: string
  markdownContent?: string | null
  markdownFileName?: string | null
  linkedPromptId?: string | null
}) {
  return request.post<ApiResponse<ExperienceFeedbackItem>>(
    '/experience/feedbacks',
    data,
  )
}

export function getFeedbackDetailApi(id: string) {
  return request.get<ApiResponse<ExperienceFeedbackItem>>(
    `/experience/feedbacks/${id}`,
  )
}

export function deleteFeedbackApi(id: string) {
  return request.delete<ApiResponse<null>>(`/experience/feedbacks/${id}`)
}
