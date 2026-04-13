import request from './request'

interface UserBrief {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

interface AuthResponse {
  token: string
  user: UserBrief
}

interface UserProfile extends UserBrief {
  squadId: string | null
  squadName: string | null
  createdAt: number
}

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

export function registerApi(data: { email: string; password: string; name: string }) {
  return request.post<ApiResponse<AuthResponse>>('/auth/register', data)
}

export function loginApi(data: { email: string; password: string }) {
  return request.post<ApiResponse<AuthResponse>>('/auth/login', data)
}

export function getMeApi() {
  return request.get<ApiResponse<UserProfile>>('/auth/me')
}

export function updateMeApi(data: { name?: string; avatar?: string; legacyRoles?: string[] }) {
  return request.put<ApiResponse<UserProfile>>('/auth/me', data)
}
