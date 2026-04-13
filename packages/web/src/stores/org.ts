import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listProjectsApi,
  createProjectApi,
  getProjectApi,
  updateProjectApi,
  deleteProjectApi,
  listUsersApi,
  getUserApi,
  updateUserApi,
  updateUserLegacyRolesApi,
} from '@/api/org'
import type { ProjectItem, ProjectDetail, UserProfileItem } from '@/api/org'

export const useOrgStore = defineStore('org', () => {
  // ========== Projects ==========
  const projects = ref<ProjectItem[]>([])
  const projectTotal = ref(0)
  const projectLoading = ref(false)
  const currentProject = ref<ProjectDetail | null>(null)

  async function fetchProjects(params?: {
    page?: number
    pageSize?: number
    /** true = 只拉当前用户可见的项目（owner / 同 squad）。ADMIN 无视此参数 */
    mine?: boolean
  }) {
    projectLoading.value = true
    try {
      const res = await listProjectsApi(params)
      const data = res.data.data!
      projects.value = data.items
      projectTotal.value = data.total
    } finally {
      projectLoading.value = false
    }
  }

  async function createProject(data: {
    name: string
    description?: string
    ownerId?: string
  }) {
    const res = await createProjectApi(data)
    const project = res.data.data!
    projects.value.unshift(project)
    projectTotal.value++
    return project
  }

  async function fetchProject(id: string) {
    const res = await getProjectApi(id)
    currentProject.value = res.data.data!
    return currentProject.value
  }

  async function updateProject(
    id: string,
    data: { name?: string; description?: string; ownerId?: string },
  ) {
    const res = await updateProjectApi(id, data)
    const updated = res.data.data!
    const idx = projects.value.findIndex((p) => p.id === id)
    if (idx !== -1) {
      projects.value[idx] = updated
    }
    return updated
  }

  async function deleteProject(id: string) {
    await deleteProjectApi(id)
    projects.value = projects.value.filter((p) => p.id !== id)
    projectTotal.value--
  }

  // ========== Users ==========
  const users = ref<UserProfileItem[]>([])
  const userTotal = ref(0)
  const userLoading = ref(false)

  async function fetchUsers(params?: {
    page?: number
    pageSize?: number
    keyword?: string
    role?: string
    squadId?: string
    projectId?: string
  }) {
    userLoading.value = true
    try {
      const res = await listUsersApi(params)
      const data = res.data.data!
      users.value = data.items
      userTotal.value = data.total
    } finally {
      userLoading.value = false
    }
  }

  async function fetchUser(id: string) {
    const res = await getUserApi(id)
    return res.data.data!
  }

  async function updateUser(
    id: string,
    data: {
      name?: string
      role?: string
      legacyRoles?: string[]
      squadId?: string | null
    },
  ) {
    const res = await updateUserApi(id, data)
    const updated = res.data.data!
    const idx = users.value.findIndex((u) => u.id === id)
    if (idx !== -1) {
      users.value[idx] = updated
    }
    return updated
  }

  async function updateUserLegacyRoles(id: string, legacyRoles: string[]) {
    const res = await updateUserLegacyRolesApi(id, legacyRoles)
    const updated = res.data.data!
    const idx = users.value.findIndex((u) => u.id === id)
    if (idx !== -1) {
      users.value[idx] = updated
    }
    return updated
  }

  return {
    // Projects
    projects,
    projectTotal,
    projectLoading,
    currentProject,
    fetchProjects,
    createProject,
    fetchProject,
    updateProject,
    deleteProject,
    // Users
    users,
    userTotal,
    userLoading,
    fetchUsers,
    fetchUser,
    updateUser,
    updateUserLegacyRoles,
  }
})
