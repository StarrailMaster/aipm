import request from './request'

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

export type LearningSource = 'HUMAN' | 'AI_GENERATED'

export interface LearningBrief {
  id: string
  source: LearningSource
  hypothesisId: string | null
  title: string
  content: string
  linkedPromptId: string | null
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface LearningDetail extends LearningBrief {
  markdownContent: string | null
  markdownFileName: string | null
  problemDescription: string | null
  relatedHypothesis: {
    id: string
    statement: string
    status: string
    krName: string
  } | null
}

export interface ListLearningParams {
  page?: number
  pageSize?: number
  source?: LearningSource
  hypothesisId?: string
  createdById?: string
  search?: string
}

export function listLearningsApi(params?: ListLearningParams) {
  return request.get<ApiResponse<PaginationData<LearningBrief>>>('/learnings', {
    params,
  })
}

export function getLearningDetailApi(id: string) {
  return request.get<ApiResponse<LearningDetail>>(`/learnings/${id}`)
}

export interface CreateLearningRequest {
  title: string
  content: string
  hypothesisId?: string | null
  linkedPromptId?: string | null
  markdownContent?: string | null
  markdownFileName?: string | null
  problemDescription?: string | null
}

export function createLearningApi(data: CreateLearningRequest) {
  return request.post<ApiResponse<LearningBrief>>('/learnings', data)
}

export function updateLearningApi(id: string, data: Partial<CreateLearningRequest>) {
  return request.put<ApiResponse<LearningBrief>>(`/learnings/${id}`, data)
}

export function deleteLearningApi(id: string) {
  return request.delete<ApiResponse<null>>(`/learnings/${id}`)
}
