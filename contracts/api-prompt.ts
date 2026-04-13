// 提示词库 接口契约
// agent-prompt 负责实现

import type { PaginationQuery, UserBrief } from './common'

// ========== 提示词 ==========

export enum PromptCategory {
  DESIGN = 'DESIGN',
  FRONTEND = 'FRONTEND',
  BACKEND = 'BACKEND',
  TESTING = 'TESTING',
  INTEGRATION = 'INTEGRATION',
  OPTIMIZATION = 'OPTIMIZATION',
}

export interface Prompt {
  id: string
  name: string
  description: string | null
  category: PromptCategory
  tags: string[]              // 技术栈标签 ["Vue", "Go", "React"]
  content: string             // Markdown（完整提示词内容）
  visibility: 'private' | 'team' | 'public'
  starCount: number
  forkCount: number
  sourceId: string | null     // fork 自哪个提示词
  // 依赖
  dependsOn: string[]         // 前置提示词 ID 列表
  requiredSopLayers: string[] // 需要的 SOP 模块
  // 版本
  version: number
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface CreatePromptRequest {
  name: string
  description?: string
  category: PromptCategory
  tags?: string[]
  content: string
  visibility?: 'private' | 'team' | 'public'
  dependsOn?: string[]
  requiredSopLayers?: string[]
}

export interface UpdatePromptRequest {
  name?: string
  description?: string
  category?: PromptCategory
  tags?: string[]
  content?: string
  dependsOn?: string[]
}

export interface SearchPromptQuery extends PaginationQuery {
  keyword?: string
  category?: PromptCategory
  tags?: string[]
  visibility?: 'private' | 'team' | 'public'
  sort?: 'star' | 'recent' | 'popular'
}

// ========== Star ==========

export interface StarRequest {
  targetId: string
  targetType: 'prompt' | 'skill' | 'template'
}

// ========== Fork ==========

export interface ForkRequest {
  sourceId: string
  name?: string   // 可选重命名
}

// ========== PR（改进建议）==========

export enum PrStatus {
  OPEN = 'OPEN',
  MERGED = 'MERGED',
  REJECTED = 'REJECTED',
}

export interface PromptPr {
  id: string
  promptId: string
  title: string
  description: string
  diff: string              // 提示词内容的 diff
  status: PrStatus
  submittedBy: UserBrief
  reviewedBy: UserBrief | null
  reviewComment: string | null
  createdAt: number
  updatedAt: number
}

export interface CreatePrRequest {
  promptId: string
  title: string
  description: string
  newContent: string        // 修改后的完整内容（后端自动算 diff）
}

export interface ReviewPrRequest {
  action: 'merge' | 'reject'
  comment?: string
}
