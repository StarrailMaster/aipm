<template>
  <div class="users-tab">
    <div class="tab-toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索用户..."
          clearable
          style="width: 200px"
          @clear="handleSearch"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select
          v-model="filterRole"
          placeholder="按角色筛选"
          clearable
          style="width: 160px"
          @change="handleSearch"
        >
          <el-option label="管理员" value="ADMIN" />
          <el-option label="需求架构师" value="ARCHITECT" />
          <el-option label="实施工程师" value="ENGINEER" />
          <el-option label="设计师" value="DESIGNER" />
        </el-select>
      </div>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        创建用户
      </el-button>
    </div>

    <el-table
      v-loading="orgStore.userLoading"
      :data="orgStore.users"
      stripe
      style="width: 100%"
    >
      <el-table-column label="用户" min-width="200">
        <template #default="{ row }">
          <div class="user-cell">
            <el-avatar :size="32" class="user-avatar">
              {{ row.name.charAt(0) }}
            </el-avatar>
            <div class="user-info">
              <span class="user-name">{{ row.name }}</span>
              <span class="user-email">{{ row.email }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="130">
        <template #default="{ row }">
          <el-tag :type="getRoleBadgeType(row.role)" size="small">
            {{ getRoleLabel(row.role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="原岗位标签" min-width="280">
        <template #default="{ row }">
          <div v-if="row.legacyRoles && row.legacyRoles.length > 0" class="legacy-tags">
            <el-tag
              v-for="tag in row.legacyRoles"
              :key="tag"
              size="small"
              class="legacy-tag"
            >
              {{ tag }}
            </el-tag>
          </div>
          <span v-else class="text-secondary">-</span>
        </template>
      </el-table-column>
      <el-table-column label="所属小组" width="150">
        <template #default="{ row }">
          <span v-if="row.squadName">{{ row.squadName }}</span>
          <span v-else class="text-secondary">未分配</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleEdit(row)">
            编辑
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-if="orgStore.userTotal > pageSize"
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="orgStore.userTotal"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- Create User Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      title="创建用户"
      width="520px"
      @closed="resetCreateForm"
    >
      <el-form ref="createFormRef" :model="createForm" label-width="100px">
        <el-form-item label="姓名" required>
          <el-input
            v-model="createForm.name"
            placeholder="请输入真实姓名"
            maxlength="40"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="邮箱" required>
          <el-input v-model="createForm.email" placeholder="user@example.com" />
        </el-form-item>
        <el-form-item label="初始密码" required>
          <el-input
            v-model="createForm.password"
            type="password"
            show-password
            placeholder="至少 6 位，请告知本人后首次登录后修改"
          />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="createForm.role" style="width: 100%">
            <el-option label="管理员" value="ADMIN" />
            <el-option label="需求架构师" value="ARCHITECT" />
            <el-option label="实施工程师" value="ENGINEER" />
            <el-option label="设计师" value="DESIGNER" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属小组">
          <el-select
            v-model="createForm.squadId"
            clearable
            filterable
            placeholder="可选，先不选也可以"
            style="width: 100%"
          >
            <el-option
              v-for="s in squadOptions"
              :key="s.id"
              :label="`${s.projectName} · ${s.name}`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!canSubmitCreate"
          @click="handleCreate"
        >
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit User Dialog -->
    <el-dialog
      v-model="showEditDialog"
      title="编辑用户"
      width="520px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="formData" label-width="100px">
        <el-form-item label="用户名">
          <span class="readonly-field">{{ editingUser?.name }}</span>
        </el-form-item>
        <el-form-item label="邮箱">
          <span class="readonly-field">{{ editingUser?.email }}</span>
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="formData.role" style="width: 100%">
            <el-option label="管理员" value="ADMIN" />
            <el-option label="需求架构师" value="ARCHITECT" />
            <el-option label="实施工程师" value="ENGINEER" />
            <el-option label="设计师" value="DESIGNER" />
          </el-select>
        </el-form-item>
        <el-form-item label="原岗位标签">
          <div class="legacy-roles-editor">
            <div class="legacy-roles-tags">
              <el-tag
                v-for="tag in formData.legacyRoles"
                :key="tag"
                closable
                @close="removeLegacyRole(tag)"
              >
                {{ tag }}
              </el-tag>
            </div>
            <div class="legacy-roles-input">
              <el-input
                v-model="newLegacyRole"
                placeholder="输入标签后回车"
                size="small"
                style="width: 160px"
                @keyup.enter="addLegacyRole"
              />
              <el-button size="small" @click="addLegacyRole">添加</el-button>
            </div>
            <div class="legacy-roles-presets">
              <span class="presets-label">快捷添加：</span>
              <el-button
                v-for="preset in presetLegacyRoles"
                :key="preset"
                size="small"
                text
                :disabled="formData.legacyRoles.includes(preset)"
                @click="addPresetRole(preset)"
              >
                {{ preset }}
              </el-button>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import type { FormInstance } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useOrgStore } from '@/stores/org'
import type { UserProfileItem } from '@/api/org'
import { createUserApi, listSquadsApi } from '@/api/org'

const orgStore = useOrgStore()

const searchKeyword = ref('')
const filterRole = ref('')
const currentPage = ref(1)
const pageSize = 20
const showEditDialog = ref(false)
const submitting = ref(false)
const editingUser = ref<UserProfileItem | null>(null)
const formRef = ref<FormInstance>()
const newLegacyRole = ref('')

// Create user dialog
const showCreateDialog = ref(false)
const creating = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive({
  name: '',
  email: '',
  password: '',
  role: 'DESIGNER',
  squadId: '' as string | null | '',
})
const squadOptions = ref<Array<{ id: string; name: string; projectName: string }>>([])

const canSubmitCreate = computed(() => {
  return (
    createForm.name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim()) &&
    createForm.password.length >= 6 &&
    createForm.role.length > 0
  )
})

function openCreateDialog() {
  // 懒加载 squad 列表
  if (squadOptions.value.length === 0) {
    listSquadsApi({ pageSize: 100 })
      .then((res) => {
        if (res.data.data) {
          squadOptions.value = res.data.data.items.map((s) => ({
            id: s.id,
            name: s.name,
            projectName: s.projectName ?? '—',
          }))
        }
      })
      .catch(() => {
        /* ignore */
      })
  }
  showCreateDialog.value = true
}

function resetCreateForm() {
  createForm.name = ''
  createForm.email = ''
  createForm.password = ''
  createForm.role = 'DESIGNER'
  createForm.squadId = ''
}

async function handleCreate() {
  if (!canSubmitCreate.value) return
  creating.value = true
  try {
    const res = await createUserApi({
      email: createForm.email.trim(),
      password: createForm.password,
      name: createForm.name.trim(),
      role: createForm.role,
      squadId: createForm.squadId || null,
    })
    if (res.data.code === 0) {
      ElMessage.success('用户已创建，请告知本人初始密码登录后修改')
      showCreateDialog.value = false
      await loadUsers()
    }
  } catch {
    /* handled by interceptor */
  } finally {
    creating.value = false
  }
}

const presetLegacyRoles = [
  '产品经理',
  '前端开发',
  '后端开发',
  'UI设计',
  'UX设计',
  '测试工程师',
  '项目经理',
  '数据分析',
  '运维工程师',
  '技术总监',
]

const formData = reactive({
  role: '',
  legacyRoles: [] as string[],
})

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: '管理员',
    ARCHITECT: '需求架构师',
    ENGINEER: '实施工程师',
    DESIGNER: '设计师',
  }
  return map[role] || role
}

function getRoleBadgeType(role: string): 'success' | 'warning' | 'danger' | 'info' | '' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info' | ''> = {
    ADMIN: 'danger',
    ARCHITECT: 'warning',
    ENGINEER: 'success',
    DESIGNER: 'info',
  }
  return map[role] || ''
}

async function loadUsers() {
  const params: {
    page: number
    pageSize: number
    keyword?: string
    role?: string
  } = {
    page: currentPage.value,
    pageSize,
  }
  if (searchKeyword.value) params.keyword = searchKeyword.value
  if (filterRole.value) params.role = filterRole.value
  await orgStore.fetchUsers(params)
}

function handleSearch() {
  currentPage.value = 1
  loadUsers()
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadUsers()
}

function handleEdit(user: UserProfileItem) {
  editingUser.value = user
  formData.role = user.role
  formData.legacyRoles = [...user.legacyRoles]
  showEditDialog.value = true
}

function resetForm() {
  editingUser.value = null
  formData.role = ''
  formData.legacyRoles = []
  newLegacyRole.value = ''
}

function addLegacyRole() {
  const tag = newLegacyRole.value.trim()
  if (tag && !formData.legacyRoles.includes(tag)) {
    formData.legacyRoles.push(tag)
  }
  newLegacyRole.value = ''
}

function addPresetRole(preset: string) {
  if (!formData.legacyRoles.includes(preset)) {
    formData.legacyRoles.push(preset)
  }
}

function removeLegacyRole(tag: string) {
  formData.legacyRoles = formData.legacyRoles.filter((t) => t !== tag)
}

async function handleSubmit() {
  if (!editingUser.value) return

  submitting.value = true
  try {
    await orgStore.updateUser(editingUser.value.id, {
      role: formData.role,
      legacyRoles: formData.legacyRoles,
    })
    ElMessage.success('用户信息已更新')
    showEditDialog.value = false
  } catch {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.toolbar-left {
  display: flex;
  gap: 12px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-weight: 500;
  color: #303133;
  line-height: 1.4;
}

.user-email {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.legacy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.legacy-tag {
  margin: 0;
}

.text-secondary {
  color: #909399;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.readonly-field {
  color: #606266;
}

.legacy-roles-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.legacy-roles-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.legacy-roles-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.legacy-roles-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
}

.presets-label {
  font-size: 12px;
  color: #909399;
  margin-right: 4px;
}
</style>
