// Skill 库 接口契约
// agent-prompt 负责实现（和提示词库同一个 agent）

import type { PaginationQuery, UserBrief } from './common'

export enum SkillCategory {
  STAGE_HELPER = 'STAGE_HELPER',     // 阶段辅助（PRD完善助手）
  QUALITY_CHECK = 'QUALITY_CHECK',   // 质量检查（性能审计、安全扫描）
  GENERAL_TOOL = 'GENERAL_TOOL',     // 通用工具（竞品分析）
}

export interface Skill {
  id: string
  name: string
  description: string | null
  category: SkillCategory
  tags: string[]
  content: string                    // Markdown（Skill 内容/说明）
  gitRepoUrl: string | null          // 关联的 Git 开源地址
  visibility: 'private' | 'team' | 'public'
  starCount: number
  forkCount: number
  sourceId: string | null
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface CreateSkillRequest {
  name: string
  description?: string
  category: SkillCategory
  tags?: string[]
  content: string
  gitRepoUrl?: string
  visibility?: 'private' | 'team' | 'public'
}

export interface SearchSkillQuery extends PaginationQuery {
  keyword?: string
  category?: SkillCategory
  sort?: 'star' | 'recent'
}
