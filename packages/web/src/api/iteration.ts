import request from './request'

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

/**
 * Iteration 关联的 Hypothesis 简要信息（B.2 + B.4 桥接用）
 */
export interface IterationHypothesisBrief {
  id: string
  statement: string
  status: string
  parentId?: string | null
  krId?: string
  krName?: string
  objectiveId?: string
  objectiveName?: string
}

export interface IterationItem {
  id: string
  projectId: string
  projectName: string | null
  squadId: string
  squadName: string | null
  name: string
  status: string
  statusLabel: string
  boardId: string | null
  feedCount: number
  feedCompletedCount: number
  /** Phase B.4: 反向显示父假设 */
  hypothesisId: string | null
  hypothesis: IterationHypothesisBrief | null
  createdAt: number
  updatedAt: number
}

export interface IterationDetail extends IterationItem {
  allowedTransitions: Array<{ status: string; label: string }>
  feeds: Array<{ id: string; name: string; phase: string; status: string; sortOrder: number }>
  designs: Array<{ id: string; name: string; status: string }>
}

export interface AdvanceResult {
  id: string
  name: string
  status: string
  statusLabel: string
  allowedTransitions: Array<{ status: string; label: string }>
  feedPackageId: string | null
  updatedAt: number
  agentResult?: {
    /** 本次清空的旧工作台包数（每次都会先清空再重新生成） */
    resetDeletedCount: number
    reasoning: string
    plannedCount: number
    generatedCount: number
    failedCount: number
    /** 白板上可用的 SOP 文档总数 */
    totalDocuments: number
    /** Agent 没有分配到任何一轮的文档数 */
    unassignedDocumentCount: number
    rounds: Array<{
      id: string
      sortOrder: number
      title: string
      phase: string
      /** 本轮包含的文件数（入口文件 + 被分配的 SOP 原文） */
      fileCount: number
    }>
    failures: Array<{
      roundNumber: number
      title: string
      error: string
    }>
  }
}

export function listIterationsApi(params: {
  page?: number
  pageSize?: number
  projectId?: string
  squadId?: string
  status?: string
  search?: string
}) {
  return request.get<ApiResponse<PaginationData<IterationItem>>>('/iterations', { params })
}

export function createIterationApi(data: {
  projectId: string
  squadId: string
  name: string
}) {
  return request.post<ApiResponse<IterationItem>>('/iterations', data)
}

export function getIterationApi(id: string) {
  return request.get<ApiResponse<IterationDetail>>(`/iterations/${id}`)
}

export function updateIterationApi(id: string, data: { name?: string }) {
  return request.put<ApiResponse<IterationItem>>(`/iterations/${id}`, data)
}

export function updateIterationStatusApi(id: string, status: string) {
  return request.post<ApiResponse<IterationItem>>(`/iterations/${id}/status`, { status })
}

export function advanceIterationApi(id: string) {
  return request.post<ApiResponse<AdvanceResult>>(`/iterations/${id}/advance`)
}

export function deleteIterationApi(id: string) {
  return request.delete<ApiResponse<null>>(`/iterations/${id}`)
}
