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

export interface BoardItem {
  id: string
  projectId: string
  name: string
  description: string | null
  createdBy: UserBrief
  selectionCount: number
  createdAt: number
  updatedAt: number
}

export interface PromptBrief {
  id: string
  name: string
  category: string
  starCount: number
  description: string | null
  content?: string
  tags?: string[]
}

export interface SopDocBrief {
  id: string
  title: string
  layer: string
  sopProjectId: string
  sopProjectName: string | null
}

export type SelectionType = 'prompt' | 'sop_doc' | 'text' | 'sticky'

/** SopLayer 对应的 8 种"白板 tab 类型"（Phase 5.3） */
export type SopLayerType =
  | 'PRODUCT_REQ'
  | 'CONTENT'
  | 'DESIGN_SYSTEM'
  | 'FRONTEND_ARCH'
  | 'BACKEND_ARCH'
  | 'AI_PROMPTS'
  | 'ACCEPTANCE'
  | 'APPENDIX'

/** 前端统一的 layer 显示顺序（和后端 LAYER_ORDER 对齐） */
export const LAYER_ORDER: SopLayerType[] = [
  'PRODUCT_REQ',
  'CONTENT',
  'DESIGN_SYSTEM',
  'FRONTEND_ARCH',
  'BACKEND_ARCH',
  'AI_PROMPTS',
  'ACCEPTANCE',
  'APPENDIX',
]

/** Layer 中文显示名 */
export const LAYER_LABELS: Record<SopLayerType, string> = {
  PRODUCT_REQ: '产品需求',
  CONTENT: '内容素材',
  DESIGN_SYSTEM: '设计系统',
  FRONTEND_ARCH: '前端架构',
  BACKEND_ARCH: '后端架构',
  AI_PROMPTS: 'AI 提示词',
  ACCEPTANCE: '验收标准',
  APPENDIX: '附录',
}

export interface BoardSelection {
  id: string
  boardId: string
  userId: string
  type: SelectionType
  promptId: string | null
  sopDocumentId: string | null
  content: string | null
  color: string | null
  size: { width: number; height: number } | null
  position: { x: number; y: number }
  note: string | null
  prompt: PromptBrief | null
  sopDocument: SopDocBrief | null
  createdBy: UserBrief
  // ===== 指派 + 完成状态（Phase 2 新增） =====
  /** 当前有效指派人（可能是继承 layer 负责人，也可能是手动覆盖） */
  assigneeId: string | null
  /** 指派人详情（批量拉好返回） */
  assignee: UserBrief | null
  /** 完成时间（null = 未完成），用于"我的任务"筛选和推进 gate */
  completedAt: number | null
  // ===== Phase 5.3: layer tab + 继承模式 =====
  /** 卡片所属 layer/tab */
  layer: SopLayerType | null
  /** true = 跟随 layer 负责人；false = 手动覆盖 */
  assigneeInherit: boolean
  // ===== Req 1: prompt 覆盖（仅本白板本卡片生效的本地修改） =====
  /** 本地修改后的标题（覆盖 prompt.name） */
  promptOverrideTitle: string | null
  /** 本地修改后的内容（覆盖 prompt.content） */
  promptOverrideContent: string | null
  /** 本地修改后的标签（覆盖 prompt.tags） */
  promptOverrideTags: string[]
  /** 有效标题：override 优先，否则 prompt.name */
  effectiveTitle: string | null
  /** 有效内容：override 优先，否则 prompt.content */
  effectiveContent: string | null
  /** 有效标签：override 优先，否则 prompt.tags */
  effectiveTags: string[]
  /** 是否有本地覆盖（任一字段被修改即为 true） */
  hasOverride: boolean
  createdAt: number
  updatedAt: number
}

/** 白板 layer 负责人条目 */
export interface LayerAssignmentRow {
  layer: SopLayerType
  assigneeId: string | null
  assignee: UserBrief | null
  assignedById: string | null
  updatedAt: number
}

export interface BoardDetail extends BoardItem {
  selections: BoardSelection[]
  /** 按 LAYER_ORDER 顺序返回的 8 条 layer 负责人记录 */
  layerAssignments: LayerAssignmentRow[]
}

export interface ExportResult {
  name: string
  assembledContent: string
}

/** 白板卡片审计日志记录 */
export type SelectionActivityAction =
  | 'assign'
  | 'unassign'
  | 'reassign'
  | 'complete'
  | 'reopen'

export interface SelectionActivityItem {
  id: string
  action: SelectionActivityAction
  byId: string
  byName: string | null
  /** reassign/unassign 场景：之前的 assignee */
  fromUserId: string | null
  fromUserName: string | null
  /** assign/reassign 场景：新的 assignee */
  toUserId: string | null
  toUserName: string | null
  note: string | null
  createdAt: number
}

// ========== API Functions ==========

export function listBoardsApi(params: {
  projectId: string
  page?: number
  pageSize?: number
}) {
  return request.get<ApiResponse<PaginationData<BoardItem>>>('/boards', { params })
}

export function createBoardApi(data: {
  projectId: string
  name: string
  description?: string
}) {
  return request.post<ApiResponse<BoardItem>>('/boards', data)
}

export function getBoardDetailApi(id: string) {
  return request.get<ApiResponse<BoardDetail>>(`/boards/${id}`)
}

export function updateBoardApi(id: string, data: { name?: string; description?: string }) {
  return request.put<ApiResponse<BoardItem>>(`/boards/${id}`, data)
}

export function deleteBoardApi(id: string) {
  return request.delete<ApiResponse<null>>(`/boards/${id}`)
}

export function addSelectionApi(
  boardId: string,
  data: {
    type?: SelectionType
    promptId?: string
    sopDocumentId?: string
    content?: string
    color?: string
    size?: { width: number; height: number }
    position: { x: number; y: number }
    note?: string
    /** 可选：创建时直接手动指派（不从 layer 继承） */
    assigneeId?: string
    /**
     * 卡片所属 layer。
     * - type=sop_doc 时可以不传，会自动从 sopDocument.layer 推断
     * - 其他类型：必须传（等于当前激活的 tab）
     */
    layer?: SopLayerType
    /** Req 1: 自建提示词卡的标题 */
    promptOverrideTitle?: string
    /** Req 1: 自建提示词卡的内容 */
    promptOverrideContent?: string
    /** Req 1: 自建提示词卡的标签 */
    promptOverrideTags?: string[]
  },
) {
  return request.post<ApiResponse<BoardSelection>>(`/boards/${boardId}/selections`, data)
}

export function updateSelectionApi(
  boardId: string,
  selId: string,
  data: {
    position?: { x: number; y: number }
    note?: string
    content?: string
    color?: string
    size?: { width: number; height: number }
    /** string = 手动指派；null = 清空手动指派并恢复继承 */
    assigneeId?: string | null
    /** 切换卡片归属 layer（跨 tab 拖拽） */
    layer?: SopLayerType
    /** 显式设置继承模式（true = 恢复继承；false = 进入手动） */
    assigneeInherit?: boolean
    /** Req 1: 本地覆盖标题，null = 清除覆盖 */
    promptOverrideTitle?: string | null
    /** Req 1: 本地覆盖内容，null = 清除覆盖 */
    promptOverrideContent?: string | null
    /** Req 1: 本地覆盖标签 */
    promptOverrideTags?: string[]
  },
) {
  return request.put<ApiResponse<BoardSelection>>(`/boards/${boardId}/selections/${selId}`, data)
}

/**
 * Req 1: 把当前卡片的本地覆盖内容 fork 为一个新的提示词，保存到公共库
 * 返回新创建的 prompt 基本信息 + 更新后的 selection（已切换 promptId 指向新 prompt）
 */
export function forkSelectionToLibraryApi(
  boardId: string,
  selId: string,
  data: {
    name?: string
    visibility?: 'private' | 'team' | 'public'
    category?: string
  },
) {
  return request.post<ApiResponse<{ prompt: PromptBrief; selection: BoardSelection }>>(
    `/boards/${boardId}/selections/${selId}/fork-to-library`,
    data,
  )
}

export function removeSelectionApi(boardId: string, selId: string) {
  return request.delete<ApiResponse<null>>(`/boards/${boardId}/selections/${selId}`)
}

export function exportBoardApi(boardId: string) {
  return request.post<ApiResponse<ExportResult>>(`/boards/${boardId}/export`)
}

// ========== 卡片完成/撤回 + 审计（Phase 2 新增） ==========

/**
 * 指派人确认完成卡片
 * 条件：调用者必须是 assigneeId / ADMIN
 * 副作用：completedAt → 当前时间 + 写入 complete 审计
 */
export function completeSelectionApi(boardId: string, selId: string) {
  return request.post<ApiResponse<BoardSelection>>(
    `/boards/${boardId}/selections/${selId}/complete`,
  )
}

/**
 * 撤回完成状态（让卡片回到未完成）
 * 条件：调用者必须是 assigneeId / ADMIN
 * 副作用：completedAt → null + 写入 reopen 审计（可带 note 说明原因）
 */
export function reopenSelectionApi(
  boardId: string,
  selId: string,
  note?: string,
) {
  return request.post<ApiResponse<BoardSelection>>(
    `/boards/${boardId}/selections/${selId}/reopen`,
    { note },
  )
}

/**
 * 查询卡片的审计日志（按时间倒序）
 */
export function listSelectionActivitiesApi(
  boardId: string,
  selId: string,
  limit: number = 50,
) {
  return request.get<ApiResponse<SelectionActivityItem[]>>(
    `/boards/${boardId}/selections/${selId}/activity`,
    { params: { limit } },
  )
}

// ========== Phase 5.3: Layer 负责人管理 ==========

/** 列出白板 8 个 layer 的负责人 */
export function listLayerAssignmentsApi(boardId: string) {
  return request.get<ApiResponse<LayerAssignmentRow[]>>(
    `/boards/${boardId}/layer-assignments`,
  )
}

/**
 * 指派/改换/清空某 layer 的负责人
 * 权限：ARCHITECT / ADMIN
 * 副作用：自动同步所有 assigneeInherit=true 的同 layer 卡片 assignee
 */
export function upsertLayerAssignmentApi(
  boardId: string,
  data: { layer: SopLayerType; assigneeId: string | null },
) {
  return request.post<ApiResponse<LayerAssignmentRow>>(
    `/boards/${boardId}/layer-assignments`,
    data,
  )
}
