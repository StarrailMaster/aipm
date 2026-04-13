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

export type HypothesisTemplateCategory =
  | 'acquisition'
  | 'activation'
  | 'retention'
  | 'revenue'
  | 'referral'
  | 'custom'

export interface HypothesisTemplatePlaceholder {
  key: string
  label: string
  labelEn?: string
  required: boolean
  type?: 'string' | 'number' | 'date'
  defaultValue?: string | number
  enumOptions?: Array<{ value: string; label: string }>
}

export interface HypothesisTemplateBrief {
  id: string
  name: string
  nameEn?: string
  category: HypothesisTemplateCategory
  description: string
  isSystemDefault: boolean
  usageCount: number
  placeholderCount: number
  createdAt: number
}

export interface HypothesisTemplate extends Omit<HypothesisTemplateBrief, 'placeholderCount'> {
  descriptionEn?: string
  statementTemplate: string
  statementTemplateEn?: string
  mechanismTemplate: string
  mechanismTemplateEn?: string
  suggestedMetricType: string | null
  suggestedMetricName: string | null
  placeholders: HypothesisTemplatePlaceholder[]
  createdBy: {
    id: string
    name: string
  } | null
  updatedAt: number
}

export interface ListTemplateParams {
  page?: number
  pageSize?: number
  category?: HypothesisTemplateCategory
  isSystemDefault?: boolean
  search?: string
  sortBy?: 'usage' | 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
}

export function listTemplatesApi(params?: ListTemplateParams) {
  return request.get<ApiResponse<PaginationData<HypothesisTemplateBrief>>>(
    '/hypothesis-templates',
    { params },
  )
}

export function getTemplateApi(id: string) {
  return request.get<ApiResponse<HypothesisTemplate>>(`/hypothesis-templates/${id}`)
}

export interface CreateTemplateRequest {
  name: string
  nameEn?: string
  category: HypothesisTemplateCategory
  description: string
  descriptionEn?: string
  statementTemplate: string
  statementTemplateEn?: string
  mechanismTemplate: string
  mechanismTemplateEn?: string
  suggestedMetricType?: string
  suggestedMetricName?: string
  placeholders: HypothesisTemplatePlaceholder[]
}

export function createTemplateApi(data: CreateTemplateRequest) {
  return request.post<ApiResponse<HypothesisTemplate>>('/hypothesis-templates', data)
}

export function updateTemplateApi(id: string, data: Partial<CreateTemplateRequest>) {
  return request.put<ApiResponse<HypothesisTemplate>>(
    `/hypothesis-templates/${id}`,
    data,
  )
}

export function deleteTemplateApi(id: string) {
  return request.delete<ApiResponse<null>>(`/hypothesis-templates/${id}`)
}

export function createHypothesisFromTemplateApi(
  templateId: string,
  data: {
    krId: string
    parentId?: string | null
    placeholderValues: Record<string, string | number>
  },
) {
  return request.post<ApiResponse<{ id: string } & Record<string, unknown>>>(
    `/hypothesis-templates/${templateId}/create-hypothesis`,
    data,
  )
}
