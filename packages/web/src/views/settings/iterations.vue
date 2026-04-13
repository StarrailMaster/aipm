<template>
  <div class="iterations-page">
    <div class="page-header">
      <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">创建迭代</el-button>
      <div class="header-filters">
        <el-select v-model="filterProjectId" placeholder="筛选项目" clearable style="width: 180px" @change="fetchList">
          <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="筛选状态" clearable style="width: 140px" @change="fetchList">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-input
          v-model="searchKeyword"
          placeholder="搜索迭代..."
          :prefix-icon="Search"
          clearable
          style="width: 200px"
          @input="debouncedFetch"
        />
      </div>
    </div>

    <el-table v-loading="loading" :data="iterations" stripe @row-click="handleRowClick">
      <el-table-column label="迭代名称" prop="name" min-width="200">
        <template #default="{ row }">
          <span class="iter-name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="当前步骤" width="140">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" effect="dark" size="small">
            {{ row.statusLabel }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="项目" prop="projectName" width="140" />
      <el-table-column label="小组" prop="squadName" width="120" />
      <el-table-column label="工作台包" width="90" align="center">
        <template #default="{ row }">{{ row.feedCount }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click.stop="openStatusDialog(row)">推进</el-button>
          <el-button size="small" text @click.stop="openEditDialog(row)">编辑</el-button>
          <el-button size="small" text type="danger" @click.stop="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > pageSize" class="pagination-wrap">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="fetchList"
      />
    </div>

    <!-- Create dialog -->
    <el-dialog v-model="showCreateDialog" title="创建迭代" width="480px">
      <el-form label-position="top">
        <el-form-item label="迭代名称" required>
          <el-input v-model="createForm.name" placeholder="如：v1.0 首页开发" />
        </el-form-item>
        <el-form-item label="所属项目" required>
          <el-select v-model="createForm.projectId" placeholder="选择项目" style="width: 100%" @change="onCreateProjectChange">
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属小组" required>
          <el-select v-model="createForm.squadId" placeholder="选择小组" style="width: 100%" :disabled="!createForm.projectId">
            <el-option v-for="s in filteredSquads" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- Edit dialog -->
    <el-dialog v-model="showEditDialog" title="编辑迭代" width="440px">
      <el-form label-position="top">
        <el-form-item label="迭代名称" required>
          <el-input v-model="editForm.name" placeholder="迭代名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="editing" @click="handleEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- Status transition dialog -->
    <el-dialog v-model="showStatusDialog" title="推进迭代状态" width="480px">
      <div v-if="statusTarget" class="status-dialog-content">
        <p class="status-current">
          当前步骤：<el-tag :type="statusTagType(statusTarget.status)" effect="dark">{{ statusTarget.statusLabel }}</el-tag>
        </p>
        <div class="status-flow">
          <div
            v-for="step in allSteps"
            :key="step.status"
            class="step-item"
            :class="{
              active: step.status === statusTarget.status,
              done: stepIndex(step.status) < stepIndex(statusTarget.status),
            }"
          >
            <span class="step-dot" />
            <span class="step-label">{{ step.label }}</span>
          </div>
        </div>
        <div v-if="statusDetail && statusDetail.allowedTransitions.length > 0" class="status-actions">
          <p>可推进到：</p>
          <el-button
            v-for="t in statusDetail.allowedTransitions"
            :key="t.status"
            type="primary"
            :loading="advancing"
            @click="handleAdvance(t.status)"
          >
            {{ t.label }}
          </el-button>
        </div>
        <div v-else-if="statusDetail">
          <el-tag type="success" effect="dark" size="large">已完成</el-tag>
        </div>

        <!-- Related feeds & designs -->
        <div v-if="statusDetail" class="status-related">
          <div v-if="statusDetail.feeds.length > 0" class="related-section">
            <h4>工作台包（{{ statusDetail.feeds.length }}）</h4>
            <div v-for="f in statusDetail.feeds" :key="f.id" class="related-item">
              <el-tag :type="f.phase === 'DESIGN' ? 'primary' : 'success'" size="small">{{ f.phase === 'DESIGN' ? '设计' : '实施' }}</el-tag>
              <span>{{ f.name }}</span>
              <el-tag size="small" :type="feedStatusType(f.status)">{{ f.status }}</el-tag>
            </div>
          </div>
          <div v-if="statusDetail.designs.length > 0" class="related-section">
            <h4>设计稿（{{ statusDetail.designs.length }}）</h4>
            <div v-for="d in statusDetail.designs" :key="d.id" class="related-item">
              <span>{{ d.name }}</span>
              <el-tag size="small">{{ d.status }}</el-tag>
            </div>
          </div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listIterationsApi,
  createIterationApi,
  getIterationApi,
  updateIterationApi,
  updateIterationStatusApi,
  deleteIterationApi,
} from '@/api/iteration'
import type { IterationItem, IterationDetail } from '@/api/iteration'
import request from '@/api/request'

// ========== List ==========
const iterations = ref<IterationItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const filterProjectId = ref('')
const filterStatus = ref('')
const searchKeyword = ref('')

// ========== Reference data ==========
const projects = ref<Array<{ id: string; name: string }>>([])
const squads = ref<Array<{ id: string; name: string; projectId: string }>>([])

const statusOptions = [
  { label: '① 定规范', value: 'SPEC' },
  { label: '② 生成设计', value: 'DESIGN' },
  { label: '③ UI 精修', value: 'REFINE' },
  { label: '④ 实施', value: 'IMPLEMENT' },
  { label: '⑤ 验收', value: 'ACCEPT' },
  { label: '⑥ 完成', value: 'DONE' },
]

const allSteps = [
  { status: 'SPEC', label: '① 定规范' },
  { status: 'DESIGN', label: '② 生成设计' },
  { status: 'REFINE', label: '③ UI 精修' },
  { status: 'IMPLEMENT', label: '④ 实施' },
  { status: 'ACCEPT', label: '⑤ 验收' },
  { status: 'DONE', label: '⑥ 完成' },
]

function stepIndex(status: string) {
  return allSteps.findIndex((s) => s.status === status)
}

function statusTagType(status: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    SPEC: 'info', DESIGN: 'primary', REFINE: 'warning',
    IMPLEMENT: 'primary', ACCEPT: 'danger', DONE: 'success',
  }
  return map[status] ?? 'info'
}

function feedStatusType(status: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    BLOCKED: 'danger',
    PENDING: 'info',
    IN_PROGRESS: 'primary',
    REVIEW: 'warning',
    DONE: 'success',
    REWORK: 'danger',
  }
  return map[status] ?? 'info'
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

async function fetchList() {
  loading.value = true
  try {
    const res = await listIterationsApi({
      page: page.value,
      pageSize,
      projectId: filterProjectId.value || undefined,
      status: filterStatus.value || undefined,
      search: searchKeyword.value || undefined,
    })
    const data = res.data.data!
    iterations.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { page.value = 1; fetchList() }, 300)
}

async function fetchRefData() {
  const [pRes, sRes] = await Promise.all([
    request.get<{ code: number; data: { items: Array<{ id: string; name: string }> } }>('/projects', { params: { page: 1, pageSize: 100 } }),
    request.get<{ code: number; data: { items: Array<{ id: string; name: string; projectId: string }> } }>('/squads', { params: { page: 1, pageSize: 100 } }),
  ])
  projects.value = pRes.data.data?.items ?? []
  squads.value = sRes.data.data?.items ?? []
}

// ========== Create ==========
const showCreateDialog = ref(false)
const creating = ref(false)
const createForm = reactive({ name: '', projectId: '', squadId: '' })

const filteredSquads = computed(() =>
  createForm.projectId ? squads.value.filter((s) => s.projectId === createForm.projectId) : [],
)

function onCreateProjectChange() {
  createForm.squadId = ''
}

async function handleCreate() {
  if (!createForm.name.trim() || !createForm.projectId || !createForm.squadId) {
    ElMessage.warning('请填写完整信息')
    return
  }
  creating.value = true
  try {
    await createIterationApi({
      projectId: createForm.projectId,
      squadId: createForm.squadId,
      name: createForm.name.trim(),
    })
    showCreateDialog.value = false
    createForm.name = ''
    createForm.projectId = ''
    createForm.squadId = ''
    ElMessage.success('迭代已创建')
    fetchList()
  } finally {
    creating.value = false
  }
}

// ========== Edit ==========
const showEditDialog = ref(false)
const editing = ref(false)
const editForm = reactive({ id: '', name: '' })

function openEditDialog(row: IterationItem) {
  editForm.id = row.id
  editForm.name = row.name
  showEditDialog.value = true
}

async function handleEdit() {
  if (!editForm.name.trim()) { ElMessage.warning('名称不能为空'); return }
  editing.value = true
  try {
    await updateIterationApi(editForm.id, { name: editForm.name.trim() })
    showEditDialog.value = false
    ElMessage.success('已更新')
    fetchList()
  } finally {
    editing.value = false
  }
}

// ========== Status ==========
const showStatusDialog = ref(false)
const statusTarget = ref<IterationItem | null>(null)
const statusDetail = ref<IterationDetail | null>(null)
const advancing = ref(false)

async function openStatusDialog(row: IterationItem) {
  statusTarget.value = row
  showStatusDialog.value = true
  statusDetail.value = null
  const res = await getIterationApi(row.id)
  statusDetail.value = res.data.data!
}

function handleRowClick(row: IterationItem) {
  openStatusDialog(row)
}

async function handleAdvance(newStatus: string) {
  if (!statusTarget.value) return
  advancing.value = true
  try {
    await updateIterationStatusApi(statusTarget.value.id, newStatus)
    ElMessage.success('状态已更新')
    showStatusDialog.value = false
    fetchList()
  } finally {
    advancing.value = false
  }
}

// ========== Delete ==========
async function handleDelete(row: IterationItem) {
  try {
    await ElMessageBox.confirm(`确定要删除迭代「${row.name}」吗？`, '删除迭代', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await deleteIterationApi(row.id)
    ElMessage.success('已删除')
    fetchList()
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    if (msg) ElMessage.error(msg)
  }
}

// ========== Init ==========
onMounted(async () => {
  await fetchRefData()
  fetchList()
})
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-filters {
  display: flex;
  gap: 8px;
}

.iter-name {
  font-weight: 500;
  color: #303133;
}

.pagination-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.status-dialog-content {
  padding: 8px 0;
}

.status-current {
  margin-bottom: 16px;
  font-size: 14px;
}

.status-flow {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  overflow-x: auto;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 16px;
  font-size: 12px;
  color: #909399;
  background: #f5f7fa;
  white-space: nowrap;
}

.step-item.active {
  background: #409eff;
  color: #fff;
  font-weight: 600;
}

.step-item.done {
  background: #e1f3d8;
  color: #67c23a;
}

.step-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-actions {
  margin-top: 8px;
}

.status-actions p {
  margin-bottom: 8px;
  color: #606266;
  font-size: 14px;
}

.status-related {
  margin-top: 20px;
  border-top: 1px solid #e4e7ed;
  padding-top: 16px;
}

.related-section {
  margin-bottom: 12px;
}

.related-section h4 {
  font-size: 13px;
  color: #606266;
  margin: 0 0 8px;
}

.related-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
</style>
