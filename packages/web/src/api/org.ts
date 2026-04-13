import request from './request'

// ========== Types ==========

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

interface PaginationResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ProjectItem {
  id: string
  name: string
  description: string | null
  ownerId: string
  ownerName: string
  squadCount: number
  memberCount: number
  createdAt: number
  updatedAt: number
}

export interface ProjectDetail extends ProjectItem {
  squads: SquadItem[]
}

export interface SquadItem {
  id: string
  name: string
  projectId: string
  projectName: string
  members: SquadMemberItem[]
  createdAt: number
  updatedAt: number
}

export interface SquadMemberItem {
  user: UserBriefItem
  squadRole: 'architect' | 'engineer'
}

export interface UserBriefItem {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

export interface UserProfileItem extends UserBriefItem {
  squadId: string | null
  squadName: string | null
  createdAt: number
}

// ========== Project APIs ==========

export function listProjectsApi(params?: {
  page?: number
  pageSize?: number
  /** true = 只返回当前用户所在的项目（ADMIN 忽略此参数）；默认 false = 返回全部 */
  mine?: boolean
}) {
  return request.get<ApiResponse<PaginationResponse<ProjectItem>>>('/projects', { params })
}

export function createProjectApi(data: {
  name: string
  description?: string
  ownerId?: string
}) {
  return request.post<ApiResponse<ProjectItem>>('/projects', data)
}

export function getProjectApi(id: string) {
  return request.get<ApiResponse<ProjectDetail>>(`/projects/${id}`)
}

export function updateProjectApi(
  id: string,
  data: { name?: string; description?: string; ownerId?: string },
) {
  return request.put<ApiResponse<ProjectItem>>(`/projects/${id}`, data)
}

export function deleteProjectApi(id: string) {
  return request.delete<ApiResponse<null>>(`/projects/${id}`)
}

// ========== User APIs ==========

export function listUsersApi(params?: {
  page?: number
  pageSize?: number
  keyword?: string
  role?: string
  squadId?: string
  projectId?: string
}) {
  return request.get<ApiResponse<PaginationResponse<UserProfileItem>>>('/users', { params })
}

/** ADMIN 专用：创建新成员（公开注册已关闭后的唯一入口） */
export function createUserApi(data: {
  email: string
  password: string
  name: string
  role: string
  squadId?: string | null
  legacyRoles?: string[]
}) {
  return request.post<ApiResponse<UserProfileItem>>('/users', data)
}

/** 列出所有小组（供"创建用户"时下拉选择） */
export function listSquadsApi(params?: { page?: number; pageSize?: number; projectId?: string }) {
  return request.get<ApiResponse<PaginationResponse<SquadItem>>>('/squads', { params })
}

export function getUserApi(id: string) {
  return request.get<ApiResponse<UserProfileItem>>(`/users/${id}`)
}

export function updateUserApi(
  id: string,
  data: {
    name?: string
    role?: string
    legacyRoles?: string[]
    squadId?: string | null
  },
) {
  return request.put<ApiResponse<UserProfileItem>>(`/users/${id}`, data)
}

export function updateUserLegacyRolesApi(id: string, legacyRoles: string[]) {
  return request.put<ApiResponse<UserProfileItem>>(`/users/${id}/legacy-roles`, { legacyRoles })
}
