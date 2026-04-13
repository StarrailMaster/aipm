import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  listFeedbacksApi,
  getFeedbackDetailApi,
  createFeedbackApi,
  deleteFeedbackApi,
} from '@/api/experience'
import type { ExperienceFeedbackItem } from '@/api/experience'

export const useExperienceStore = defineStore('experience', () => {
  // List state
  const feedbacks = ref<ExperienceFeedbackItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const listParams = reactive({
    page: 1,
    pageSize: 20,
    createdBy: '',
    linkedPromptId: '',
  })

  // Detail state
  const currentFeedback = ref<ExperienceFeedbackItem | null>(null)
  const detailLoading = ref(false)

  // ========== List ==========

  async function fetchFeedbacks() {
    loading.value = true
    try {
      const res = await listFeedbacksApi({
        page: listParams.page,
        pageSize: listParams.pageSize,
        createdBy: listParams.createdBy || undefined,
        linkedPromptId: listParams.linkedPromptId || undefined,
      })
      const data = res.data.data!
      feedbacks.value = data.items
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  // ========== Detail ==========

  async function fetchFeedbackDetail(id: string) {
    detailLoading.value = true
    try {
      const res = await getFeedbackDetailApi(id)
      currentFeedback.value = res.data.data!
    } finally {
      detailLoading.value = false
    }
  }

  // ========== Create ==========

  async function createFeedback(data: {
    problemDescription: string
    markdownContent?: string | null
    markdownFileName?: string | null
    linkedPromptId?: string | null
  }) {
    const res = await createFeedbackApi(data)
    const created = res.data.data!
    // Prepend to list
    feedbacks.value.unshift(created)
    total.value += 1
    return created
  }

  // ========== Delete ==========

  async function deleteFeedback(id: string) {
    await deleteFeedbackApi(id)
    feedbacks.value = feedbacks.value.filter((f) => f.id !== id)
    total.value = Math.max(0, total.value - 1)
    if (currentFeedback.value?.id === id) {
      currentFeedback.value = null
    }
  }

  return {
    // State
    feedbacks,
    total,
    loading,
    listParams,
    currentFeedback,
    detailLoading,
    // Actions
    fetchFeedbacks,
    fetchFeedbackDetail,
    createFeedback,
    deleteFeedback,
  }
})
