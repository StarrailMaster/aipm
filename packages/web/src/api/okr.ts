import request from './request'

// ========== Types ==========

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

interface UserBrief {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

export interface IterationRecordItem {
  id: string
  keyResultId: string
  roundNumber: number
  changes: string
  dataFeedback: number
  isAchieved: boolean
  recordedBy: UserBrief
  createdAt: number
}

export interface KeyResultItem {
  id: string
  objectiveId: string
  name: string
  targetValue: number
  currentValue: number
  unit: string
  status: 'achieved' | 'not_achieved'
  iterations: IterationRecordItem[]
  createdAt: number
  updatedAt: number
}

export interface ObjectiveItem {
  id: string
  projectId: string
  name: string
  description: string | null
  squadId: string | null
  squadName: string | null
  keyResults: KeyResultItem[]
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

// ========== API Functions ==========

export function listObjectivesApi(params: { projectId: string }) {
  return request.get<ApiResponse<ObjectiveItem[]>>('/okr', { params })
}

export function createObjectiveApi(data: {
  projectId: string
  name: string
  description?: string
  squadId?: string
}) {
  return request.post<ApiResponse<ObjectiveItem>>('/okr/objectives', data)
}

export function updateObjectiveApi(
  id: string,
  data: {
    name?: string
    description?: string
    squadId?: string
  },
) {
  return request.put<ApiResponse<ObjectiveItem>>(`/okr/objectives/${id}`, data)
}

export function deleteObjectiveApi(id: string) {
  return request.delete<ApiResponse<null>>(`/okr/objectives/${id}`)
}

export function createKeyResultApi(data: {
  objectiveId: string
  name: string
  targetValue: number
  unit: string
}) {
  return request.post<ApiResponse<KeyResultItem>>('/okr/key-results', data)
}

export function updateKeyResultApi(
  id: string,
  data: {
    name?: string
    targetValue?: number
    unit?: string
  },
) {
  return request.put<ApiResponse<KeyResultItem>>(`/okr/key-results/${id}`, data)
}

export function deleteKeyResultApi(id: string) {
  return request.delete<ApiResponse<null>>(`/okr/key-results/${id}`)
}

export function recordIterationApi(
  keyResultId: string,
  data: {
    changes: string
    dataFeedback: number
  },
) {
  return request.post<ApiResponse<IterationRecordItem>>(
    `/okr/key-results/${keyResultId}/record`,
    data,
  )
}

export function getIterationHistoryApi(keyResultId: string) {
  return request.get<ApiResponse<IterationRecordItem[]>>(
    `/okr/key-results/${keyResultId}/iterations`,
  )
}
