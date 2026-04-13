import axios from 'axios'
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

const TOKEN_KEY = 'aipm_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// baseURL 用相对路径 '/api/v1'：
//   - 开发环境：vite 的 devServer.proxy 把 /api 转发到 http://127.0.0.1:3100
//   - 生产环境：nginx 的 location /api/ 反代到 http://127.0.0.1:3100
// 用相对路径才能让前端在任何域名/IP 下都正确工作，
// 不要再硬编码 127.0.0.1:3100（那样浏览器会去连用户自己电脑的 3100）
const request: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  // AI 生成类接口（工作台包组装、反馈总结）单次调用可能 60-180s，
  // 加上多轮分片场景需要更长时间，这里给 3 分钟兜底
  timeout: 180000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: auto-attach JWT
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// Response interceptor: unified error handling
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const res = response.data

    // code !== 0 means business error
    if (res.code !== 0) {
      ElMessage.error(res.message || 'Request failed')

      // Authentication errors: clear token and redirect
      if (res.code === 10001 || res.code === 10002) {
        removeToken()
        window.location.href = '/login'
      }

      return Promise.reject(new Error(res.message || 'Request failed'))
    }

    return response
  },
  (error) => {
    const message =
      error.response?.data?.message || error.message || 'Network error'
    ElMessage.error(message)
    return Promise.reject(error)
  },
)

export default request
