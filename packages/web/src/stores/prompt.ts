import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  listPromptsApi,
  getPromptDetailApi,
  createPromptApi,
  updatePromptApi,
  deletePromptApi,
  toggleStarApi,
  forkPromptApi,
  getVersionHistoryApi,
  listPrsApi,
  createPrApi,
  reviewPrApi,
  getPrDetailApi,
} from '@/api/prompt'
import type { PromptItem, PromptVersion, PromptPrItem } from '@/api/prompt'

export const usePromptStore = defineStore('prompt', () => {
  // List state
  const prompts = ref<PromptItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const listParams = reactive({
    page: 1,
    pageSize: 20,
    keyword: '',
    category: '',
    sort: 'recent' as string,
    visibility: '',
    tags: '',
  })

  // Detail state
  const currentPrompt = ref<PromptItem | null>(null)
  const detailLoading = ref(false)

  // Version history
  const versions = ref<PromptVersion[]>([])
  const versionsLoading = ref(false)

  // PRs
  const prs = ref<PromptPrItem[]>([])
  const prsLoading = ref(false)
  const currentPr = ref<PromptPrItem | null>(null)

  // ========== List ==========

  async function fetchPrompts() {
    loading.value = true
    try {
      const res = await listPromptsApi({
        page: listParams.page,
        pageSize: listParams.pageSize,
        keyword: listParams.keyword || undefined,
        category: listParams.category || undefined,
        sort: listParams.sort || undefined,
        visibility: listParams.visibility || undefined,
        tags: listParams.tags || undefined,
      })
      const data = res.data.data!
      prompts.value = data.items
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  // ========== Detail ==========

  async function fetchPromptDetail(id: string) {
    detailLoading.value = true
    try {
      const res = await getPromptDetailApi(id)
      currentPrompt.value = res.data.data!
    } finally {
      detailLoading.value = false
    }
  }

  // ========== Create ==========

  async function createPrompt(data: {
    name: string
    description?: string
    category: string
    tags?: string[]
    content: string
    visibility?: string
    dependsOn?: string[]
    requiredSopLayers?: string[]
  }) {
    const res = await createPromptApi(data)
    return res.data.data!
  }

  // ========== Update ==========

  async function updatePrompt(
    id: string,
    data: {
      name?: string
      description?: string
      category?: string
      tags?: string[]
      content?: string
      dependsOn?: string[]
    },
  ) {
    const res = await updatePromptApi(id, data)
    currentPrompt.value = res.data.data!
    return res.data.data!
  }

  // ========== Delete ==========

  async function deletePrompt(id: string) {
    await deletePromptApi(id)
  }

  // ========== Star ==========

  async function toggleStar(id: string) {
    const res = await toggleStarApi(id)
    const result = res.data.data!

    // Update in list
    const item = prompts.value.find((p) => p.id === id)
    if (item) {
      item.isStarred = result.starred
      item.starCount = result.starCount
    }

    // Update in detail
    if (currentPrompt.value?.id === id) {
      currentPrompt.value.isStarred = result.starred
      currentPrompt.value.starCount = result.starCount
    }

    return result
  }

  // ========== Fork ==========

  async function forkPrompt(id: string, name?: string) {
    const res = await forkPromptApi(id, name)
    // Increment fork count in list
    const item = prompts.value.find((p) => p.id === id)
    if (item) {
      item.forkCount++
    }
    if (currentPrompt.value?.id === id) {
      currentPrompt.value.forkCount++
    }
    return res.data.data!
  }

  // ========== Versions ==========

  async function fetchVersions(promptId: string) {
    versionsLoading.value = true
    try {
      const res = await getVersionHistoryApi(promptId)
      versions.value = res.data.data!
    } finally {
      versionsLoading.value = false
    }
  }

  // ========== PRs ==========

  async function fetchPrs(promptId: string) {
    prsLoading.value = true
    try {
      const res = await listPrsApi(promptId)
      prs.value = res.data.data!
    } finally {
      prsLoading.value = false
    }
  }

  async function submitPr(
    promptId: string,
    data: { title: string; description: string; newContent: string },
  ) {
    const res = await createPrApi(promptId, data)
    return res.data.data!
  }

  async function reviewPr(
    prId: string,
    data: { action: 'merge' | 'reject'; comment?: string },
  ) {
    const res = await reviewPrApi(prId, data)
    return res.data.data!
  }

  async function fetchPrDetail(prId: string) {
    const res = await getPrDetailApi(prId)
    currentPr.value = res.data.data!
    return res.data.data!
  }

  return {
    // State
    prompts,
    total,
    loading,
    listParams,
    currentPrompt,
    detailLoading,
    versions,
    versionsLoading,
    prs,
    prsLoading,
    currentPr,
    // Actions
    fetchPrompts,
    fetchPromptDetail,
    createPrompt,
    updatePrompt,
    deletePrompt,
    toggleStar,
    forkPrompt,
    fetchVersions,
    fetchPrs,
    submitPr,
    reviewPr,
    fetchPrDetail,
  }
})
