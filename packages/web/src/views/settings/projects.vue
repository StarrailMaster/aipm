<template>
  <div class="projects-tab">
    <div class="tab-toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索项目..."
        clearable
        style="width: 240px"
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        创建项目
      </el-button>
    </div>

    <el-table
      v-loading="orgStore.projectLoading"
      :data="orgStore.projects"
      stripe
      style="width: 100%"
    >
      <el-table-column prop="name" label="项目名称" min-width="180">
        <template #default="{ row }">
          <span class="project-name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="text-secondary">{{ row.description || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="ownerName" label="负责人" width="120" />
      <el-table-column prop="squadCount" label="小组数" width="90" align="center" />
      <el-table-column prop="memberCount" label="成员数" width="90" align="center" />
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleEdit(row)">
            编辑
          </el-button>
          <el-popconfirm
            title="确定删除该项目？"
            confirm-button-text="确定"
            cancel-button-text="取消"
            @confirm="handleDelete(row.id)"
          >
            <template #reference>
              <el-button link type="danger" size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-if="orgStore.projectTotal > pageSize"
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="orgStore.projectTotal"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingProject ? '编辑项目' : '创建项目'"
      width="480px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="80px">
        <el-form-item label="项目名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="项目描述（可选）"
          />
        </el-form-item>
        <el-form-item label="负责人" prop="ownerId">
          <el-select
            v-model="formData.ownerId"
            placeholder="指派项目负责人"
            filterable
            clearable
            :loading="ownerCandidatesLoading"
            style="width: 100%"
          >
            <el-option
              v-for="u in ownerCandidates"
              :key="u.id"
              :label="`${u.name} (${u.email})`"
              :value="u.id"
            >
              <div class="owner-option">
                <span>{{ u.name }}</span>
                <el-tag size="small" :type="roleTagType(u.role)" effect="plain">
                  {{ roleLabel(u.role) }}
                </el-tag>
              </div>
            </el-option>
          </el-select>
          <div class="form-hint">不选时默认为当前登录用户</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ editingProject ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useOrgStore } from '@/stores/org'
import { listUsersApi } from '@/api/org'
import type { ProjectItem, UserProfileItem } from '@/api/org'

const orgStore = useOrgStore()

const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = 20
const showCreateDialog = ref(false)
const submitting = ref(false)
const editingProject = ref<ProjectItem | null>(null)
const formRef = ref<FormInstance>()

const formData = reactive({
  name: '',
  description: '',
  ownerId: '' as string,
})

const formRules: FormRules = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
}

// ========== Owner candidate picker ==========

const ownerCandidates = ref<UserProfileItem[]>([])
const ownerCandidatesLoading = ref(false)

async function loadOwnerCandidates() {
  if (ownerCandidates.value.length > 0) return
  ownerCandidatesLoading.value = true
  try {
    const res = await listUsersApi({ pageSize: 200 })
    ownerCandidates.value = res.data.data?.items ?? []
  } finally {
    ownerCandidatesLoading.value = false
  }
}

// 打开对话框时按需拉取一次候选人
watch(showCreateDialog, (v) => {
  if (v) loadOwnerCandidates()
})

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: '管理员',
    ARCHITECT: '需求架构师',
    ENGINEER: '实施工程师',
    DESIGNER: '设计师',
  }
  return map[role] ?? role
}

function roleTagType(role: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    ADMIN: 'danger',
    ARCHITECT: 'warning',
    ENGINEER: '',
    DESIGNER: 'success',
  }
  return map[role] ?? 'info'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadProjects() {
  await orgStore.fetchProjects({ page: currentPage.value, pageSize })
}

function handleSearch() {
  currentPage.value = 1
  loadProjects()
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadProjects()
}

function handleEdit(project: ProjectItem) {
  editingProject.value = project
  formData.name = project.name
  formData.description = project.description || ''
  formData.ownerId = project.ownerId
  showCreateDialog.value = true
}

async function handleDelete(id: string) {
  try {
    await orgStore.deleteProject(id)
    ElMessage.success('项目已删除')
  } catch {
    // error handled by interceptor
  }
}

function resetForm() {
  editingProject.value = null
  formData.name = ''
  formData.description = ''
  formData.ownerId = ''
  formRef.value?.resetFields()
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (editingProject.value) {
      await orgStore.updateProject(editingProject.value.id, {
        name: formData.name,
        description: formData.description || undefined,
        ownerId: formData.ownerId || undefined,
      })
      ElMessage.success('项目已更新')
    } else {
      await orgStore.createProject({
        name: formData.name,
        description: formData.description || undefined,
        ownerId: formData.ownerId || undefined,
      })
      ElMessage.success('项目已创建')
    }
    showCreateDialog.value = false
    // 刷新列表，让新数据立即显示
    await loadProjects()
  } catch {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadProjects()
})
</script>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.project-name {
  font-weight: 500;
  color: #303133;
}

.text-secondary {
  color: #909399;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.owner-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
</style>
