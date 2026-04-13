import request from './request'

// ========== Types ==========

interface UserBrief {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

export type DesignStatusType =
  | 'AI_GENERATED'
  | 'PENDING_REFINE'
  | 'REFINING'
  | 'PENDING_CONFIRM' // 手动任务：设计师完成，等创建人确认
  | 'CONFIRMED'
  | 'LOCKED'

/** 设计任务来源 */
export type DesignSourceTypeType = 'FEED_PUSH' | 'MANUAL'

/** 来源工作台包的简要引用 */
export interface SourceFeedPackageBrief {
  id: string
  name: string
  iterationId: string
}

export interface DesignDraftItem {
  id: string
  iterationId: string
  name: string
  status: DesignStatusType
  figmaUrl: string | null
  thumbnailUrl: string | null
  assigneeId: string | null
  assigneeName: string | null
  assignee: UserBrief | null
  changeLog: string | null
  lockedAt: number | null
  lockedBy: UserBrief | null
  createdById: string
  createdBy: UserBrief | null
  // ===== 双通道 + 创建人确认（Phase 2 新增） =====
  sourceType: DesignSourceTypeType
  sourceFeedPackage: SourceFeedPackageBrief | null
  confirmedAt: number | null
  confirmedBy: UserBrief | null
  createdAt: number
  updatedAt: number
}

export interface DesignHistoryItem {
  id: string
  draftId: string
  fromStatus: DesignStatusType
  toStatus: DesignStatusType
  changeLog: string | null
  changedBy: UserBrief
  createdAt: number
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

interface PaginationData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ========== API Calls ==========

export function listDesignsApi(params: {
  page?: number
  pageSize?: number
  iterationId?: string
  status?: string
  /** 按来源过滤（FEED_PUSH / MANUAL） */
  sourceType?: DesignSourceTypeType
  /** 按指派人过滤 */
  assigneeId?: string
  /** 按创建人过滤 */
  createdById?: string
  /** 快捷标志：只显示指派给我的 */
  mineOnly?: boolean
}) {
  return request.get<ApiResponse<PaginationData<DesignDraftItem>>>('/designs', { params })
}

export function createDesignDraftApi(data: {
  iterationId: string
  name: string
  /** 手动添加任务必须指派给设计师（后端强制） */
  assigneeId: string
  figmaUrl?: string
}) {
  return request.post<ApiResponse<DesignDraftItem>>('/designs', data)
}

export function getDesignDraftApi(id: string) {
  return request.get<ApiResponse<DesignDraftItem>>(`/designs/${id}`)
}

export function updateDesignDraftApi(
  id: string,
  data: {
    name?: string
    figmaUrl?: string
    assigneeId?: string
    changeLog?: string
  },
) {
  return request.put<ApiResponse<DesignDraftItem>>(`/designs/${id}`, data)
}

export function deleteDesignDraftApi(id: string) {
  return request.delete<ApiResponse<null>>(`/designs/${id}`)
}

export function changeDesignStatusApi(
  id: string,
  data: {
    status: DesignStatusType
    changeLog?: string
  },
) {
  return request.post<ApiResponse<DesignDraftItem>>(`/designs/${id}/status`, data)
}

export function lockDesignApi(id: string) {
  return request.post<ApiResponse<DesignDraftItem>>(`/designs/${id}/lock`)
}

export function unlockDesignApi(id: string, reason: string) {
  return request.post<ApiResponse<DesignDraftItem>>(`/designs/${id}/unlock`, { reason })
}

export function getDesignHistoryApi(id: string) {
  return request.get<ApiResponse<DesignHistoryItem[]>>(`/designs/${id}/history`)
}

// ========== 手动设计任务闭环（Phase 2 新增） ==========

/**
 * 设计师标记手动任务完成 → 推给创建人确认
 * 条件：调用者必须是 assigneeId
 * 副作用：status → PENDING_CONFIRM
 */
export function completeDesignApi(id: string) {
  return request.post<ApiResponse<DesignDraftItem>>(`/designs/${id}/complete`)
}

/**
 * 创建人确认设计完成 → 流程结束
 * 条件：调用者必须是 createdById
 * 副作用：status → CONFIRMED, 记录 confirmedAt / confirmedById
 */
export function confirmDesignApi(id: string) {
  return request.post<ApiResponse<DesignDraftItem>>(`/designs/${id}/confirm`)
}
