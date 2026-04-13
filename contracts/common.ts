// AIPM 公共类型定义
// 所有 agent 共享，仅 infra-agent 可修改

// 统一 API 响应
export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

// 分页请求
export interface PaginationQuery {
  page: number
  pageSize: number
}

// 分页响应
export interface PaginationResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 角色枚举
export enum Role {
  ADMIN = 'ADMIN',
  ARCHITECT = 'ARCHITECT',
  ENGINEER = 'ENGINEER',
  DESIGNER = 'DESIGNER',
}

// 迭代状态
export enum IterationStatus {
  SPEC = 'SPEC',           // ① 定规范
  DESIGN = 'DESIGN',       // ② 生成设计图
  REFINE = 'REFINE',       // ③ UI 精修
  IMPLEMENT = 'IMPLEMENT', // ④ 实施
  ACCEPT = 'ACCEPT',       // ⑤ 验收
  DONE = 'DONE',           // 完成
}

// 用户基础信息（嵌入其他响应中使用）
export interface UserBrief {
  id: string
  name: string
  email: string
  role: Role
  avatar: string | null
  legacyRoles: string[] // 原岗位标签
}

// 认证相关
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  name: string
}

export interface AuthResponse {
  token: string
  user: UserBrief
}

// WebSocket 消息类型
export enum WsMessageType {
  SELECTION_UPDATE = 'selection_update',   // 白板选择同步
  STATUS_CHANGE = 'status_change',         // 状态变更通知
  NOTIFICATION = 'notification',           // 通用通知
}

export interface WsMessage<T = any> {
  type: WsMessageType
  payload: T
  userId: string
  timestamp: number
}
