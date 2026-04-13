import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listSopProjectsApi,
  createSopProjectApi,
  getSopProjectApi,
  updateSopProjectApi,
  deleteSopProjectApi,
  createSopDocumentApi,
  updateSopDocumentApi,
  deleteSopDocumentApi,
  addPromptToSopDocApi,
  updateSopPromptRefApi,
  reorderSopPromptsApi,
  removeSopPromptRefApi,
  getDocumentVersionsApi,
  getDocumentDiffApi,
} from '@/api/sop'
import type {
  SopProjectItem,
  SopProjectDetail,
  SopVersionItem,
  SopDiffResult,
} from '@/api/sop'

export const useSopStore = defineStore('sop', () => {
  // State
  const projects = ref<SopProjectItem[]>([])
  const total = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const currentProject = ref<SopProjectDetail | null>(null)
  const documentVersions = ref<SopVersionItem[]>([])
  const documentDiff = ref<SopDiffResult | null>(null)

  // Actions
  async function fetchProjects(params?: {
    page?: number
    pageSize?: number
    keyword?: string
    visibility?: 'private' | 'team' | 'public'
  }) {
    loading.value = true
    try {
      const res = await listSopProjectsApi({
        page: params?.page ?? currentPage.value,
        pageSize: params?.pageSize ?? pageSize.value,
        keyword: params?.keyword,
        visibility: params?.visibility,
      })
      const data = res.data.data!
      projects.value = data.items
      total.value = data.total
      currentPage.value = data.page
      pageSize.value = data.pageSize
    } finally {
      loading.value = false
    }
  }

  async function createProject(data: {
    name: string
    description?: string
    visibility?: 'private' | 'team' | 'public'
  }) {
    const res = await createSopProjectApi(data)
    return res.data.data!
  }

  async function fetchProject(id: string) {
    loading.value = true
    try {
      const res = await getSopProjectApi(id)
      currentProject.value = res.data.data!
      return currentProject.value
    } finally {
      loading.value = false
    }
  }

  async function updateProject(
    id: string,
    data: {
      name?: string
      description?: string
      visibility?: 'private' | 'team' | 'public'
      version?: string
    },
  ) {
    const res = await updateSopProjectApi(id, data)
    return res.data.data!
  }

  async function deleteProject(id: string) {
    await deleteSopProjectApi(id)
    projects.value = projects.value.filter((p) => p.id !== id)
    total.value = Math.max(0, total.value - 1)
  }

  async function createDocument(
    sopProjectId: string,
    data: {
      layer: string
      title: string
      description?: string
      tags?: string[]
      promptIds?: string[]
    },
  ) {
    const res = await createSopDocumentApi(sopProjectId, data)
    const doc = res.data.data!
    if (currentProject.value && currentProject.value.id === sopProjectId) {
      currentProject.value.documents.push(doc)
    }
    return doc
  }

  async function updateDocument(
    docId: string,
    data: {
      title?: string
      description?: string
      tags?: string[]
    },
  ) {
    const res = await updateSopDocumentApi(docId, data)
    const updated = res.data.data!
    if (currentProject.value) {
      const idx = currentProject.value.documents.findIndex((d) => d.id === docId)
      if (idx !== -1) {
        currentProject.value.documents[idx] = updated
      }
    }
    return updated
  }

  async function deleteDocument(docId: string) {
    await deleteSopDocumentApi(docId)
    if (currentProject.value) {
      currentProject.value.documents = currentProject.value.documents.filter((d) => d.id !== docId)
    }
  }

  // ========== Prompt reference management (Req 7) ==========

  async function addPromptToDocument(
    docId: string,
    data: { promptId: string; note?: string | null },
  ) {
    const res = await addPromptToSopDocApi(docId, data)
    const ref = res.data.data!
    // 同步到 currentProject
    if (currentProject.value) {
      const doc = currentProject.value.documents.find((d) => d.id === docId)
      if (doc) {
        doc.prompts.push(ref)
        doc.prompts.sort((a, b) => a.sortOrder - b.sortOrder)
      }
    }
    return ref
  }

  async function updatePromptRef(
    docId: string,
    refId: string,
    data: { sortOrder?: number; note?: string | null },
  ) {
    const res = await updateSopPromptRefApi(docId, refId, data)
    const updated = res.data.data!
    if (currentProject.value) {
      const doc = currentProject.value.documents.find((d) => d.id === docId)
      if (doc) {
        const idx = doc.prompts.findIndex((p) => p.id === refId)
        if (idx !== -1) {
          doc.prompts[idx] = updated
          doc.prompts.sort((a, b) => a.sortOrder - b.sortOrder)
        }
      }
    }
    return updated
  }

  async function reorderPrompts(docId: string, orderedRefIds: string[]) {
    await reorderSopPromptsApi(docId, orderedRefIds)
    if (currentProject.value) {
      const doc = currentProject.value.documents.find((d) => d.id === docId)
      if (doc) {
        const idOrder = new Map(orderedRefIds.map((id, idx) => [id, idx]))
        doc.prompts = doc.prompts
          .map((p) => ({ ...p, sortOrder: idOrder.get(p.id) ?? p.sortOrder }))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      }
    }
  }

  async function removePromptRef(docId: string, refId: string) {
    await removeSopPromptRefApi(docId, refId)
    if (currentProject.value) {
      const doc = currentProject.value.documents.find((d) => d.id === docId)
      if (doc) {
        doc.prompts = doc.prompts.filter((p) => p.id !== refId)
      }
    }
  }

  async function fetchDocumentVersions(docId: string) {
    const res = await getDocumentVersionsApi(docId)
    documentVersions.value = res.data.data!
    return documentVersions.value
  }

  async function fetchDocumentDiff(docId: string, oldVersion: number, newVersion: number) {
    const res = await getDocumentDiffApi(docId, oldVersion, newVersion)
    documentDiff.value = res.data.data!
    return documentDiff.value
  }

  return {
    projects,
    total,
    currentPage,
    pageSize,
    loading,
    currentProject,
    documentVersions,
    documentDiff,
    fetchProjects,
    createProject,
    fetchProject,
    updateProject,
    deleteProject,
    createDocument,
    updateDocument,
    deleteDocument,
    addPromptToDocument,
    updatePromptRef,
    reorderPrompts,
    removePromptRef,
    fetchDocumentVersions,
    fetchDocumentDiff,
  }
})
