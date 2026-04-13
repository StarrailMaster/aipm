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

/** 从 API 返回的提示词引用条目（属于某个 SopDocument） */
export interface SopDocumentPromptRef {
  id: string
  sortOrder: number
  note: string | null
  prompt: {
    id: string
    name: string
    description: string | null
    category: string
    tags: string[]
    content: string
    starCount: number
  }
}

export interface SopProjectItem {
  id: string
  name: string
  version: string
  description: string | null
  visibility: 'private' | 'team' | 'public'
  documentCount: number
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface SopDocumentItem {
  id: string
  sopProjectId: string
  layer: string
  title: string
  /** Req 7: 原 content 字段改名 description，作为条目简要说明 */
  description: string | null
  version: number
  tags: string[]
  sortOrder: number
  createdBy: UserBrief
  /** Req 7: 该 SopDocument 引用的 Prompt 列表（按 sortOrder 排序）*/
  prompts: SopDocumentPromptRef[]
  createdAt: number
  updatedAt: number
}

export interface SopProjectDetail extends Omit<SopProjectItem, 'documentCount'> {
  documents: SopDocumentItem[]
}

export interface SopVersionItem {
  id: string
  documentId: string
  version: number
  title: string
  content: string  // 旧字段：历史版本快照
  tags: string[]
  createdBy: UserBrief
  createdAt: number
}

export interface SopDiffResult {
  oldVersion: number
  newVersion: number
  diff: string
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

// ========== SOP Project ==========

export function listSopProjectsApi(params: {
  page?: number
  pageSize?: number
  keyword?: string
  visibility?: 'private' | 'team' | 'public'
}) {
  return request.get<ApiResponse<PaginationData<SopProjectItem>>>('/sop', { params })
}

/** Req 7: 创建 SOP 不再需要 projectId */
export function createSopProjectApi(data: {
  name: string
  description?: string
  visibility?: 'private' | 'team' | 'public'
}) {
  return request.post<ApiResponse<SopProjectItem>>('/sop', data)
}

export function getSopProjectApi(id: string) {
  return request.get<ApiResponse<SopProjectDetail>>(`/sop/${id}`)
}

export function updateSopProjectApi(
  id: string,
  data: {
    name?: string
    description?: string
    visibility?: 'private' | 'team' | 'public'
    version?: string
  },
) {
  return request.put<ApiResponse<SopProjectItem>>(`/sop/${id}`, data)
}

export function deleteSopProjectApi(id: string) {
  return request.delete<ApiResponse<null>>(`/sop/${id}`)
}

// ========== SOP Document ==========

export function createSopDocumentApi(
  sopProjectId: string,
  data: {
    layer: string
    title: string
    description?: string
    tags?: string[]
    /** 可选：创建时一并绑定一组提示词 */
    promptIds?: string[]
  },
) {
  return request.post<ApiResponse<SopDocumentItem>>(`/sop/${sopProjectId}/documents`, data)
}

export function updateSopDocumentApi(
  docId: string,
  data: {
    title?: string
    description?: string
    tags?: string[]
  },
) {
  return request.put<ApiResponse<SopDocumentItem>>(`/sop/documents/${docId}`, data)
}

export function deleteSopDocumentApi(docId: string) {
  return request.delete<ApiResponse<null>>(`/sop/documents/${docId}`)
}

// ========== Prompt Reference Management (Req 7) ==========

/** 添加一个 Prompt 引用到 SopDocument */
export function addPromptToSopDocApi(
  docId: string,
  data: { promptId: string; note?: string | null },
) {
  return request.post<ApiResponse<SopDocumentPromptRef>>(
    `/sop/documents/${docId}/prompts`,
    data,
  )
}

/** 更新引用（sortOrder 或 note） */
export function updateSopPromptRefApi(
  docId: string,
  refId: string,
  data: { sortOrder?: number; note?: string | null },
) {
  return request.put<ApiResponse<SopDocumentPromptRef>>(
    `/sop/documents/${docId}/prompts/${refId}`,
    data,
  )
}

/** 批量重排（拖拽后的新顺序） */
export function reorderSopPromptsApi(
  docId: string,
  orderedRefIds: string[],
) {
  return request.post<ApiResponse<null>>(
    `/sop/documents/${docId}/prompts/reorder`,
    { orderedRefIds },
  )
}

/** 删除引用 */
export function removeSopPromptRefApi(docId: string, refId: string) {
  return request.delete<ApiResponse<null>>(`/sop/documents/${docId}/prompts/${refId}`)
}

// ========== Version History ==========

export function getDocumentVersionsApi(docId: string) {
  return request.get<ApiResponse<SopVersionItem[]>>(`/sop/documents/${docId}/versions`)
}

export function getDocumentDiffApi(docId: string, oldVersion: number, newVersion: number) {
  return request.get<ApiResponse<SopDiffResult>>(`/sop/documents/${docId}/diff`, {
    params: { oldVersion, newVersion },
  })
}
