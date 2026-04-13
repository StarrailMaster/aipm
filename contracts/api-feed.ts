// 投喂包引擎 接口契约
// agent-feed 负责实现

import type { PaginationQuery, UserBrief } from './common'

export enum FeedPhase {
  DESIGN = 'DESIGN',       // 阶段一：设计
  IMPLEMENT = 'IMPLEMENT', // 阶段二：实施
}

export enum FeedStatus {
  BLOCKED = 'BLOCKED',       // 依赖未完成
  PENDING = 'PENDING',       // 待执行
  IN_PROGRESS = 'IN_PROGRESS', // 执行中
  REVIEW = 'REVIEW',        // 待验收
  DONE = 'DONE',            // 已完成
  REWORK = 'REWORK',        // 需返工
}

export interface FeedPackage {
  id: string
  iterationId: string
  name: string              // 如 "F2-前端-Home与侧栏"
  phase: FeedPhase
  status: FeedStatus
  // 内容（三层）
  promptId: string | null   // 关联的提示词（公开层）
  coreFiles: FeedFile[]     // 核心层 MD 文件
  contextFiles: FeedFile[]  // 上下文层 MD 文件
  // 依赖
  dependsOn: string[]       // 前置投喂包 ID
  canParallel: boolean      // 是否可以和其他包并行
  // 执行
  assigneeId: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface FeedFile {
  id: string
  name: string              // 文件名
  content: string           // Markdown 内容
  layer: 'core' | 'context' // 核心层 / 上下文层
}

export interface ExecutionRecord {
  id: string
  feedPackageId: string
  executedBy: UserBrief
  aiTool: string            // "Claude" / "ChatGPT" / ...
  outputSummary: string     // 输出摘要
  issues: string | null     // 问题记录
  executedAt: number
}

export interface CreateFeedPackageRequest {
  iterationId: string
  name: string
  phase: FeedPhase
  promptId?: string
  dependsOn?: string[]
  canParallel?: boolean
}

export interface AddFeedFileRequest {
  feedPackageId: string
  name: string
  content: string
  layer: 'core' | 'context'
}

export interface RecordExecutionRequest {
  feedPackageId: string
  aiTool: string
  outputSummary: string
  issues?: string
}

export interface UpdateFeedStatusRequest {
  status: FeedStatus
}
