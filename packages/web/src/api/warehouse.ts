import request from './request'

// ========== Types ==========

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

interface WarehouseResult {
  qualityCheck: 'pass' | 'fail'
  qualityNote: string | null
  isDuplicate: boolean
  similarFeedbackId: string | null
  similarityNote: string | null
  targetPromptId: string | null
  targetSection: string | null
  autoTags: string[]
}

export interface WarehouseResponse {
  feedbackId: string
  status: string
  warehouseResult: WarehouseResult | null
}

// ========== API Functions ==========

export function processWarehouseApi(feedbackId: string) {
  return request.post<ApiResponse<WarehouseResponse>>(`/warehouse/process/${feedbackId}`)
}

export function getWarehouseResultApi(feedbackId: string) {
  return request.get<ApiResponse<WarehouseResponse>>(`/warehouse/result/${feedbackId}`)
}
