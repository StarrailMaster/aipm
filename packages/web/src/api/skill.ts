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

export interface SkillItem {
  id: string
  name: string
  description: string | null
  category: string
  tags: string[]
  content: string
  gitRepoUrl: string | null
  visibility: string
  starCount: number
  forkCount: number
  sourceId: string | null
  createdBy: UserBrief
  isStarred: boolean
  createdAt: number
  updatedAt: number
}

export interface StarResult {
  starred: boolean
  starCount: number
}

// ========== API Functions ==========

export function listSkillsApi(params: {
  page?: number
  pageSize?: number
  keyword?: string
  category?: string
  sort?: string
}) {
  return request.get<ApiResponse<PaginationData<SkillItem>>>('/skills', { params })
}

export function createSkillApi(data: {
  name: string
  description?: string
  category: string
  tags?: string[]
  content: string
  gitRepoUrl?: string
  visibility?: string
}) {
  return request.post<ApiResponse<SkillItem>>('/skills', data)
}

export function getSkillDetailApi(id: string) {
  return request.get<ApiResponse<SkillItem>>(`/skills/${id}`)
}

export function updateSkillApi(
  id: string,
  data: {
    name?: string
    description?: string
    category?: string
    tags?: string[]
    content?: string
    gitRepoUrl?: string
  },
) {
  return request.put<ApiResponse<SkillItem>>(`/skills/${id}`, data)
}

export function deleteSkillApi(id: string) {
  return request.delete<ApiResponse<null>>(`/skills/${id}`)
}

export function toggleSkillStarApi(id: string) {
  return request.post<ApiResponse<StarResult>>(`/skills/${id}/star`)
}

export function forkSkillApi(id: string, name?: string) {
  return request.post<ApiResponse<SkillItem>>(`/skills/${id}/fork`, { name })
}
