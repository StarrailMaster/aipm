// 组织模型 接口契约
// agent-org 负责实现

import type { PaginationQuery, Role, UserBrief } from './common'

// ========== 小组（两人制）==========

export interface Squad {
  id: string
  name: string
  projectId: string
  projectName: string
  members: SquadMember[]
  createdAt: number
  updatedAt: number
}

export interface SquadMember {
  user: UserBrief
  squadRole: 'architect' | 'engineer'   // 需求架构师 / 实施工程师
}

export interface CreateSquadRequest {
  name: string
  projectId: string
  architectId: string     // 需求架构师 userId
  engineerId: string      // 实施工程师 userId
}

export interface UpdateSquadRequest {
  name?: string
  architectId?: string
  engineerId?: string
}

// ========== 用户管理 ==========

export interface UserProfile extends UserBrief {
  squadId: string | null
  squadName: string | null
  createdAt: number
}

export interface UpdateUserRequest {
  name?: string
  role?: Role
  legacyRoles?: string[]      // 原岗位标签
  squadId?: string | null
}

export interface SearchUserQuery extends PaginationQuery {
  keyword?: string
  role?: Role
  squadId?: string
  projectId?: string
}

// ========== 项目 ==========

export interface Project {
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

export interface CreateProjectRequest {
  name: string
  description?: string
}
