import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  listFeedsApi,
  getFeedDetailApi,
  createFeedApi,
  updateFeedApi,
  deleteFeedApi,
  addFeedFileApi,
  updateFeedFileApi,
  deleteFeedFileApi,
  updateFeedStatusApi,
  recordExecutionApi,
  assembleFeedApi,
  getFeedGraphApi,
} from '@/api/feed'
import type {
  FeedPackageItem,
  FeedPackageDetail,
  FeedFileItem,
  ExecutionRecordItem,
  AssembledContent,
  DependencyGraph,
} from '@/api/feed'

export const useFeedStore = defineStore('feed', () => {
  // List state
  const feedPackages = ref<FeedPackageItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const listParams = reactive({
    page: 1,
    pageSize: 20,
    iterationId: '',
    phase: '',
    status: '',
  })

  // Detail state
  const currentFeed = ref<FeedPackageDetail | null>(null)
  const detailLoading = ref(false)

  // Graph state
  const graph = ref<DependencyGraph | null>(null)
  const graphLoading = ref(false)

  // ========== List ==========

  async function fetchFeeds() {
    loading.value = true
    try {
      const res = await listFeedsApi({
        page: listParams.page,
        pageSize: listParams.pageSize,
        iterationId: listParams.iterationId || undefined,
        phase: listParams.phase || undefined,
        status: listParams.status || undefined,
      })
      const data = res.data.data!
      feedPackages.value = data.items
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  // ========== Detail ==========

  async function fetchFeedDetail(id: string) {
    detailLoading.value = true
    try {
      const res = await getFeedDetailApi(id)
      currentFeed.value = res.data.data!
    } finally {
      detailLoading.value = false
    }
  }

  // ========== Create ==========

  async function createFeed(data: {
    iterationId: string
    name: string
    phase: string
    promptId?: string
    dependsOn?: string[]
    canParallel?: boolean
  }) {
    const res = await createFeedApi(data)
    return res.data.data!
  }

  // ========== Update ==========

  async function updateFeed(
    id: string,
    data: {
      name?: string
      phase?: string
      promptId?: string
      dependsOn?: string[]
      canParallel?: boolean
      assigneeId?: string
      sortOrder?: number
    },
  ) {
    const res = await updateFeedApi(id, data)
    const updated = res.data.data!
    // Update in list
    const idx = feedPackages.value.findIndex((p) => p.id === id)
    if (idx >= 0) {
      feedPackages.value[idx] = updated
    }
    return updated
  }

  // ========== Delete ==========

  async function deleteFeed(id: string) {
    await deleteFeedApi(id)
    feedPackages.value = feedPackages.value.filter((p) => p.id !== id)
    if (currentFeed.value?.id === id) {
      currentFeed.value = null
    }
  }

  // ========== Files ==========

  async function addFile(feedId: string, data: { name: string; content: string; layer: 'core' | 'context' }) {
    const res = await addFeedFileApi(feedId, data)
    const file = res.data.data!
    // Update in current feed detail
    if (currentFeed.value?.id === feedId) {
      if (file.layer === 'core') {
        currentFeed.value.coreFiles.push(file)
      } else {
        currentFeed.value.contextFiles.push(file)
      }
    }
    return file
  }

  async function updateFile(feedId: string, fileId: string, data: { name?: string; content?: string }) {
    const res = await updateFeedFileApi(feedId, fileId, data)
    const updated = res.data.data!
    if (currentFeed.value?.id === feedId) {
      const targetList = updated.layer === 'core' ? currentFeed.value.coreFiles : currentFeed.value.contextFiles
      const idx = targetList.findIndex((f: FeedFileItem) => f.id === fileId)
      if (idx >= 0) {
        targetList[idx] = updated
      }
    }
    return updated
  }

  async function deleteFile(feedId: string, fileId: string) {
    await deleteFeedFileApi(feedId, fileId)
    if (currentFeed.value?.id === feedId) {
      currentFeed.value.coreFiles = currentFeed.value.coreFiles.filter((f: FeedFileItem) => f.id !== fileId)
      currentFeed.value.contextFiles = currentFeed.value.contextFiles.filter((f: FeedFileItem) => f.id !== fileId)
    }
  }

  // ========== Status ==========

  async function updateStatus(id: string, status: string) {
    const res = await updateFeedStatusApi(id, status)
    const updated = res.data.data!
    // Update in list
    const idx = feedPackages.value.findIndex((p) => p.id === id)
    if (idx >= 0) {
      feedPackages.value[idx] = updated
    }
    // Update in detail
    if (currentFeed.value?.id === id) {
      currentFeed.value.status = updated.status
    }
    return updated
  }

  // ========== Execution ==========

  async function recordExecution(feedId: string, data: { aiTool: string; outputSummary: string; issues?: string }) {
    const res = await recordExecutionApi(feedId, data)
    const record = res.data.data!
    if (currentFeed.value?.id === feedId) {
      currentFeed.value.executions.unshift(record)
    }
    return record
  }

  // ========== Assemble ==========

  async function assembleFeed(id: string): Promise<AssembledContent> {
    const res = await assembleFeedApi(id)
    return res.data.data!
  }

  // ========== Graph ==========

  async function fetchGraph(iterationId: string) {
    graphLoading.value = true
    try {
      const res = await getFeedGraphApi(iterationId)
      graph.value = res.data.data!
    } finally {
      graphLoading.value = false
    }
  }

  return {
    // State
    feedPackages,
    total,
    loading,
    listParams,
    currentFeed,
    detailLoading,
    graph,
    graphLoading,
    // Actions
    fetchFeeds,
    fetchFeedDetail,
    createFeed,
    updateFeed,
    deleteFeed,
    addFile,
    updateFile,
    deleteFile,
    updateStatus,
    recordExecution,
    assembleFeed,
    fetchGraph,
  }
})
