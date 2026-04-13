// 经验沉淀 + 仓库管理 Agent 接口契约
// agent-exp 负责实现
//
// @deprecated (2026-04-12, D1 决策)
// 本文件定义的 feedback 模块已合并到 api-learning.ts（source=HUMAN）。
// 新代码应使用 api-learning.ts 的 LearningBrief / ListLearningQuery 等类型。
// 本文件保留 1 个月作为兼容层，2026-05-12 后删除。
//
// 迁移指南：
//   原 SubmitFeedbackRequest → api-learning.CreateLearningRequest
//   原 Feedback → api-learning.LearningBrief (source=HUMAN)
//   原 SearchFeedbackQuery → api-learning.ListLearningQuery (source=HUMAN)

import type { PaginationQuery, UserBrief } from './common'

// ========== 反馈提交 ==========

export interface Feedback {
  id: string
  // 工程师原始输入
  rawDescription: string         // 自然语言问题描述
  attachments: string[]          // 截图 URL
  // AI 总结
  aiSummary: AiSummary | null
  // 仓库管理 Agent 处理
  warehouseResult: WarehouseResult | null
  // 审批
  status: FeedbackStatus
  reviewedBy: UserBrief | null
  reviewComment: string | null
  // 关联
  iterationId: string | null
  feedPackageId: string | null
  submittedBy: UserBrief
  createdAt: number
  updatedAt: number
}

export enum FeedbackStatus {
  SUBMITTED = 'SUBMITTED',         // 已提交（等 AI 总结）
  AI_SUMMARIZED = 'AI_SUMMARIZED', // AI 已总结
  AGENT_PROCESSED = 'AGENT_PROCESSED', // Agent 已处理
  PENDING_REVIEW = 'PENDING_REVIEW', // 待架构师审批
  MERGED = 'MERGED',               // 已合并到提示词
  REJECTED = 'REJECTED',           // 已驳回
}

// AI 自动总结结果
export interface AiSummary {
  problemCategory: string         // 问题分类
  relatedPromptId: string | null  // 关联到哪个提示词
  relatedPromptName: string | null
  problemSummary: string          // 问题摘要
  suggestedConstraint: string     // 建议的约束条件文本
}

// 仓库管理 Agent 处理结果
export interface WarehouseResult {
  // 审核
  qualityCheck: 'pass' | 'fail'
  qualityNote: string | null
  // 去重
  isDuplicate: boolean
  similarFeedbackId: string | null
  similarityNote: string | null   // "建议合并到 XXX"
  // 归类
  targetPromptId: string | null
  targetSection: string | null    // 插入到提示词的哪个部分
  autoTags: string[]
}

// ========== 请求 ==========

export interface SubmitFeedbackRequest {
  rawDescription: string
  attachments?: string[]
  iterationId?: string
  feedPackageId?: string
}

// 工程师修改 AI 总结后确认提交
export interface ConfirmAiSummaryRequest {
  feedbackId: string
  problemCategory?: string        // 可修改 AI 的归类
  relatedPromptId?: string        // 可修改关联的提示词
  problemSummary?: string         // 可修改摘要
  suggestedConstraint?: string    // 可修改建议约束
}

// 架构师审批
export interface ReviewFeedbackRequest {
  action: 'merge' | 'reject'
  comment?: string
}

export interface SearchFeedbackQuery extends PaginationQuery {
  status?: FeedbackStatus
  promptId?: string
  submittedBy?: string
}
