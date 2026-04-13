<template>
  <div class="squads-tab">
    <div class="tab-toolbar">
      <div class="toolbar-left">
        <el-select
          v-model="filterProjectId"
          placeholder="按项目筛选"
          clearable
          style="width: 200px"
          @change="handleFilterChange"
        >
          <el-option
            v-for="p in orgStore.projects"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </el-select>
      </div>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        创建小组
      </el-button>
    </div>

    <el-table
      v-loading="squadStore.loading"
      :data="squadStore.squads"
      stripe
      style="width: 100%"
    >
      <el-table-column prop="name" label="小组名称" min-width="150">
        <template #default="{ row }">
          <span class="squad-name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="projectName" label="所属项目" width="150" />
      <el-table-column label="需求架构师" min-width="240">
        <template #default="{ row }">
          <div v-if="getArchitect(row)" class="member-cell">
            <span class="member-name">{{ getArchitect(row)!.user.name }}</span>
            <el-tag size="small" type="warning" class="role-badge">需求架构师</el-tag>
            <el-tag
              v-for="tag in getArchitect(row)!.user.legacyRoles"
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
      <el-table-column label="实施工程师" min-width="240">
        <template #default="{ row }">
          <div v-if="getEngineer(row)" class="member-cell">
            <span class="member-name">{{ getEngineer(row)!.user.name }}</span>
            <el-tag size="small" type="success" class="role-badge">实施工程师</el-tag>
            <el-tag
              v-for="tag in getEngineer(row)!.user.legacyRoles"
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
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="handleEdit(row)">
            编辑
          </el-button>
          <el-popconfirm
            title="确定删除该小组？"
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
        v-if="squadStore.total > pageSize"
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="squadStore.total"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="showDialog"
      :title="editingSquad ? '编辑小组' : '创建小组'"
      width="520px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px">
        <el-form-item label="小组名称" prop="name">
          <el-input v-model="formData.name" placeholder="请输入小组名称" />
        </el-form-item>
        <el-form-item label="所属项目" prop="projectId">
          <el-select
            v-model="formData.projectId"
            placeholder="选择项目"
            style="width: 100%"
            :disabled="!!editingSquad"
          >
            <el-option
              v-for="p in orgStore.projects"
              :key="p.id"
              :label="p.name"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="需求架构师" prop="architectId">
          <el-select
            v-model="formData.architectId"
            placeholder="选择需求架构师"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="u in availableArchitects"
              :key="u.id"
              :label="`${u.name} (${u.email})`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="实施工程师" prop="engineerId">
          <el-select
            v-model="formData.engineerId"
            placeholder="选择实施工程师"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="u in availableEngineers"
              :key="u.id"
              :label="`${u.name} (${u.email})`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ editingSquad ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useOrgStore } from '@/stores/org'
import { useSquadStore } from '@/stores/squad'
import type { SquadItem, SquadMemberItem, UserProfileItem } from '@/api/org'

const orgStore = useOrgStore()
const squadStore = useSquadStore()

const filterProjectId = ref('')
const currentPage = ref(1)
const pageSize = 20
const showDialog = ref(false)
const submitting = ref(false)
const editingSquad = ref<SquadItem | null>(null)
const formRef = ref<FormInstance>()
const allUsers = ref<UserProfileItem[]>([])

const formData = reactive({
  name: '',
  projectId: '',
  architectId: '',
  engineerId: '',
})

const formRules: FormRules = {
  name: [{ required: true, message: '请输入小组名称', trigger: 'blur' }],
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
  architectId: [{ required: true, message: '请选择需求架构师', trigger: 'change' }],
  engineerId: [{ required: true, message: '请选择实施工程师', trigger: 'change' }],
}

function getArchitect(squad: SquadItem): SquadMemberItem | undefined {
  return squad.members.find((m) => m.squadRole === 'architect')
}

function getEngineer(squad: SquadItem): SquadMemberItem | undefined {
  return squad.members.find((m) => m.squadRole === 'engineer')
}

// Available users: those not in a squad, or in the current editing squad
const availableArchitects = computed(() => {
  return allUsers.value.filter((u) => {
    if (u.id === formData.engineerId) return false
    if (!u.squadId) return true
    if (editingSquad.value) {
      const arch = getArchitect(editingSquad.value)
      if (arch && arch.user.id === u.id) return true
    }
    return false
  })
})

const availableEngineers = computed(() => {
  return allUsers.value.filter((u) => {
    if (u.id === formData.architectId) return false
    if (!u.squadId) return true
    if (editingSquad.value) {
      const eng = getEngineer(editingSquad.value)
      if (eng && eng.user.id === u.id) return true
    }
    return false
  })
})

async function loadSquads() {
  const params: { page?: number; pageSize?: number; projectId?: string } = {
    page: currentPage.value,
    pageSize,
  }
  if (filterProjectId.value) {
    params.projectId = filterProjectId.value
  }
  await squadStore.fetchSquads(params)
}

async function loadAllUsers() {
  await orgStore.fetchUsers({ page: 1, pageSize: 100 })
  allUsers.value = orgStore.users
}

function handleFilterChange() {
  currentPage.value = 1
  loadSquads()
}

function handlePageChange(page: number) {
  currentPage.value = page
  loadSquads()
}

function openCreateDialog() {
  editingSquad.value = null
  resetForm()
  showDialog.value = true
}

function handleEdit(squad: SquadItem) {
  editingSquad.value = squad
  formData.name = squad.name
  formData.projectId = squad.projectId
  const arch = getArchitect(squad)
  const eng = getEngineer(squad)
  formData.architectId = arch?.user.id || ''
  formData.engineerId = eng?.user.id || ''
  showDialog.value = true
}

async function handleDelete(id: string) {
  try {
    await squadStore.deleteSquad(id)
    ElMessage.success('小组已删除')
    // Reload users to refresh squad assignments
    await loadAllUsers()
  } catch {
    // error handled by interceptor
  }
}

function resetForm() {
  formData.name = ''
  formData.projectId = ''
  formData.architectId = ''
  formData.engineerId = ''
  formRef.value?.resetFields()
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  if (formData.architectId === formData.engineerId) {
    ElMessage.warning('架构师和工程师不能是同一人')
    return
  }

  submitting.value = true
  try {
    if (editingSquad.value) {
      await squadStore.updateSquad(editingSquad.value.id, {
        name: formData.name,
        architectId: formData.architectId,
        engineerId: formData.engineerId,
      })
      ElMessage.success('小组已更新')
    } else {
      await squadStore.createSquad({
        name: formData.name,
        projectId: formData.projectId,
        architectId: formData.architectId,
        engineerId: formData.engineerId,
      })
      ElMessage.success('小组已创建')
    }
    showDialog.value = false
    await loadAllUsers()
  } catch {
    // error handled by interceptor
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    loadSquads(),
    orgStore.fetchProjects({ page: 1, pageSize: 100 }),
    loadAllUsers(),
  ])
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

.squad-name {
  font-weight: 500;
  color: #303133;
}

.member-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.member-name {
  font-weight: 500;
  margin-right: 4px;
}

.role-badge {
  margin-right: 2px;
}

.legacy-tag {
  margin-right: 2px;
}

.text-secondary {
  color: #909399;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
