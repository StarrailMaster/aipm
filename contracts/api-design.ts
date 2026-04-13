// 设计精修管理 接口契约
// agent-design 负责实现

import type { UserBrief } from './common'

export enum DesignStatus {
  AI_GENERATED = 'AI_GENERATED',   // AI 生成
  PENDING_REFINE = 'PENDING_REFINE', // 待精修
  REFINING = 'REFINING',          // 精修中
  CONFIRMED = 'CONFIRMED',        // 已确认
  LOCKED = 'LOCKED',              // 已锁定
}

export interface DesignDraft {
  id: string
  iterationId: string
  name: string
  status: DesignStatus
  figmaUrl: string | null        // Figma 链接
  thumbnailUrl: string | null    // 截图预览
  assigneeId: string | null      // 分配给哪个设计师
  assigneeName: string | null
  changeLog: string | null       // 精修变更说明
  lockedAt: number | null
  lockedBy: UserBrief | null
  createdAt: number
  updatedAt: number
}

export interface CreateDesignDraftRequest {
  iterationId: string
  name: string
  figmaUrl?: string
}

export interface UpdateDesignDraftRequest {
  name?: string
  figmaUrl?: string
  assigneeId?: string
  changeLog?: string
}

export interface ChangeDesignStatusRequest {
  status: DesignStatus
  changeLog?: string             // 精修时记录修改了什么
}

export interface UnlockRequest {
  reason: string                 // 解锁原因
}
