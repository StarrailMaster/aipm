// Learning — 原 experience 模块的替代（D1 决策：rename + source 字段）
// Agent: backend-learning
// 参考 docs/prd-learning-copilot.md §5, §6.2

import type { UserBrief, PaginationQuery, PaginationResponse } from './common'

/**
 * Learning 来源：
 * - HUMAN：用户手写（原 experience 数据）
 * - AI_GENERATED：Copilot 在 hypothesis close 时生成
 */
export type LearningSource = 'HUMAN' | 'AI_GENERATED'

export interface LearningBrief {
  id: string
  source: LearningSource
  /** 可选关联：close 事件触发的 learning 会有 hypothesisId；手写的通常无 */
  hypothesisId: string | null
  title: string
  /** 正文，Markdown 允许（D9 决策） */
  content: string
  /** 可选关联：手写 learning 可能指向某个 Prompt 作为"踩坑笔记" */
  linkedPromptId: string | null
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface LearningDetail extends LearningBrief {
  /** 原 experience 保留字段 */
  markdownContent: string | null
  markdownFileName: string | null
  problemDescription: string | null
  /** 若关联的 hypothesis 仍存在（未软删），返回摘要 */
  relatedHypothesis: {
    id: string
    statement: string
    status: string
    krName: string
  } | null
}

// ============================================================
// Requests
// ============================================================

export interface CreateLearningRequest {
  title: string
  content: string
  hypothesisId?: string | null
  linkedPromptId?: string | null
  markdownContent?: string | null
  markdownFileName?: string | null
  problemDescription?: string | null
}

export interface UpdateLearningRequest {
  title?: string
  content?: string
  hypothesisId?: string | null
  linkedPromptId?: string | null
  markdownContent?: string | null
  markdownFileName?: string | null
  problemDescription?: string | null
}

export interface ListLearningQuery extends PaginationQuery {
  source?: LearningSource
  hypothesisId?: string
  createdById?: string
  /** 全文搜索 title + content */
  search?: string
}

export type ListLearningResponse = PaginationResponse<LearningBrief>
