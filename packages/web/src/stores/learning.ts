import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listLearningsApi,
  getLearningDetailApi,
  createLearningApi,
  updateLearningApi,
  deleteLearningApi,
  type LearningBrief,
  type LearningDetail,
  type CreateLearningRequest,
  type ListLearningParams,
} from '@/api/learning'

export const useLearningStore = defineStore('learning', () => {
  const list = ref<LearningBrief[]>([])
  const total = ref(0)
  const loading = ref(false)
  const currentDetail = ref<LearningDetail | null>(null)

  async function fetchList(params?: ListLearningParams) {
    loading.value = true
    try {
      const res = await listLearningsApi(params)
      if (res.data.code === 0 && res.data.data) {
        list.value = res.data.data.items
        total.value = res.data.data.total
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id: string) {
    loading.value = true
    try {
      const res = await getLearningDetailApi(id)
      if (res.data.code === 0 && res.data.data) {
        currentDetail.value = res.data.data
        return res.data.data
      }
    } finally {
      loading.value = false
    }
    return null
  }

  async function create(data: CreateLearningRequest) {
    const res = await createLearningApi(data)
    if (res.data.code === 0 && res.data.data) {
      list.value.unshift(res.data.data)
      total.value += 1
      return res.data.data
    }
    return null
  }

  async function update(id: string, data: Partial<CreateLearningRequest>) {
    const res = await updateLearningApi(id, data)
    if (res.data.code === 0 && res.data.data) {
      const idx = list.value.findIndex((l) => l.id === id)
      if (idx !== -1) list.value[idx] = res.data.data
      return res.data.data
    }
    return null
  }

  async function remove(id: string) {
    const res = await deleteLearningApi(id)
    if (res.data.code === 0) {
      list.value = list.value.filter((l) => l.id !== id)
      total.value -= 1
    }
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
  }
})
