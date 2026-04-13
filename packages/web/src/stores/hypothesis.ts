import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listHypothesesApi,
  createHypothesisApi,
  getHypothesisDetailApi,
  updateHypothesisApi,
  deleteHypothesisApi,
  closeHypothesisApi,
  updateIceScoringApi,
  updateRiceScoringApi,
  getHypothesisTreeApi,
  listVariantsApi,
  createVariantApi,
  updateVariantResultsApi,
  markVariantWinnerApi,
  createIterationForHypothesisApi,
  type HypothesisBrief,
  type HypothesisDetail,
  type HypothesisTreeResponse,
  type CreateHypothesisRequest,
  type UpdateHypothesisRequest,
  type CloseHypothesisRequest,
  type ListHypothesisParams,
  type HypothesisVariant,
  type VariantStatus,
  type CreateIterationFromHypothesisRequest,
} from '@/api/hypothesis'

export const useHypothesisStore = defineStore('hypothesis', () => {
  const list = ref<HypothesisBrief[]>([])
  const total = ref(0)
  const loading = ref(false)
  const currentDetail = ref<HypothesisDetail | null>(null)
  const currentTree = ref<HypothesisTreeResponse | null>(null)

  async function fetchList(params?: ListHypothesisParams) {
    loading.value = true
    try {
      const res = await listHypothesesApi(params)
      if (res.data.code === 0 && res.data.data) {
        list.value = res.data.data.items
        total.value = res.data.data.total
      }
    } finally {
      loading.value = false
    }
  }

  async function create(data: CreateHypothesisRequest) {
    const res = await createHypothesisApi(data)
    if (res.data.code === 0 && res.data.data) {
      list.value.unshift(res.data.data)
      total.value += 1
      return res.data.data
    }
    return null
  }

  async function fetchDetail(id: string) {
    loading.value = true
    try {
      const res = await getHypothesisDetailApi(id)
      if (res.data.code === 0 && res.data.data) {
        currentDetail.value = res.data.data
        return res.data.data
      }
    } finally {
      loading.value = false
    }
    return null
  }

  async function update(id: string, data: UpdateHypothesisRequest) {
    const res = await updateHypothesisApi(id, data)
    if (res.data.code === 0 && res.data.data) {
      // refresh list item
      const idx = list.value.findIndex((h) => h.id === id)
      if (idx !== -1) list.value[idx] = res.data.data
      if (currentDetail.value?.id === id) {
        Object.assign(currentDetail.value, res.data.data)
      }
      return res.data.data
    }
    return null
  }

  async function remove(id: string) {
    const res = await deleteHypothesisApi(id)
    if (res.data.code === 0) {
      list.value = list.value.filter((h) => h.id !== id)
      total.value -= 1
      if (currentDetail.value?.id === id) currentDetail.value = null
    }
  }

  async function close(id: string, data: CloseHypothesisRequest) {
    const res = await closeHypothesisApi(id, data)
    if (res.data.code === 0 && res.data.data) {
      // refresh detail to reflect status change
      await fetchDetail(id)
      return res.data.data
    }
    return null
  }

  async function updateIce(
    id: string,
    data: { iceImpact: number; iceConfidence: number; iceEase: number },
  ) {
    const res = await updateIceScoringApi(id, data)
    if (res.data.code === 0 && res.data.data) {
      const idx = list.value.findIndex((h) => h.id === id)
      if (idx !== -1) list.value[idx] = res.data.data
      if (currentDetail.value?.id === id) {
        Object.assign(currentDetail.value, res.data.data)
      }
      return res.data.data
    }
    return null
  }

  async function updateRice(
    id: string,
    data: {
      riceReach: number
      riceImpact: number
      riceConfidence: number
      riceEffort: number
    },
  ) {
    const res = await updateRiceScoringApi(id, data)
    if (res.data.code === 0 && res.data.data) {
      const idx = list.value.findIndex((h) => h.id === id)
      if (idx !== -1) list.value[idx] = res.data.data
      if (currentDetail.value?.id === id) {
        Object.assign(currentDetail.value, res.data.data)
      }
      return res.data.data
    }
    return null
  }

  async function fetchTree(id: string) {
    const res = await getHypothesisTreeApi(id)
    if (res.data.code === 0 && res.data.data) {
      currentTree.value = res.data.data
      return res.data.data
    }
    return null
  }

  // ============ Variants ============

  async function fetchVariants(hypothesisId: string) {
    const res = await listVariantsApi(hypothesisId)
    if (res.data.code === 0 && res.data.data) {
      if (currentDetail.value?.id === hypothesisId) {
        currentDetail.value.variants = res.data.data
      }
      return res.data.data
    }
    return []
  }

  async function createVariant(
    hypothesisId: string,
    data: { name: string; description?: string; type?: VariantStatus },
  ): Promise<HypothesisVariant | null> {
    const res = await createVariantApi(hypothesisId, data)
    if (res.data.code === 0 && res.data.data) {
      if (currentDetail.value?.id === hypothesisId) {
        currentDetail.value.variants.push(res.data.data)
      }
      return res.data.data
    }
    return null
  }

  async function updateVariantResults(
    hypothesisId: string,
    variantId: string,
    data: {
      sampleSize?: number
      conversionCount?: number
      metricValue?: number
      metricUnit?: string
    },
  ) {
    const res = await updateVariantResultsApi(hypothesisId, variantId, data)
    if (res.data.code === 0 && res.data.data) {
      if (currentDetail.value?.id === hypothesisId) {
        currentDetail.value.variants = res.data.data.variants
      }
      return res.data.data.variants
    }
    return []
  }

  async function markWinner(hypothesisId: string, variantId: string, force = false) {
    const res = await markVariantWinnerApi(hypothesisId, variantId, force)
    if (res.data.code === 0) {
      await fetchVariants(hypothesisId)
      return true
    }
    return false
  }

  // Phase B.3: Create iteration from hypothesis
  async function createIterationForHypothesis(
    hypothesisId: string,
    data: CreateIterationFromHypothesisRequest,
  ) {
    const res = await createIterationForHypothesisApi(hypothesisId, data)
    if (res.data.code === 0 && res.data.data) {
      // refresh detail to pick up new iteration in list
      if (currentDetail.value?.id === hypothesisId) {
        await fetchDetail(hypothesisId)
      }
      return res.data.data
    }
    return null
  }

  // ============ Computed helpers ============

  const backlogList = computed(() => list.value.filter((h) => h.status === 'BACKLOG'))
  const runningList = computed(() => list.value.filter((h) => h.status === 'RUNNING'))
  const closedList = computed(() =>
    list.value.filter((h) =>
      ['CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_FLAT'].includes(h.status),
    ),
  )

  function reset() {
    list.value = []
    total.value = 0
    currentDetail.value = null
    currentTree.value = null
  }

  return {
    list,
    total,
    loading,
    currentDetail,
    currentTree,
    backlogList,
    runningList,
    closedList,
    fetchList,
    create,
    fetchDetail,
    update,
    remove,
    close,
    updateIce,
    updateRice,
    fetchTree,
    fetchVariants,
    createVariant,
    updateVariantResults,
    markWinner,
    createIterationForHypothesis,
    reset,
  }
})
