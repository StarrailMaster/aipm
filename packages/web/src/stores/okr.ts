import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listObjectivesApi,
  createObjectiveApi,
  updateObjectiveApi,
  deleteObjectiveApi,
  createKeyResultApi,
  updateKeyResultApi,
  deleteKeyResultApi,
  recordIterationApi,
  getIterationHistoryApi,
} from '@/api/okr'
import type {
  ObjectiveItem,
  KeyResultItem,
  IterationRecordItem,
} from '@/api/okr'

export const useOkrStore = defineStore('okr', () => {
  // State
  const objectives = ref<ObjectiveItem[]>([])
  const loading = ref(false)
  const selectedProjectId = ref<string>('')

  // ========== List Objectives ==========

  async function fetchObjectives(projectId: string) {
    loading.value = true
    selectedProjectId.value = projectId
    try {
      const res = await listObjectivesApi({ projectId })
      objectives.value = res.data.data!
    } finally {
      loading.value = false
    }
  }

  // ========== Create Objective ==========

  async function createObjective(data: {
    projectId: string
    name: string
    description?: string
    squadId?: string
  }) {
    const res = await createObjectiveApi(data)
    const created = res.data.data!
    objectives.value.unshift(created)
    return created
  }

  // ========== Update Objective ==========

  async function updateObjective(
    id: string,
    data: {
      name?: string
      description?: string
      squadId?: string
    },
  ) {
    const res = await updateObjectiveApi(id, data)
    const updated = res.data.data!
    const idx = objectives.value.findIndex((o) => o.id === id)
    if (idx !== -1) {
      // Preserve existing keyResults since update response may not include them
      updated.keyResults = objectives.value[idx].keyResults
      objectives.value[idx] = updated
    }
    return updated
  }

  // ========== Delete Objective ==========

  async function deleteObjective(id: string) {
    await deleteObjectiveApi(id)
    objectives.value = objectives.value.filter((o) => o.id !== id)
  }

  // ========== Create Key Result ==========

  async function createKeyResult(data: {
    objectiveId: string
    name: string
    targetValue: number
    unit: string
  }) {
    const res = await createKeyResultApi(data)
    const created = res.data.data!
    // Add to the parent objective
    const obj = objectives.value.find((o) => o.id === data.objectiveId)
    if (obj) {
      obj.keyResults.push(created)
    }
    return created
  }

  // ========== Update Key Result ==========

  async function updateKeyResult(
    id: string,
    data: {
      name?: string
      targetValue?: number
      unit?: string
    },
  ) {
    const res = await updateKeyResultApi(id, data)
    const updated = res.data.data!
    // Update in parent objective
    for (const obj of objectives.value) {
      const krIdx = obj.keyResults.findIndex((kr) => kr.id === id)
      if (krIdx !== -1) {
        // Preserve iterations
        updated.iterations = obj.keyResults[krIdx].iterations
        obj.keyResults[krIdx] = updated
        break
      }
    }
    return updated
  }

  // ========== Delete Key Result ==========

  async function deleteKeyResult(id: string) {
    await deleteKeyResultApi(id)
    for (const obj of objectives.value) {
      obj.keyResults = obj.keyResults.filter((kr) => kr.id !== id)
    }
  }

  // ========== Record Iteration ==========

  async function recordIteration(
    keyResultId: string,
    data: {
      changes: string
      dataFeedback: number
    },
  ) {
    const res = await recordIterationApi(keyResultId, data)
    const record = res.data.data!
    // Update key result's currentValue and add iteration
    for (const obj of objectives.value) {
      const kr = obj.keyResults.find((k) => k.id === keyResultId)
      if (kr) {
        kr.currentValue = data.dataFeedback
        kr.status = data.dataFeedback >= kr.targetValue ? 'achieved' : 'not_achieved'
        kr.iterations.unshift(record)
        break
      }
    }
    return record
  }

  // ========== Get Iteration History ==========

  async function fetchIterationHistory(keyResultId: string) {
    const res = await getIterationHistoryApi(keyResultId)
    const iterations = res.data.data!
    // Update in store
    for (const obj of objectives.value) {
      const kr = obj.keyResults.find((k) => k.id === keyResultId)
      if (kr) {
        kr.iterations = iterations
        break
      }
    }
    return iterations
  }

  return {
    // State
    objectives,
    loading,
    selectedProjectId,
    // Actions
    fetchObjectives,
    createObjective,
    updateObjective,
    deleteObjective,
    createKeyResult,
    updateKeyResult,
    deleteKeyResult,
    recordIteration,
    fetchIterationHistory,
  }
})
