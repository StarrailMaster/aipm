import request from './request'

// ========== Types ==========

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

interface UserBrief {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

export interface FeedFileItem {
  id: string
  name: string
  content: string
  layer: 'core' | 'context'
}

/** 设计审核状态（从 Phase 2 后端同步） */
export type DesignReviewStatusType =
  | 'NOT_REQUIRED'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'

export interface FeedPackageItem {
  id: string
  iterationId: string
  name: string
  phase: string
  status: string
  promptId: string | null
  coreFiles: FeedFileItem[]
  contextFiles: FeedFileItem[]
  dependsOn: string[]
  canParallel: boolean
  assigneeId: string | null
  sortOrder: number
  // ===== 设计审核流转字段 =====
  /** 这一轮是否会产出设计图（决定是否走设计审核流程） */
  designOutputRequired: boolean
  /** 实施者产出的 Figma 文件地址（推给设计时填） */
  figmaUrl: string | null
  /** 当前设计审核状态 */
  designReviewStatus: DesignReviewStatusType
  /** 指派给哪位设计师审核 */
  designReviewerId: string | null
  /** 审核人信息（批量拉好返回） */
  designReviewer: UserBrief | null
  /** 关联的 DesignDraft ID（1:1） */
  designDraftId: string | null
  // ===== 原有字段 =====
  thumbsUp: number
  thumbsDown: number
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface ProjectFeedGroup {
  iterationId: string
  iterationName: string
  iterationStatus: string
  /** 任务所在小组 id，前端用它判断"这个任务是我所在组的" */
  squadId: string
  packages: Array<{
    id: string
    name: string
    phase: string
    status: string
    /** 在同一任务（iteration）内的 1-based 轮次序号 */
    round: number
    thumbsUp: number
    thumbsDown: number
    fileCount: number
    /** Req 4.2: 用于列表上显示"被驳回"红标 */
    designReviewStatus: DesignReviewStatusType
    /** 当前负责人（null = 未领取）*/
    assigneeId: string | null
    assignee: UserBrief | null
    /** 当前审核人 */
    designReviewerId: string | null
    createdAt: number
  }>
}

export interface ExecutionRecordItem {
  id: string
  feedPackageId: string
  executedBy: UserBrief
  aiTool: string
  outputSummary: string
  issues: string | null
  executedAt: number
}

export interface FeedPackageDetail extends FeedPackageItem {
  executions: ExecutionRecordItem[]
}

export interface AssembledContent {
  feedPackageId: string
  feedPackageName: string
  assembledContent: string
}

export interface GraphNode {
  id: string
  name: string
  phase: string
  status: string
  canParallel: boolean
  sortOrder: number
}

export interface GraphEdge {
  from: string
  to: string
}

export interface DependencyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ========== API Functions ==========

export function listFeedsApi(params: {
  page?: number
  pageSize?: number
  iterationId?: string
  phase?: string
  status?: string
}) {
  return request.get<ApiResponse<PaginationData<FeedPackageItem>>>('/feeds', { params })
}

export function createFeedApi(data: {
  iterationId: string
  name: string
  phase: string
  promptId?: string
  dependsOn?: string[]
  canParallel?: boolean
  designOutputRequired?: boolean
}) {
  return request.post<ApiResponse<FeedPackageItem>>('/feeds', data)
}

export function getFeedDetailApi(id: string) {
  return request.get<ApiResponse<FeedPackageDetail>>(`/feeds/${id}`)
}

export function updateFeedApi(
  id: string,
  data: {
    name?: string
    phase?: string
    promptId?: string
    dependsOn?: string[]
    canParallel?: boolean
    assigneeId?: string
    sortOrder?: number
    designOutputRequired?: boolean
  },
) {
  return request.put<ApiResponse<FeedPackageItem>>(`/feeds/${id}`, data)
}

export function deleteFeedApi(id: string) {
  return request.delete<ApiResponse<null>>(`/feeds/${id}`)
}

export function addFeedFileApi(
  feedId: string,
  data: { name: string; content: string; layer: 'core' | 'context' },
) {
  return request.post<ApiResponse<FeedFileItem>>(`/feeds/${feedId}/files`, data)
}

export function updateFeedFileApi(
  feedId: string,
  fileId: string,
  data: { name?: string; content?: string },
) {
  return request.put<ApiResponse<FeedFileItem>>(`/feeds/${feedId}/files/${fileId}`, data)
}

export function deleteFeedFileApi(feedId: string, fileId: string) {
  return request.delete<ApiResponse<null>>(`/feeds/${feedId}/files/${fileId}`)
}

export function updateFeedStatusApi(id: string, status: string) {
  return request.post<ApiResponse<FeedPackageItem>>(`/feeds/${id}/status`, { status })
}

export function recordExecutionApi(
  feedId: string,
  data: { aiTool: string; outputSummary: string; issues?: string },
) {
  return request.post<ApiResponse<ExecutionRecordItem>>(`/feeds/${feedId}/execute`, data)
}

export function assembleFeedApi(id: string) {
  return request.get<ApiResponse<AssembledContent>>(`/feeds/${id}/assemble`)
}

export function getFeedGraphApi(iterationId: string) {
  return request.get<ApiResponse<DependencyGraph>>('/feeds/graph', {
    params: { iterationId },
  })
}

export function rateFeedApi(id: string, type: 'up' | 'down') {
  return request.post<ApiResponse<{ id: string; thumbsUp: number; thumbsDown: number }>>(`/feeds/${id}/rate`, { type })
}

export function listFeedsByProjectApi(projectId: string) {
  return request.get<ApiResponse<ProjectFeedGroup[]>>('/feeds/by-project', { params: { projectId } })
}

// ========== 设计审核流转（Phase 2 新增） ==========

/**
 * 把工作台包推给设计师审核
 * 条件：调用者必须是 assignee / createdBy / ADMIN
 * 副作用：FeedPackage.status → REVIEW, designReviewStatus → PENDING_REVIEW
 */
export function pushFeedToDesignApi(
  feedId: string,
  data: { figmaUrl: string; designerId: string },
) {
  return request.post<ApiResponse<FeedPackageItem>>(`/feeds/${feedId}/push-to-design`, data)
}

/**
 * 设计师审核通过
 * 条件：调用者必须是 designReviewerId / ADMIN
 * 副作用：designReviewStatus → APPROVED, status 保持 REVIEW
 */
export function approveDesignApi(feedId: string) {
  return request.post<ApiResponse<FeedPackageItem>>(`/feeds/${feedId}/design-approve`)
}

/**
 * 设计师驳回
 * 条件：调用者必须是 designReviewerId / ADMIN
 * 副作用：designReviewStatus → REJECTED, status → REWORK
 */
export function rejectDesignApi(feedId: string, data: { reason: string }) {
  return request.post<ApiResponse<FeedPackageItem>>(`/feeds/${feedId}/design-reject`, data)
}

/** 领取工作台包（assigneeId = 当前用户）。条件：同 squad 成员或 ADMIN，且当前未被他人占用 */
export function claimFeedApi(feedId: string) {
  return request.post<ApiResponse<{ id: string; assigneeId: string | null; updatedAt: number }>>(
    `/feeds/${feedId}/claim`,
  )
}

/**
 * 一键把工作台包推到 DONE（替代多次状态切换）。
 * 服务端会自动：
 *   1. 如未领取则把当前用户设为 assignee
 *   2. 跳过中间状态直接推到 DONE
 *   3. 解锁下游依赖 + 触发 iteration.status 自动流转
 *
 * 失败场景：
 *   - 403 不属于该任务小组
 *   - 34003 前置依赖未完成
 *   - 34004 需要产出设计图但审核未通过
 */
export function completeFeedApi(feedId: string) {
  return request.post<
    ApiResponse<{
      id: string
      iterationId: string
      status: string
      phase: string
      assigneeId: string | null
      updatedAt: number
      alreadyDone: boolean
    }>
  >(`/feeds/${feedId}/complete`)
}

/** 释放工作台包（assigneeId → null）。只有当前负责人或 ADMIN 可操作 */
export function releaseFeedApi(feedId: string) {
  return request.post<ApiResponse<{ id: string; assigneeId: string | null; updatedAt: number }>>(
    `/feeds/${feedId}/release`,
  )
}
