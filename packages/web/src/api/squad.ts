import request from './request'
import type { SquadItem } from './org'
export type { SquadItem } from './org'

// ========== Types ==========

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

interface PaginationResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ========== Squad APIs ==========

export function listSquadsApi(params?: {
  page?: number
  pageSize?: number
  projectId?: string
}) {
  return request.get<ApiResponse<PaginationResponse<SquadItem>>>('/squads', { params })
}

export function createSquadApi(data: {
  name: string
  projectId: string
  architectId: string
  engineerId: string
}) {
  return request.post<ApiResponse<SquadItem>>('/squads', data)
}

export function getSquadApi(id: string) {
  return request.get<ApiResponse<SquadItem>>(`/squads/${id}`)
}

export function updateSquadApi(
  id: string,
  data: {
    name?: string
    architectId?: string
    engineerId?: string
  },
) {
  return request.put<ApiResponse<SquadItem>>(`/squads/${id}`, data)
}

export function deleteSquadApi(id: string) {
  return request.delete<ApiResponse<null>>(`/squads/${id}`)
}
