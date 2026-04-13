import { getToken, getServerUrl } from './config'

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function buildUrl(path: string): string {
  const base = getServerUrl().replace(/\/+$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}`
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    let parsed: ApiResponse<unknown> | null = null
    try {
      parsed = JSON.parse(text) as ApiResponse<unknown>
    } catch {
      // not JSON
    }
    if (parsed && parsed.code !== 0) {
      throw new ApiError(parsed.code, parsed.message)
    }
    throw new ApiError(response.status, `HTTP ${response.status}: ${text}`)
  }

  const json = (await response.json()) as ApiResponse<T>
  if (json.code !== 0) {
    throw new ApiError(json.code, json.message)
  }
  return json.data as T
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = buildUrl(path)
  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(),
  })
  return handleResponse<T>(response)
}

export async function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = buildUrl(path)
  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  })
  return handleResponse<T>(response)
}

export { ApiError }
