<template>
  <div class="tasks-page">
    <div class="page-header">
      <h2 class="page-title">任务管理</h2>
      <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">新建任务</el-button>
    </div>

    <!-- Project filter -->
    <div class="filter-bar">
      <el-select v-model="filterProjectId" placeholder="全部项目" clearable style="width: 200px" @change="fetchList">
        <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 140px" @change="fetchList">
        <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-input
        v-model="searchKeyword"
        placeholder="搜索任务..."
        :prefix-icon="Search"
        clearable
        style="width: 200px"
        @input="debouncedFetch"
      />
    </div>

    <!-- Task card grid -->
    <div v-loading="loading" class="task-grid">
      <el-empty v-if="!loading && iterations.length === 0" description="暂无任务，点击上方创建" />
      <div
        v-for="task in iterations"
        :key="task.id"
        class="task-card"
        @click="goToBoard(task)"
      >
        <div class="card-header">
          <el-tag :type="projectColor(task.projectId)" size="small" effect="plain" class="project-tag">
            {{ task.projectName ?? '未知项目' }}
          </el-tag>
          <el-tag size="small" class="squad-tag">{{ task.squadName ?? '未知小组' }}</el-tag>
        </div>
        <div class="card-body">
          <h3 class="task-name">{{ task.name }}</h3>
          <!-- Phase B.4: 显示父假设 badge -->
          <div
            v-if="task.hypothesis"
            class="hypothesis-badge"
            @click.stop="goToHypothesis(task.hypothesis.id)"
          >
            <el-icon><Aim /></el-icon>
            <span class="hypothesis-badge-text">
              验证假设: {{ task.hypothesis.statement.slice(0, 50) }}{{ task.hypothesis.statement.length > 50 ? '…' : '' }}
            </span>
          </div>
          <!-- Phase C.2: 任务完成 + hypothesis 未关闭 → "录入结果" CTA -->
          <div
            v-if="shouldPromptCloseHypothesis(task)"
            class="close-prompt"
            @click.stop="promptCloseHypothesis(task)"
          >
            <el-icon><Check /></el-icon>
            录入结果数据 →
          </div>
          <div class="task-status">
            <span class="status-label">{{ task.statusLabel }}</span>
          </div>
        </div>
        <!-- Progress bar -->
        <div class="card-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPercent(task) + '%' }" />
          </div>
          <span class="progress-text">{{ progressPercent(task) }}%</span>
        </div>
        <div class="card-footer">
          <span class="feed-count">{{ task.feedCompletedCount }}/{{ task.feedCount }} 工作台包</span>
          <span class="task-time">{{ formatTime(task.createdAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
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
    <el-dialog v-model="showCreateDialog" title="新建任务" width="520px">
      <el-form label-position="top">
        <el-form-item label="任务名称" required>
          <el-input v-model="createForm.name" placeholder="如：v1.0 首页开发" />
        </el-form-item>
        <el-form-item label="关联目标（选填）">
          <el-select
            v-model="createForm.hypothesisId"
            filterable
            clearable
            placeholder="选择要验证的目标假设"
            style="width: 100%"
          >
            <el-option
              v-for="h in myHypotheses"
              :key="h.id"
              :label="h.statement"
              :value="h.id"
            >
              <div class="hyp-option">
                <el-tag :type="statusTagForHyp(h.status)" size="small">{{ h.statusLabel }}</el-tag>
                <span class="hyp-option-text">{{ h.statement.slice(0, 60) }}{{ h.statement.length > 60 ? '…' : '' }}</span>
              </div>
            </el-option>
          </el-select>
          <div class="link-hint">关联后，任务完成时可直接录入验证数据</div>
        </el-form-item>
        <el-form-item label="所属项目" required>
          <el-select v-model="createForm.projectId" placeholder="选择项目" style="width: 100%" @change="onProjectChange">
            <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属小组" required>
          <el-select v-model="createForm.squadId" placeholder="选择小组" style="width: 100%" :disabled="!createForm.projectId">
            <el-option v-for="s in squads" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search, Aim, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listIterationsApi, createIterationApi } from '@/api/iteration'
import type { IterationItem } from '@/api/iteration'
import { listProjectsApi } from '@/api/org'
import { listSquadsApi } from '@/api/squad'
import { listHypothesesApi } from '@/api/hypothesis'
import request from '@/api/request'

const router = useRouter()

// ========== Data ==========
const loading = ref(false)
const iterations = ref<IterationItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 12

// Filters
const filterProjectId = ref('')
const filterStatus = ref('')
const searchKeyword = ref('')

// Projects & Squads
const projects = ref<Array<{ id: string; name: string }>>([])
const squads = ref<Array<{ id: string; name: string }>>([])

const statusOptions = [
  { value: 'SPEC', label: '① 定规范' },
  { value: 'DESIGN', label: '② 生成设计' },
  { value: 'REFINE', label: '③ UI 精修' },
  { value: 'IMPLEMENT', label: '④ 实施' },
  { value: 'ACCEPT', label: '⑤ 验收' },
  { value: 'DONE', label: '⑥ 完成' },
]

const STATUS_INDEX: Record<string, number> = {
  SPEC: 0, DESIGN: 1, REFINE: 2, IMPLEMENT: 3, ACCEPT: 4, DONE: 5,
}

function progressPercent(task: IterationItem): number {
  // 优先用 Feed 包完成率（真实工作进度）
  if (task.feedCount > 0) {
    return Math.round((task.feedCompletedCount / task.feedCount) * 100)
  }
  // 没有 Feed 包时用阶段作为粗略指示
  if (task.status === 'DONE') return 100
  const idx = STATUS_INDEX[task.status] ?? 0
  return Math.round(((idx) / 5) * 100) // SPEC=0%, DONE via feedCount
}

const projectColors = ['', 'success', 'warning', 'danger', 'info'] as const
function projectColor(projectId: string): string {
  const idx = projects.value.findIndex((p) => p.id === projectId)
  return projectColors[idx % projectColors.length] ?? ''
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN')
}

// ========== Fetch ==========
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchList, 300)
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
    if (res.data.code === 0 && res.data.data) {
      iterations.value = res.data.data.items
      total.value = res.data.data.total
    }
  } finally {
    loading.value = false
  }
}

async function loadProjects() {
  try {
    // mine=true：只显示当前用户是 owner / 或同 squad 的项目
    const res = await listProjectsApi({ pageSize: 100, mine: true })
    if (res.data.data) {
      projects.value = res.data.data.items.map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
      }))
    }
  } catch { /* ignore */ }
}

async function loadSquads() {
  try {
    const res = await listSquadsApi({ pageSize: 100 })
    if (res.data.data) {
      squads.value = res.data.data.items.map((s: { id: string; name: string }) => ({
        id: s.id,
        name: s.name,
      }))
    }
  } catch { /* ignore */ }
}

// ========== Navigation ==========
function goToBoard(task: IterationItem) {
  if (task.boardId) {
    router.push(`/tasks/${task.boardId}`)
  } else {
    ElMessage.warning('该任务没有关联工作台')
  }
}

// Phase B.4: 点击 hypothesis badge 跳转到假设详情
function goToHypothesis(hypothesisId: string) {
  router.push(`/hypotheses/${hypothesisId}`)
}

// Phase C.2: 任务完成（DONE）+ hypothesis 仍在跑（RUNNING / BACKLOG）时显示"录入结果"
function shouldPromptCloseHypothesis(task: IterationItem): boolean {
  return (
    task.status === 'DONE' &&
    !!task.hypothesis &&
    (task.hypothesis.status === 'RUNNING' || task.hypothesis.status === 'BACKLOG')
  )
}

function promptCloseHypothesis(task: IterationItem) {
  if (!task.hypothesis) return
  // 带 query 跳 hypothesis 详情，detail.vue 会自动打开 close dialog
  router.push(`/hypotheses/${task.hypothesis.id}?action=close`)
}

// ========== Create ==========
const showCreateDialog = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', projectId: '', squadId: '', hypothesisId: '' })

// 我的假设候选列表（BACKLOG + RUNNING，只看自己的）
const myHypotheses = ref<Array<{ id: string; statement: string; status: string; statusLabel: string }>>([])

const STATUS_LABEL_MAP: Record<string, string> = {
  BACKLOG: '待开始',
  RUNNING: '进行中',
  CLOSED_WIN: '达成',
  CLOSED_LOSS: '未达成',
  CLOSED_FLAT: '无变化',
}

function statusTagForHyp(s: string): 'success' | 'warning' | 'danger' | 'info' | '' {
  if (s === 'RUNNING') return 'warning'
  if (s === 'BACKLOG') return ''
  if (s === 'CLOSED_WIN') return 'success'
  if (s === 'CLOSED_LOSS') return 'danger'
  return 'info'
}

async function loadMyHypotheses() {
  try {
    const res = await listHypothesesApi({
      status: 'BACKLOG,RUNNING',
      mine: true,
      pageSize: 50,
    })
    if (res.data.code === 0 && res.data.data) {
      myHypotheses.value = res.data.data.items.map((h) => ({
        id: h.id,
        statement: h.statement,
        status: h.status,
        statusLabel: STATUS_LABEL_MAP[h.status] ?? h.status,
      }))
    }
  } catch { /* ignore */ }
}

function onProjectChange() {
  createForm.value.squadId = ''
}

async function handleCreate() {
  const { name, projectId, squadId, hypothesisId } = createForm.value
  if (!name || !projectId || !squadId) {
    ElMessage.warning('请填写完整')
    return
  }
  creating.value = true
  try {
    // 如果关联了假设，走 hypothesis → iteration 的 API（自动挂 hypothesisId）
    if (hypothesisId) {
      const res = await request.post(`/hypotheses/${hypothesisId}/iterations`, {
        name,
        projectId,
        squadId,
      })
      if (res.data.code === 0) {
        ElMessage.success('任务已创建并关联目标')
        showCreateDialog.value = false
        createForm.value = { name: '', projectId: '', squadId: '', hypothesisId: '' }
        fetchList()
      }
    } else {
      // 不关联假设，走普通创建
      const res = await createIterationApi({ name, projectId, squadId })
      if (res.data.code === 0) {
        ElMessage.success('任务已创建')
        showCreateDialog.value = false
        createForm.value = { name: '', projectId: '', squadId: '', hypothesisId: '' }
        fetchList()
      }
    }
  } finally {
    creating.value = false
  }
}

// ========== Init ==========
onMounted(() => {
  loadProjects()
  loadSquads()
  loadMyHypotheses()
  fetchList()
})
</script>

<style scoped>
.tasks-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

/* ========== Task Card Grid ========== */

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.task-card {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.12);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.project-tag {
  font-size: 11px;
}

.squad-tag {
  font-size: 11px;
  color: #909399;
  background: #f5f7fa;
  border-color: #e4e7ed;
}

.card-body {
  flex: 1;
}

.task-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 6px;
  line-height: 1.4;
}

.task-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-label {
  font-size: 12px;
  color: #409eff;
  font-weight: 500;
}

/* Phase B.4: Hypothesis badge */
.hypothesis-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  padding: 4px 8px;
  background: rgba(64, 158, 255, 0.08);
  border-left: 2px solid #409eff;
  border-radius: 4px;
  font-size: 11px;
  color: #606266;
  cursor: pointer;
  transition: background 0.15s;
  line-height: 1.4;
}

.hypothesis-badge:hover {
  background: rgba(64, 158, 255, 0.15);
}

.hypothesis-badge .el-icon {
  color: #409eff;
  flex-shrink: 0;
}

.hypothesis-badge-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Phase C.2: 录入结果提示 */
.close-prompt {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 6px 10px;
  background: rgba(103, 194, 58, 0.12);
  border-radius: 4px;
  color: #67c23a;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.close-prompt:hover {
  background: rgba(103, 194, 58, 0.2);
  transform: translateX(2px);
}

/* ========== Hypothesis option in create dialog ========== */

.hyp-option {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.hyp-option-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.link-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* ========== Progress Bar ========== */

.card-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-track {
  flex: 1;
  height: 6px;
  background: #ebeef5;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff 0%, #67c23a 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: #909399;
  min-width: 32px;
  text-align: right;
}

/* ========== Footer ========== */

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}

.feed-count {
  color: #606266;
}

.pagination-wrap {
  margin-top: 20px;
  display: flex;
  justify-content: center;
}
</style>
