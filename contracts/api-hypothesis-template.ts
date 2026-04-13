// Hypothesis Template Library — G6 Epic 5
// Agent: backend-hypothesis
// 参考 docs/prd-learning-copilot.md §6.5

import type { UserBrief, PaginationQuery, PaginationResponse } from './common'

export type HypothesisTemplateCategory =
  | 'acquisition' // 获客
  | 'activation' // 激活
  | 'retention' // 留存
  | 'revenue' // 变现
  | 'referral' // 传播
  | 'custom' // 自定义

/**
 * 模板的 placeholder 定义。用户创建假设时，前端根据 placeholders 渲染表单。
 */
export interface HypothesisTemplatePlaceholder {
  key: string // "feature" / "baseline" / "page"
  label: string // 中文标签 "新增功能"
  labelEn?: string // 英文标签（i18n）
  required: boolean
  type?: 'string' | 'number' | 'date'
  /** 默认值（创建时预填） */
  defaultValue?: string | number
  /** 若有固定值列表（例如页面名），供下拉选择 */
  enumOptions?: Array<{ value: string; label: string }>
}

export interface HypothesisTemplate {
  id: string
  name: string
  nameEn?: string
  category: HypothesisTemplateCategory
  description: string
  descriptionEn?: string

  /** 模板 statement：用 {{key}} 占位符，创建时由 placeholderValues 替换 */
  statementTemplate: string
  statementTemplateEn?: string
  mechanismTemplate: string
  mechanismTemplateEn?: string

  /** 建议 metric 类型 + 名称（hypothesis 关闭时会预填到 result form） */
  suggestedMetricType: string | null
  suggestedMetricName: string | null

  placeholders: HypothesisTemplatePlaceholder[]

  isSystemDefault: boolean // 系统预置模板不可编辑/删除
  usageCount: number // 被用过次数，用于热度排序
  createdBy: UserBrief | null // system default 时为 null
  createdAt: number
  updatedAt: number
}

export interface HypothesisTemplateBrief {
  id: string
  name: string
  nameEn?: string
  category: HypothesisTemplateCategory
  description: string
  isSystemDefault: boolean
  usageCount: number
  placeholderCount: number
  createdAt: number
}

// ============================================================
// Requests
// ============================================================

export interface CreateHypothesisTemplateRequest {
  name: string
  nameEn?: string
  category: HypothesisTemplateCategory
  description: string
  descriptionEn?: string
  statementTemplate: string
  statementTemplateEn?: string
  mechanismTemplate: string
  mechanismTemplateEn?: string
  suggestedMetricType?: string
  suggestedMetricName?: string
  placeholders: HypothesisTemplatePlaceholder[]
}

export type UpdateHypothesisTemplateRequest = Partial<CreateHypothesisTemplateRequest>

export interface ListHypothesisTemplateQuery extends PaginationQuery {
  category?: HypothesisTemplateCategory
  isSystemDefault?: boolean
  /** 按使用次数或创建时间排序 */
  sortBy?: 'usage' | 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
  search?: string
}

export type ListHypothesisTemplateResponse = PaginationResponse<HypothesisTemplateBrief>
