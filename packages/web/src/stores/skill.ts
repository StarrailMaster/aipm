import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  listSkillsApi,
  getSkillDetailApi,
  createSkillApi,
  updateSkillApi,
  deleteSkillApi,
  toggleSkillStarApi,
  forkSkillApi,
} from '@/api/skill'
import type { SkillItem } from '@/api/skill'

export const useSkillStore = defineStore('skill', () => {
  // List state
  const skills = ref<SkillItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const listParams = reactive({
    page: 1,
    pageSize: 20,
    keyword: '',
    category: '',
    sort: 'recent' as string,
  })

  // Detail state
  const currentSkill = ref<SkillItem | null>(null)
  const detailLoading = ref(false)

  // ========== List ==========

  async function fetchSkills() {
    loading.value = true
    try {
      const res = await listSkillsApi({
        page: listParams.page,
        pageSize: listParams.pageSize,
        keyword: listParams.keyword || undefined,
        category: listParams.category || undefined,
        sort: listParams.sort || undefined,
      })
      const data = res.data.data!
      skills.value = data.items
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  // ========== Detail ==========

  async function fetchSkillDetail(id: string) {
    detailLoading.value = true
    try {
      const res = await getSkillDetailApi(id)
      currentSkill.value = res.data.data!
    } finally {
      detailLoading.value = false
    }
  }

  // ========== Create ==========

  async function createSkill(data: {
    name: string
    description?: string
    category: string
    tags?: string[]
    content: string
    gitRepoUrl?: string
    visibility?: string
  }) {
    const res = await createSkillApi(data)
    return res.data.data!
  }

  // ========== Update ==========

  async function updateSkill(
    id: string,
    data: {
      name?: string
      description?: string
      category?: string
      tags?: string[]
      content?: string
      gitRepoUrl?: string
    },
  ) {
    const res = await updateSkillApi(id, data)
    currentSkill.value = res.data.data!
    return res.data.data!
  }

  // ========== Delete ==========

  async function deleteSkill(id: string) {
    await deleteSkillApi(id)
  }

  // ========== Star ==========

  async function toggleStar(id: string) {
    const res = await toggleSkillStarApi(id)
    const result = res.data.data!

    const item = skills.value.find((s) => s.id === id)
    if (item) {
      item.isStarred = result.starred
      item.starCount = result.starCount
    }

    if (currentSkill.value?.id === id) {
      currentSkill.value.isStarred = result.starred
      currentSkill.value.starCount = result.starCount
    }

    return result
  }

  // ========== Fork ==========

  async function forkSkill(id: string, name?: string) {
    const res = await forkSkillApi(id, name)
    const item = skills.value.find((s) => s.id === id)
    if (item) {
      item.forkCount++
    }
    if (currentSkill.value?.id === id) {
      currentSkill.value.forkCount++
    }
    return res.data.data!
  }

  return {
    skills,
    total,
    loading,
    listParams,
    currentSkill,
    detailLoading,
    fetchSkills,
    fetchSkillDetail,
    createSkill,
    updateSkill,
    deleteSkill,
    toggleStar,
    forkSkill,
  }
})
