import request from './request'

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

// ========== Types ==========

export interface AiConfig {
  ai_provider: string
  ai_api_key_masked: string
  ai_organization: string
  ai_base_url: string
  ai_model: string
  ai_temperature: string
  ai_max_tokens: string
}

export interface ModelInfo {
  id: string
  recommended: boolean
  priority: number
}

export interface TestConnectionOk {
  ok: true
  normalizedBaseUrl: string
  detectedOrganization: string | null
  models: ModelInfo[]
  modelCount: number
  recommendedModel: string | null
  currentModel: string
  currentModelValid: boolean
}

export interface TestConnectionError {
  ok: false
  errorCode: string
  errorMessage: string
  httpStatus: number | null
  normalizedBaseUrl: string
  detectedOrganization: string | null
}

export type TestConnectionResult = TestConnectionOk | TestConnectionError

export interface ModelsListResult {
  models: ModelInfo[]
  recommendedModel: string | null
  currentModel: string
  currentModelValid: boolean
}

export interface UpdateValidation {
  ok: boolean
  modelWasReplaced: boolean
  originalModel: string
  finalModel: string
  availableModels: string[]
  errorCode?: string
  errorMessage?: string
}

export interface UpdateAiConfigResponse {
  config: AiConfig
  validation?: UpdateValidation
}

// ========== API ==========

export function getAiConfig() {
  return request.get<ApiResponse<AiConfig>>('/settings/ai')
}

export function updateAiConfig(
  data: Record<string, string>,
  skipValidation = false,
) {
  return request.put<ApiResponse<UpdateAiConfigResponse>>(
    '/settings/ai' + (skipValidation ? '?skipValidation=true' : ''),
    data,
  )
}

/**
 * 检测 AI 连接（不保存）
 * 传入新的 apiKey / baseUrl 做 what-if 测试，留空则用已存值
 */
export function testAiConnection(data: {
  ai_api_key?: string
  ai_base_url?: string
  ai_organization?: string
  ai_model?: string
}) {
  return request.post<ApiResponse<TestConnectionResult>>(
    '/settings/ai/test-connection',
    data,
  )
}

/** 获取当前配置下的可用模型列表 */
export function fetchAiModels() {
  return request.get<ApiResponse<ModelsListResult>>('/settings/ai/models')
}
