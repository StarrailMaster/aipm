import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getLearningDashboardApi,
  triggerDigestApi,
  getCrossProjectDashboardApi,
  getCopilotCostSummaryApi,
  type LearningDashboardResponse,
  type CrossProjectDashboardResponse,
  type CopilotCostSummary,
} from '@/api/copilot-dashboard'

export const useLearningDashboardStore = defineStore('learningDashboard', () => {
  const data = ref<LearningDashboardResponse | null>(null)
  const loading = ref(false)
  const lastFetchedAt = ref<number | null>(null)

  const crossProjectData = ref<CrossProjectDashboardResponse | null>(null)
  const costSummary = ref<CopilotCostSummary | null>(null)

  async function fetch(params?: { projectId?: string; scope?: 'all' | 'mine' }) {
    loading.value = true
    try {
      const res = await getLearningDashboardApi(params)
      if (res.data.code === 0 && res.data.data) {
        data.value = res.data.data
        lastFetchedAt.value = Date.now()
      }
    } finally {
      loading.value = false
    }
  }

  async function triggerDigest(scope: string = 'global') {
    const res = await triggerDigestApi(scope)
    return res.data.code === 0
  }

  async function fetchCrossProject() {
    const res = await getCrossProjectDashboardApi()
    if (res.data.code === 0 && res.data.data) {
      crossProjectData.value = res.data.data
    }
  }

  async function fetchCostSummary(month?: string) {
    const res = await getCopilotCostSummaryApi(month)
    if (res.data.code === 0 && res.data.data) {
      costSummary.value = res.data.data
    }
  }

  return {
    data,
    loading,
    lastFetchedAt,
    crossProjectData,
    costSummary,
    fetch,
    triggerDigest,
    fetchCrossProject,
    fetchCostSummary,
  }
})
