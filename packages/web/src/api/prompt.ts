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

export interface PromptItem {
  id: string
  name: string
  description: string | null
  category: string
  tags: string[]
  content: string
  visibility: string
  starCount: number
  forkCount: number
  sourceId: string | null
  dependsOn: string[]
  requiredSopLayers: string[]
  version: number
  createdBy: UserBrief
  isStarred: boolean
  createdAt: number
  updatedAt: number
}

export interface PromptVersion {
  id: string
  promptId: string
  version: number
  name: string
  content: string
  changelog: string | null
  createdBy: UserBrief
  createdAt: number
}

export interface PromptPrItem {
  id: string
  promptId: string
  title: string
  description: string
  diff: string
  newContent: string
  status: string
  submittedBy: UserBrief
  reviewedBy: UserBrief | null
  reviewComment: string | null
  createdAt: number
  updatedAt: number
}

/**
 * 改进建议的"聚合列表项"：额外带上所属提示词的 id/name/category，
 * 这样前端可以在不加载 prompt 详情的情况下直接显示列表 + 生成跳转链接
 */
export interface PromptPrFeedItem {
  id: string
  promptId: string
  promptName: string
  promptCategory: string
  title: string
  description: string
  status: 'OPEN' | 'MERGED' | 'REJECTED'
  submittedBy: UserBrief
  reviewedBy: UserBrief | null
  reviewComment: string | null
  createdAt: number
  updatedAt: number
}

export interface StarResult {
  starred: boolean
  starCount: number
}

// ========== API Functions ==========

export function listPromptsApi(params: {
  page?: number
  pageSize?: number
  keyword?: string
  category?: string
  tags?: string
  visibility?: string
  sort?: string
}) {
  return request.get<ApiResponse<PaginationData<PromptItem>>>('/prompts', { params })
}

export function createPromptApi(data: {
  name: string
  description?: string
  category: string
  tags?: string[]
  content: string
  visibility?: string
  dependsOn?: string[]
  requiredSopLayers?: string[]
}) {
  return request.post<ApiResponse<PromptItem>>('/prompts', data)
}

export function getPromptDetailApi(id: string) {
  return request.get<ApiResponse<PromptItem>>(`/prompts/${id}`)
}

export function updatePromptApi(
  id: string,
  data: {
    name?: string
    description?: string
    category?: string
    tags?: string[]
    content?: string
    dependsOn?: string[]
  },
) {
  return request.put<ApiResponse<PromptItem>>(`/prompts/${id}`, data)
}

export function deletePromptApi(id: string) {
  return request.delete<ApiResponse<null>>(`/prompts/${id}`)
}

export function toggleStarApi(id: string) {
  return request.post<ApiResponse<StarResult>>(`/prompts/${id}/star`)
}

export function forkPromptApi(id: string, name?: string) {
  return request.post<ApiResponse<PromptItem>>(`/prompts/${id}/fork`, { name })
}

export function getVersionHistoryApi(id: string) {
  return request.get<ApiResponse<PromptVersion[]>>(`/prompts/${id}/versions`)
}

export function createPrApi(
  id: string,
  data: { title: string; description: string; newContent: string },
) {
  return request.post<ApiResponse<PromptPrItem>>(`/prompts/${id}/pr`, data)
}

export function listPrsApi(id: string) {
  return request.get<ApiResponse<PromptPrItem[]>>(`/prompts/${id}/prs`)
}

export function reviewPrApi(
  prId: string,
  data: { action: 'merge' | 'reject'; comment?: string },
) {
  return request.put<ApiResponse<PromptPrItem>>(`/prompts/prs/${prId}/review`, data)
}

export function getPrDetailApi(prId: string) {
  return request.get<ApiResponse<PromptPrItem>>(`/prompts/prs/${prId}`)
}

/** 我提交的所有改进建议（"我的反馈" tab） */
export function listMyPrsApi(params?: { status?: 'OPEN' | 'MERGED' | 'REJECTED' }) {
  return request.get<ApiResponse<PromptPrFeedItem[]>>('/prompts/prs/mine', {
    params,
  })
}

/** 我创建的提示词上别人提交的、待我审核的改进建议（"需要审核" tab） */
export function listPrsToReviewApi() {
  return request.get<ApiResponse<PromptPrFeedItem[]>>('/prompts/prs/to-review')
}
