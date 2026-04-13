import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getLeaderboardApi,
  getMyContributionApi,
  getRecentEventsApi,
  type LeaderboardItem,
  type MyContributionResult,
  type RecentEventWithUser,
  type ContributionSourceType,
} from '@/api/contribution'

export const useContributionStore = defineStore('contribution', () => {
  // ========== State ==========

  const leaderboard = ref<LeaderboardItem[]>([])
  const leaderboardLoading = ref(false)

  const myContribution = ref<MyContributionResult | null>(null)
  const myLoading = ref(false)

  const recentEvents = ref<RecentEventWithUser[]>([])
  const recentLoading = ref(false)

  // ========== Actions ==========

  async function fetchLeaderboard(params: {
    window: 'week' | 'month' | 'all'
    sourceType?: ContributionSourceType
    limit?: number
  }) {
    leaderboardLoading.value = true
    try {
      const res = await getLeaderboardApi(params)
      // 后端返回 { items, window, sourceType, limit }，这里解包
      leaderboard.value = res.data.data?.items ?? []
    } finally {
      leaderboardLoading.value = false
    }
  }

  async function fetchMyContribution() {
    myLoading.value = true
    try {
      const res = await getMyContributionApi()
      myContribution.value = res.data.data ?? null
    } finally {
      myLoading.value = false
    }
  }

  async function fetchRecentEvents(params?: {
    limit?: number
    sourceType?: ContributionSourceType
  }) {
    recentLoading.value = true
    try {
      const res = await getRecentEventsApi(params)
      // 后端返回 { items, limit, sourceType }，这里解包
      recentEvents.value = res.data.data?.items ?? []
    } finally {
      recentLoading.value = false
    }
  }

  return {
    // State
    leaderboard,
    leaderboardLoading,
    myContribution,
    myLoading,
    recentEvents,
    recentLoading,
    // Actions
    fetchLeaderboard,
    fetchMyContribution,
    fetchRecentEvents,
  }
})
