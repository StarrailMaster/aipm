// OKR 指标看板 接口契约
// agent-dash 负责实现

import type { UserBrief } from './common'

export interface Objective {
  id: string
  projectId: string
  name: string
  description: string | null
  squadId: string | null        // 负责小组
  squadName: string | null
  keyResults: KeyResult[]
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface KeyResult {
  id: string
  objectiveId: string
  name: string
  targetValue: number
  currentValue: number
  baseline: number              // G8: 基线值（开始时的起点）
  unit: string                  // "%", "s", "ms", "次"
  status: 'achieved' | 'not_achieved'
  /** G8: 时间维度 startDate / endDate（可选，老 KR 默认 createdAt / null） */
  startDate: number             // timestamp ms
  endDate: number | null        // null = open-ended
  iterations: IterationRecord[]
  /** G8: 该 KR 关联的假设数（反向关联） */
  hypothesisCount: number
  createdAt: number
  updatedAt: number
}

export interface CreateKeyResultRequest {
  objectiveId: string
  name: string
  targetValue: number
  baseline?: number             // 默认 0
  unit: string
  startDate?: number            // 默认 now
  endDate?: number | null       // 默认 null (open-ended)
}

export interface UpdateKeyResultRequest {
  name?: string
  targetValue?: number
  baseline?: number
  currentValue?: number         // 手动微调；一般由 hypothesis_result 自动驱动
  unit?: string
  startDate?: number
  endDate?: number | null
}

export interface IterationRecord {
  id: string
  keyResultId: string
  roundNumber: number           // 第几轮
  changes: string               // 做了什么改动（自由文本）
  dataFeedback: number          // 手动录入的数据值
  isAchieved: boolean
  recordedBy: UserBrief
  createdAt: number
}

export interface CreateObjectiveRequest {
  projectId: string
  name: string
  description?: string
  squadId?: string
}

export interface RecordIterationRequest {
  keyResultId: string
  changes: string
  dataFeedback: number
}
