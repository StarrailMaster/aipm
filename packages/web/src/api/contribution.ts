import request from './request'

// ========== Types ==========

interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
  timestamp: number
}

export type ContributionSourceType =
  | 'prompt'
  | 'skill'
  | 'sop_project'
  | 'sop_document'
  | 'prompt_pr'

export type PointCategory = 'base' | 'value'

export interface ContributionBreakdown {
  prompt: number
  skill: number
  sop_project: number
  sop_document: number
  prompt_pr: number
}

export interface LeaderboardUser {
  id: string
  name: string
  email: string
  avatar: string | null
}

export interface LeaderboardItem {
  rank: number
  user: LeaderboardUser
  totalPoints: number
  basePoints: number
  valuePoints: number
  breakdown: ContributionBreakdown
  recentEventCount: number
}

export interface ContributionEventItem {
  id: string
  eventType: string
  category: PointCategory
  sourceType: ContributionSourceType
  sourceId: string
  points: number
  reason: string
  createdAt: number
}

export interface RecentEventWithUser extends ContributionEventItem {
  user: {
    id: string
    name: string
    avatar: string | null
  }
}

export interface MyContributionRank {
  week: number | null
  month: number | null
  all: number | null
}

export interface MyContributionResult {
  totalPoints: number
  weekPoints: number
  monthPoints: number
  basePoints: number
  valuePoints: number
  breakdown: ContributionBreakdown
  recentEvents: ContributionEventItem[]
  rank: MyContributionRank
}

// ========== API Functions ==========

/** 后端对 leaderboard / recent 返回的包装：{ items, ...meta } */
interface LeaderboardResponse {
  items: LeaderboardItem[]
  window: 'week' | 'month' | 'all'
  sourceType: ContributionSourceType | null
  limit: number
}

interface RecentEventsResponse {
  items: RecentEventWithUser[]
  limit: number
  sourceType: ContributionSourceType | null
}

/** 获取贡献榜单 */
export function getLeaderboardApi(params: {
  window: 'week' | 'month' | 'all'
  sourceType?: ContributionSourceType
  limit?: number
}) {
  return request.get<ApiResponse<LeaderboardResponse>>('/contribution/leaderboard', {
    params,
  })
}

/** 获取我的贡献概况 */
export function getMyContributionApi() {
  return request.get<ApiResponse<MyContributionResult>>('/contribution/me')
}

/** 获取团队最近的贡献事件流 */
export function getRecentEventsApi(params?: {
  limit?: number
  sourceType?: ContributionSourceType
}) {
  return request.get<ApiResponse<RecentEventsResponse>>('/contribution/recent', {
    params,
  })
}

/** 获取指定用户的贡献概况 */
export function getUserContributionApi(userId: string) {
  return request.get<ApiResponse<MyContributionResult>>(`/contribution/user/${userId}`)
}
