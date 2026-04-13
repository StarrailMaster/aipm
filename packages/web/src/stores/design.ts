import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listDesignsApi,
  createDesignDraftApi,
  getDesignDraftApi,
  updateDesignDraftApi,
  deleteDesignDraftApi,
  changeDesignStatusApi,
  lockDesignApi,
  unlockDesignApi,
  getDesignHistoryApi,
  completeDesignApi,
  confirmDesignApi,
} from '@/api/design'
import type {
  DesignDraftItem,
  DesignHistoryItem,
  DesignStatusType,
  DesignSourceTypeType,
} from '@/api/design'

export const useDesignStore = defineStore('design', () => {
  // State
  const designs = ref<DesignDraftItem[]>([])
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(200) // Large page for kanban view
  const loading = ref(false)
  const currentDesign = ref<DesignDraftItem | null>(null)
  const currentHistory = ref<DesignHistoryItem[]>([])

  // 当前激活的来源过滤（Phase 5.1 新增）
  const activeSourceType = ref<'' | DesignSourceTypeType>('')

  // Computed: grouped by status for kanban
  const designsByStatus = computed(() => {
    const grouped: Record<DesignStatusType, DesignDraftItem[]> = {
      AI_GENERATED: [],
      PENDING_REFINE: [],
      REFINING: [],
      PENDING_CONFIRM: [],
      CONFIRMED: [],
      LOCKED: [],
    }
    for (const d of designs.value) {
      if (grouped[d.status]) {
        grouped[d.status].push(d)
      }
    }
    return grouped
  })

  // Actions
  async function fetchDesigns(params?: {
    page?: number
    pageSize?: number
    iterationId?: string
    status?: string
    sourceType?: DesignSourceTypeType
  }) {
    loading.value = true
    try {
      const res = await listDesignsApi({
        page: params?.page ?? currentPage.value,
        pageSize: params?.pageSize ?? pageSize.value,
        iterationId: params?.iterationId,
        status: params?.status,
        sourceType: params?.sourceType ?? (activeSourceType.value || undefined),
      })
      const data = res.data.data!
      designs.value = data.items
      total.value = data.total
      currentPage.value = data.page
    } finally {
      loading.value = false
    }
  }

  function setSourceType(source: '' | DesignSourceTypeType) {
    activeSourceType.value = source
  }

  async function createDesign(data: {
    iterationId: string
    name: string
    assigneeId: string // 必填：手动添加任务必须指派给设计师
    figmaUrl?: string
  }) {
    const res = await createDesignDraftApi(data)
    const created = res.data.data!
    designs.value.unshift(created)
    total.value += 1
    return created
  }

  /** 设计师完成手动任务 → PENDING_CONFIRM */
  async function completeDesign(id: string) {
    const res = await completeDesignApi(id)
    const updated = res.data.data!
    const idx = designs.value.findIndex((d) => d.id === id)
    if (idx !== -1) designs.value[idx] = updated
    if (currentDesign.value?.id === id) currentDesign.value = updated
    return updated
  }

  /** 创建人确认手动任务 → CONFIRMED */
  async function confirmDesign(id: string) {
    const res = await confirmDesignApi(id)
    const updated = res.data.data!
    const idx = designs.value.findIndex((d) => d.id === id)
    if (idx !== -1) designs.value[idx] = updated
    if (currentDesign.value?.id === id) currentDesign.value = updated
    return updated
  }

  async function fetchDesign(id: string) {
    loading.value = true
    try {
      const res = await getDesignDraftApi(id)
      currentDesign.value = res.data.data!
      return currentDesign.value
    } finally {
      loading.value = false
    }
  }

  async function updateDesign(
    id: string,
    data: {
      name?: string
      figmaUrl?: string
      assigneeId?: string
      changeLog?: string
    },
  ) {
    const res = await updateDesignDraftApi(id, data)
    const updated = res.data.data!
    // Update in list
    const idx = designs.value.findIndex((d) => d.id === id)
    if (idx !== -1) {
      designs.value[idx] = updated
    }
    if (currentDesign.value?.id === id) {
      currentDesign.value = updated
    }
    return updated
  }

  async function deleteDesign(id: string) {
    await deleteDesignDraftApi(id)
    designs.value = designs.value.filter((d) => d.id !== id)
    total.value = Math.max(0, total.value - 1)
    if (currentDesign.value?.id === id) {
      currentDesign.value = null
    }
  }

  async function changeStatus(id: string, status: DesignStatusType, changeLog?: string) {
    const res = await changeDesignStatusApi(id, { status, changeLog })
    const updated = res.data.data!
    const idx = designs.value.findIndex((d) => d.id === id)
    if (idx !== -1) {
      designs.value[idx] = updated
    }
    if (currentDesign.value?.id === id) {
      currentDesign.value = updated
    }
    return updated
  }

  async function lockDesign(id: string) {
    const res = await lockDesignApi(id)
    const updated = res.data.data!
    const idx = designs.value.findIndex((d) => d.id === id)
    if (idx !== -1) {
      designs.value[idx] = updated
    }
    if (currentDesign.value?.id === id) {
      currentDesign.value = updated
    }
    return updated
  }

  async function unlockDesign(id: string, reason: string) {
    const res = await unlockDesignApi(id, reason)
    const updated = res.data.data!
    const idx = designs.value.findIndex((d) => d.id === id)
    if (idx !== -1) {
      designs.value[idx] = updated
    }
    if (currentDesign.value?.id === id) {
      currentDesign.value = updated
    }
    return updated
  }

  async function fetchHistory(id: string) {
    const res = await getDesignHistoryApi(id)
    currentHistory.value = res.data.data!
    return currentHistory.value
  }

  return {
    designs,
    total,
    currentPage,
    pageSize,
    loading,
    currentDesign,
    currentHistory,
    activeSourceType,
    designsByStatus,
    fetchDesigns,
    setSourceType,
    createDesign,
    completeDesign,
    confirmDesign,
    fetchDesign,
    updateDesign,
    deleteDesign,
    changeStatus,
    lockDesign,
    unlockDesign,
    fetchHistory,
  }
})
