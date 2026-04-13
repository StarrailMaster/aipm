// Learning Copilot — AI 生成的跨假设规律发现
// Agent: backend-copilot
// 参考 docs/prd-learning-copilot.md §6.4, §8

import type { CopilotConfidence } from './api-hypothesis'

// ============================================================
// Copilot Output Schema (Zod validated at runtime)
// ============================================================

/**
 * Copilot 告警类型：
 * - stagnant_kr：KR 超过 N 天无新 hypothesis
 * - behind_schedule：KR 进度落后时间线
 * - dead_direction：某方向连续失败
 * - winning_streak：某方向连续胜出（正向信号）
 * - quota_exceeded：本月 AI 预算超限
 */
export type CopilotAlertType =
  | 'stagnant_kr'
  | 'behind_schedule'
  | 'dead_direction'
  | 'winning_streak'
  | 'quota_exceeded'

export type CopilotAlertSeverity = 'info' | 'warning' | 'critical'

/**
 * Learning：针对单个 hypothesis 的学习笔记（Markdown 允许）
 */
export interface CopilotLearning {
  hypothesisId: string
  /** Markdown 允许（50-150 字） */
  text: string
  /** squad 归属，用于前端过滤展示 */
  squadId: string | null
}

/**
 * Pattern：跨假设发现的规律（killer feature）
 */
export interface CopilotPattern {
  /** 简短标题，纯文本，<= 20 字 */
  title: string
  /** 描述，Markdown 允许 */
  description: string
  /** 证据假设 id 列表（至少 3 个） */
  evidenceHypothesisIds: string[]
  /** 建议动作，纯文本 */
  recommendation: string
  confidence: CopilotConfidence
  /** 涉及的 squad id 列表（跨 squad 匿名化过滤用） */
  relatedSquadIds: string[]
}

/**
 * Next Hypothesis Suggestion：Copilot 主动建议下一批试什么
 */
export interface CopilotNextHypothesisSuggestion {
  krId: string
  /** 纯文本 statement */
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue: number | null
  expectedImpactUnit: string | null
  /** 建议分配给哪个 squad（可选） */
  targetSquadId: string | null
}

/**
 * Alert：主动告警
 */
export interface CopilotAlert {
  type: CopilotAlertType
  krId?: string
  krName?: string
  /** 纯文本 */
  message: string
  severity: CopilotAlertSeverity
  evidenceHypothesisIds?: string[]
  squadId: string | null
}

/**
 * Copilot 完整 payload（Zod schema 校验对象）
 */
export interface CopilotPayload {
  learnings: CopilotLearning[]
  patterns: CopilotPattern[]
  nextHypothesisSuggestions: CopilotNextHypothesisSuggestion[]
  alerts: CopilotAlert[]
}

// ============================================================
// Copilot Digest (persisted)
// ============================================================

export type CopilotDigestScope = 'global' | `project:${string}` | `kr:${string}`

export type CopilotTriggerType =
  | 'scheduled_daily'
  | 'hypothesis_close'
  | 'manual'

export interface CopilotDigest {
  id: string
  scope: CopilotDigestScope
  triggerType: CopilotTriggerType
  payload: CopilotPayload
  createdAt: number
}

// ============================================================
// Cost Logging (Issue 10 budget protection)
// ============================================================

export interface CopilotCostLogEntry {
  id: string
  triggerType: CopilotTriggerType
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  success: boolean
  errorMessage: string | null
  createdAt: number
}

export interface CopilotCostSummary {
  month: string // "2026-05"
  totalCalls: number
  totalTokensIn: number
  totalTokensOut: number
  totalCostUsd: number
  breakdownByTrigger: Record<CopilotTriggerType, {
    calls: number
    costUsd: number
  }>
  /** 本月剩余 quota（COPILOT_MAX_MONTHLY_CALLS - totalCalls） */
  remainingQuota: number
}
