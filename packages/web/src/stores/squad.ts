import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listSquadsApi,
  createSquadApi,
  getSquadApi,
  updateSquadApi,
  deleteSquadApi,
} from '@/api/squad'
import type { SquadItem } from '@/api/org'

export const useSquadStore = defineStore('squad', () => {
  const squads = ref<SquadItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const currentSquad = ref<SquadItem | null>(null)

  async function fetchSquads(params?: {
    page?: number
    pageSize?: number
    projectId?: string
  }) {
    loading.value = true
    try {
      const res = await listSquadsApi(params)
      const data = res.data.data!
      squads.value = data.items
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  async function createSquad(data: {
    name: string
    projectId: string
    architectId: string
    engineerId: string
  }) {
    const res = await createSquadApi(data)
    const squad = res.data.data!
    squads.value.unshift(squad)
    total.value++
    return squad
  }

  async function fetchSquad(id: string) {
    const res = await getSquadApi(id)
    currentSquad.value = res.data.data!
    return currentSquad.value
  }

  async function updateSquad(
    id: string,
    data: {
      name?: string
      architectId?: string
      engineerId?: string
    },
  ) {
    const res = await updateSquadApi(id, data)
    const updated = res.data.data!
    const idx = squads.value.findIndex((s) => s.id === id)
    if (idx !== -1) {
      squads.value[idx] = updated
    }
    return updated
  }

  async function deleteSquad(id: string) {
    await deleteSquadApi(id)
    squads.value = squads.value.filter((s) => s.id !== id)
    total.value--
  }

  return {
    squads,
    total,
    loading,
    currentSquad,
    fetchSquads,
    createSquad,
    fetchSquad,
    updateSquad,
    deleteSquad,
  }
})
