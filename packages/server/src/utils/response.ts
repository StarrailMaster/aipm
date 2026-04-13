import type { Response } from 'express'

interface ApiResponseBody<T> {
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

export function success<T>(res: Response, data: T, message = 'ok'): void {
  const body: ApiResponseBody<T> = {
    code: 0,
    message,
    data,
    timestamp: Date.now(),
  }
  res.json(body)
}

export function error(
  res: Response,
  code: number,
  message: string,
  statusCode = 400,
): void {
  const body: ApiResponseBody<null> = {
    code,
    message,
    data: null,
    timestamp: Date.now(),
  }
  res.status(statusCode).json(body)
}

export function paginate<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): void {
  const totalPages = Math.ceil(total / pageSize)
  const data: PaginationData<T> = {
    items,
    total,
    page,
    pageSize,
    totalPages,
  }
  const body: ApiResponseBody<PaginationData<T>> = {
    code: 0,
    message: 'ok',
    data,
    timestamp: Date.now(),
  }
  res.json(body)
}

export function parsePagination(query: Record<string, unknown>): {
  page: number
  pageSize: number
  skip: number
} {
  let page = Number(query.page) || 1
  let pageSize = Number(query.pageSize) || 20
  if (page < 1) page = 1
  if (pageSize < 1) pageSize = 1
  if (pageSize > 100) pageSize = 100
  const skip = (page - 1) * pageSize
  return { page, pageSize, skip }
}
