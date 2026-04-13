import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listTemplatesApi,
  getTemplateApi,
  createTemplateApi,
  updateTemplateApi,
  deleteTemplateApi,
  createHypothesisFromTemplateApi,
  type HypothesisTemplateBrief,
  type HypothesisTemplate,
  type CreateTemplateRequest,
  type ListTemplateParams,
} from '@/api/hypothesis-template'

export const useHypothesisTemplateStore = defineStore('hypothesisTemplate', () => {
  const list = ref<HypothesisTemplateBrief[]>([])
  const total = ref(0)
  const loading = ref(false)
  const currentDetail = ref<HypothesisTemplate | null>(null)

  async function fetchList(params?: ListTemplateParams) {
    loading.value = true
    try {
      const res = await listTemplatesApi(params)
      if (res.data.code === 0 && res.data.data) {
        list.value = res.data.data.items
        total.value = res.data.data.total
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id: string) {
    const res = await getTemplateApi(id)
    if (res.data.code === 0 && res.data.data) {
      currentDetail.value = res.data.data
      return res.data.data
    }
    return null
  }

  async function create(data: CreateTemplateRequest) {
    const res = await createTemplateApi(data)
    if (res.data.code === 0 && res.data.data) {
      await fetchList() // refresh list
      return res.data.data
    }
    return null
  }

  async function update(id: string, data: Partial<CreateTemplateRequest>) {
    const res = await updateTemplateApi(id, data)
    if (res.data.code === 0 && res.data.data) {
      currentDetail.value = res.data.data
      return res.data.data
    }
    return null
  }

  async function remove(id: string) {
    const res = await deleteTemplateApi(id)
    if (res.data.code === 0) {
      list.value = list.value.filter((t) => t.id !== id)
      total.value -= 1
    }
  }

  async function createHypothesisFromTemplate(
    templateId: string,
    data: {
      krId: string
      parentId?: string | null
      placeholderValues: Record<string, string | number>
    },
  ) {
    const res = await createHypothesisFromTemplateApi(templateId, data)
    if (res.data.code === 0) {
      // usageCount 本地 +1
      const idx = list.value.findIndex((t) => t.id === templateId)
      if (idx !== -1) list.value[idx].usageCount += 1
      return res.data.data
    }
    return null
  }

  return {
    list,
    total,
    loading,
    currentDetail,
    fetchList,
    fetchDetail,
    create,
    update,
    remove,
    createHypothesisFromTemplate,
  }
})
