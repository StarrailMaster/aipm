// SOP 知识库 + 模板库 接口契约
// agent-sop 负责实现

import type { PaginationQuery, PaginationResponse, UserBrief } from './common'

// ========== SOP ==========

// SOP 八层结构
export enum SopLayer {
  PRODUCT_REQ = 'PRODUCT_REQ',       // 产品需求
  CONTENT = 'CONTENT',               // 内容素材
  DESIGN_SYSTEM = 'DESIGN_SYSTEM',   // 设计系统
  FRONTEND_ARCH = 'FRONTEND_ARCH',   // 前端架构
  BACKEND_ARCH = 'BACKEND_ARCH',     // 后端架构
  AI_PROMPTS = 'AI_PROMPTS',         // AI 提示词
  ACCEPTANCE = 'ACCEPTANCE',         // 验收标准
  APPENDIX = 'APPENDIX',             // 附录
}

export interface SopProject {
  id: string
  name: string
  version: string        // v主.次.修
  description: string | null
  projectId: string      // 关联的项目
  visibility: 'private' | 'team' | 'public'
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface SopDocument {
  id: string
  sopProjectId: string
  layer: SopLayer
  title: string
  content: string        // Markdown
  version: number        // 自增版本号
  tags: string[]
  sortOrder: number
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface SopVersionDiff {
  oldVersion: number
  newVersion: number
  diff: string           // unified diff 格式
}

// 请求
export interface CreateSopProjectRequest {
  name: string
  description?: string
  projectId: string
  visibility?: 'private' | 'team' | 'public'
}

export interface CreateSopDocumentRequest {
  sopProjectId: string
  layer: SopLayer
  title: string
  content: string
  tags?: string[]
}

export interface UpdateSopDocumentRequest {
  title?: string
  content?: string
  tags?: string[]
}

export interface SearchSopQuery extends PaginationQuery {
  keyword?: string
  layer?: SopLayer
  projectId?: string
}

// ========== 模板 ==========

export interface Template {
  id: string
  name: string
  description: string | null
  category: string       // PRD / 设计规范 / 验收标准 / SOP ...
  content: string        // Markdown
  visibility: 'private' | 'team' | 'public'
  starCount: number
  forkCount: number
  sourceId: string | null  // fork 自哪个模板
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface CreateTemplateRequest {
  name: string
  description?: string
  category: string
  content: string
  visibility?: 'private' | 'team' | 'public'
}

export interface SearchTemplateQuery extends PaginationQuery {
  keyword?: string
  category?: string
  visibility?: 'private' | 'team' | 'public'
  sort?: 'star' | 'recent'
}
