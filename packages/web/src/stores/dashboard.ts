import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getDashboardApi, getPmMetricsApi } from '@/api/dashboard'
import type {
  CompanyDashboardData,
  ProjectOverviewItem,
  OkrSnapshotItem,
  PmMetrics,
} from '@/api/dashboard'

export const useDashboardStore = defineStore('dashboard', () => {
  // Dashboard data
  const dashboardData = ref<CompanyDashboardData | null>(null)
  const loading = ref(false)

  // Drill-down state
  const selectedProjectId = ref<string>('')
  const selectedMonth = ref<string>('')

  // Derived
  const projects = ref<ProjectOverviewItem[]>([])
  const okrSnapshot = ref<OkrSnapshotItem[]>([])

  // ========== PM Metrics（Req 5 团队效能看板） ==========
  const pmMetrics = ref<PmMetrics | null>(null)
  const pmMetricsLoading = ref(false)

  // ========== Fetch Dashboard ==========

  async function fetchDashboard() {
    loading.value = true
    try {
      const params: { projectId?: string; month?: string } = {}
      if (selectedProjectId.value) {
        params.projectId = selectedProjectId.value
      }
      if (selectedMonth.value) {
        params.month = selectedMonth.value
      }

      const res = await getDashboardApi(params)
      dashboardData.value = res.data.data!
      projects.value = dashboardData.value.projects
      okrSnapshot.value = dashboardData.value.okrSnapshot
    } finally {
      loading.value = false
    }
  }

  // ========== Fetch PM Metrics ==========

  async function fetchPmMetrics(params?: {
    projectId?: string
    days?: number
    userId?: string
  }) {
    pmMetricsLoading.value = true
    try {
      const res = await getPmMetricsApi(params)
      if (res.data.code === 0 && res.data.data) {
        pmMetrics.value = res.data.data
      }
    } finally {
      pmMetricsLoading.value = false
    }
  }

  // ========== Drill Down ==========

  function selectProject(projectId: string) {
    selectedProjectId.value = projectId
  }

  function clearProjectSelection() {
    selectedProjectId.value = ''
  }

  function setMonth(month: string) {
    selectedMonth.value = month
  }

  return {
    // State
    dashboardData,
    loading,
    selectedProjectId,
    selectedMonth,
    projects,
    okrSnapshot,
    pmMetrics,
    pmMetricsLoading,
    // Actions
    fetchDashboard,
    fetchPmMetrics,
    selectProject,
    clearProjectSelection,
    setMonth,
  }
})
