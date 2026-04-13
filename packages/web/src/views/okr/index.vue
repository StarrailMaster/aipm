<template>
  <div class="okr-page">
    <!-- Header -->
    <div class="page-header">
      <h2 class="page-title">OKR 看板</h2>
      <div class="header-actions">
        <el-select
          v-model="selectedProjectId"
          placeholder="选择项目"
          style="width: 200px"
          @change="handleProjectChange"
        >
          <el-option
            v-for="proj in orgStore.projects"
            :key="proj.id"
            :label="proj.name"
            :value="proj.id"
          />
        </el-select>
        <el-button type="primary" :disabled="!selectedProjectId" @click="showCreateObjective = true">
          <el-icon><Plus /></el-icon>
          新建目标
        </el-button>
      </div>
    </div>

    <!-- Content -->
    <div v-loading="okrStore.loading" class="okr-content">
      <el-empty
        v-if="!selectedProjectId"
        description="请先选择一个项目"
      />
      <el-empty
        v-else-if="!okrStore.loading && okrStore.objectives.length === 0"
        description="暂无 OKR 目标"
      >
        <el-button type="primary" @click="showCreateObjective = true">创建第一个目标</el-button>
      </el-empty>

      <!-- Objective Cards -->
      <div v-else class="objectives-list">
        <el-card
          v-for="obj in okrStore.objectives"
          :key="obj.id"
          class="objective-card"
          shadow="hover"
        >
          <template #header>
            <div class="obj-header">
              <div class="obj-info">
                <h3 class="obj-name">{{ obj.name }}</h3>
                <el-tag v-if="obj.squadName" size="small" type="info" effect="plain">
                  {{ obj.squadName }}
                </el-tag>
              </div>
              <div class="obj-actions">
                <el-button text size="small" @click="handleEditObjective(obj)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-popconfirm title="确定删除该目标?" @confirm="handleDeleteObjective(obj.id)">
                  <template #reference>
                    <el-button text size="small" type="danger">
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </div>
            <p v-if="obj.description" class="obj-description">{{ obj.description }}</p>
          </template>

          <!-- Key Results -->
          <div class="kr-list">
            <div
              v-for="kr in obj.keyResults"
              :key="kr.id"
              class="kr-item"
            >
              <div class="kr-main">
                <div class="kr-header">
                  <span class="kr-name">{{ kr.name }}</span>
                  <div class="kr-actions">
                    <el-tag
                      :type="kr.status === 'achieved' ? 'success' : 'info'"
                      size="small"
                      effect="dark"
                    >
                      {{ kr.status === 'achieved' ? '已达成' : '未达成' }}
                    </el-tag>
                    <el-button size="small" @click="handleRecordData(kr)">
                      记录数据
                    </el-button>
                    <el-button text size="small" @click="handleEditKr(kr)">
                      <el-icon><Edit /></el-icon>
                    </el-button>
                    <el-popconfirm title="确定删除该关键结果?" @confirm="handleDeleteKr(kr.id)">
                      <template #reference>
                        <el-button text size="small" type="danger">
                          <el-icon><Delete /></el-icon>
                        </el-button>
                      </template>
                    </el-popconfirm>
                  </div>
                </div>
                <div class="kr-progress">
                  <el-progress
                    :percentage="krPercentage(kr)"
                    :color="kr.status === 'achieved' ? '#67c23a' : '#409eff'"
                    :stroke-width="10"
                  />
                  <span class="kr-values">
                    {{ kr.currentValue }} / {{ kr.targetValue }} {{ kr.unit }}
                  </span>
                </div>
              </div>

              <!-- Iteration History (collapsible) -->
              <el-collapse v-if="kr.iterations.length > 0" class="kr-iterations">
                <el-collapse-item :title="`迭代记录 (${kr.iterations.length})`">
                  <el-table :data="kr.iterations" stripe size="small" style="width: 100%">
                    <el-table-column prop="roundNumber" label="轮次" width="70" />
                    <el-table-column prop="changes" label="改动内容" min-width="200" />
                    <el-table-column label="数据值" width="100">
                      <template #default="{ row }">
                        {{ row.dataFeedback }}
                      </template>
                    </el-table-column>
                    <el-table-column label="达成" width="80" align="center">
                      <template #default="{ row }">
                        <el-tag
                          :type="row.isAchieved ? 'success' : 'info'"
                          size="small"
                        >
                          {{ row.isAchieved ? '是' : '否' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="记录人" width="100">
                      <template #default="{ row }">
                        {{ row.recordedBy.name }}
                      </template>
                    </el-table-column>
                    <el-table-column label="时间" width="160">
                      <template #default="{ row }">
                        {{ formatTime(row.createdAt) }}
                      </template>
                    </el-table-column>
                  </el-table>
                </el-collapse-item>
              </el-collapse>
            </div>
          </div>

          <!-- Add KR button -->
          <div class="add-kr">
            <el-button text type="primary" @click="handleAddKr(obj.id)">
              <el-icon><Plus /></el-icon>
              添加关键结果
            </el-button>
          </div>
        </el-card>
      </div>
    </div>

    <!-- Create / Edit Objective Dialog -->
    <el-dialog
      v-model="showCreateObjective"
      :title="editingObjective ? '编辑目标' : '新建目标'"
      width="500px"
      @close="resetObjectiveForm"
    >
      <el-form :model="objectiveForm" label-width="80px">
        <el-form-item label="目标名称" required>
          <el-input v-model="objectiveForm.name" placeholder="请输入目标名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="objectiveForm.description"
            type="textarea"
            :rows="3"
            placeholder="目标描述（可选）"
          />
        </el-form-item>
        <el-form-item label="负责小组">
          <el-select
            v-model="objectiveForm.squadId"
            placeholder="选择小组（可选）"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="squad in squads"
              :key="squad.id"
              :label="squad.name"
              :value="squad.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateObjective = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="handleSubmitObjective"
        >
          {{ editingObjective ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Create / Edit KR Dialog -->
    <el-dialog
      v-model="showCreateKr"
      :title="editingKr ? '编辑关键结果' : '添加关键结果'"
      width="500px"
      @close="resetKrForm"
    >
      <el-form :model="krForm" label-width="80px">
        <el-form-item label="KR 名称" required>
          <el-input v-model="krForm.name" placeholder="请输入关键结果名称" />
        </el-form-item>
        <el-form-item label="目标值" required>
          <el-input-number
            v-model="krForm.targetValue"
            :min="0"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="单位" required>
          <el-input v-model="krForm.unit" placeholder="例: %, s, ms, 次" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateKr = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="handleSubmitKr"
        >
          {{ editingKr ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Record Data Dialog -->
    <el-dialog
      v-model="showRecordData"
      title="记录迭代数据"
      width="500px"
      @close="resetRecordForm"
    >
      <div v-if="recordingKr" class="record-context">
        <p>
          关键结果：<strong>{{ recordingKr.name }}</strong>
        </p>
        <p>
          当前值: {{ recordingKr.currentValue }} / 目标值: {{ recordingKr.targetValue }} {{ recordingKr.unit }}
        </p>
      </div>
      <el-form :model="recordForm" label-width="80px">
        <el-form-item label="改动内容" required>
          <el-input
            v-model="recordForm.changes"
            type="textarea"
            :rows="4"
            placeholder="描述本轮做了什么改动..."
          />
        </el-form-item>
        <el-form-item label="数据值" required>
          <el-input-number
            v-model="recordForm.dataFeedback"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRecordData = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="handleSubmitRecord"
        >
          提交
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useOkrStore } from '@/stores/okr'
import { useOrgStore } from '@/stores/org'
import type { ObjectiveItem, KeyResultItem } from '@/api/okr'

const okrStore = useOkrStore()
const orgStore = useOrgStore()

const selectedProjectId = ref<string>('')
const submitting = ref(false)

// Objective dialog state
const showCreateObjective = ref(false)
const editingObjective = ref<ObjectiveItem | null>(null)
const objectiveForm = reactive({
  name: '',
  description: '',
  squadId: '',
})

// KR dialog state
const showCreateKr = ref(false)
const editingKr = ref<KeyResultItem | null>(null)
const krParentObjectiveId = ref('')
const krForm = reactive({
  name: '',
  targetValue: 0,
  unit: '',
})

// Record data dialog state
const showRecordData = ref(false)
const recordingKr = ref<KeyResultItem | null>(null)
const recordForm = reactive({
  changes: '',
  dataFeedback: 0,
})

// Squads for current project
const squads = computed(() => {
  const proj = orgStore.currentProject
  if (proj && proj.id === selectedProjectId.value) {
    return proj.squads
  }
  return []
})

// Helpers
function krPercentage(kr: KeyResultItem): number {
  if (kr.targetValue <= 0) return 0
  const pct = (kr.currentValue / kr.targetValue) * 100
  return Math.min(Math.round(pct), 100)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Event handlers
async function handleProjectChange(val: string) {
  if (val) {
    await Promise.all([
      okrStore.fetchObjectives(val),
      orgStore.fetchProject(val),
    ])
  }
}

// Objective CRUD
function handleEditObjective(obj: ObjectiveItem) {
  editingObjective.value = obj
  objectiveForm.name = obj.name
  objectiveForm.description = obj.description ?? ''
  objectiveForm.squadId = obj.squadId ?? ''
  showCreateObjective.value = true
}

function resetObjectiveForm() {
  editingObjective.value = null
  objectiveForm.name = ''
  objectiveForm.description = ''
  objectiveForm.squadId = ''
}

async function handleSubmitObjective() {
  if (!objectiveForm.name.trim()) {
    ElMessage.warning('请输入目标名称')
    return
  }

  submitting.value = true
  try {
    if (editingObjective.value) {
      await okrStore.updateObjective(editingObjective.value.id, {
        name: objectiveForm.name,
        description: objectiveForm.description || undefined,
        squadId: objectiveForm.squadId || undefined,
      })
      ElMessage.success('目标已更新')
    } else {
      await okrStore.createObjective({
        projectId: selectedProjectId.value,
        name: objectiveForm.name,
        description: objectiveForm.description || undefined,
        squadId: objectiveForm.squadId || undefined,
      })
      ElMessage.success('目标已创建')
    }
    showCreateObjective.value = false
  } finally {
    submitting.value = false
  }
}

async function handleDeleteObjective(id: string) {
  await okrStore.deleteObjective(id)
  ElMessage.success('目标已删除')
}

// KR CRUD
function handleAddKr(objectiveId: string) {
  krParentObjectiveId.value = objectiveId
  editingKr.value = null
  showCreateKr.value = true
}

function handleEditKr(kr: KeyResultItem) {
  editingKr.value = kr
  krForm.name = kr.name
  krForm.targetValue = kr.targetValue
  krForm.unit = kr.unit
  showCreateKr.value = true
}

function resetKrForm() {
  editingKr.value = null
  krParentObjectiveId.value = ''
  krForm.name = ''
  krForm.targetValue = 0
  krForm.unit = ''
}

async function handleSubmitKr() {
  if (!krForm.name.trim()) {
    ElMessage.warning('请输入关键结果名称')
    return
  }
  if (!krForm.unit.trim()) {
    ElMessage.warning('请输入单位')
    return
  }

  submitting.value = true
  try {
    if (editingKr.value) {
      await okrStore.updateKeyResult(editingKr.value.id, {
        name: krForm.name,
        targetValue: krForm.targetValue,
        unit: krForm.unit,
      })
      ElMessage.success('关键结果已更新')
    } else {
      await okrStore.createKeyResult({
        objectiveId: krParentObjectiveId.value,
        name: krForm.name,
        targetValue: krForm.targetValue,
        unit: krForm.unit,
      })
      ElMessage.success('关键结果已创建')
    }
    showCreateKr.value = false
  } finally {
    submitting.value = false
  }
}

async function handleDeleteKr(id: string) {
  await okrStore.deleteKeyResult(id)
  ElMessage.success('关键结果已删除')
}

// Record data
function handleRecordData(kr: KeyResultItem) {
  recordingKr.value = kr
  recordForm.changes = ''
  recordForm.dataFeedback = kr.currentValue
  showRecordData.value = true
}

function resetRecordForm() {
  recordingKr.value = null
  recordForm.changes = ''
  recordForm.dataFeedback = 0
}

async function handleSubmitRecord() {
  if (!recordForm.changes.trim()) {
    ElMessage.warning('请填写改动内容')
    return
  }
  if (!recordingKr.value) return

  submitting.value = true
  try {
    await okrStore.recordIteration(recordingKr.value.id, {
      changes: recordForm.changes,
      dataFeedback: recordForm.dataFeedback,
    })
    ElMessage.success('数据已记录')
    showRecordData.value = false
  } finally {
    submitting.value = false
  }
}

// Init
onMounted(async () => {
  await orgStore.fetchProjects({ page: 1, pageSize: 100, mine: true })
})
</script>

<style scoped>
.okr-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.okr-content {
  min-height: 300px;
}

/* Objectives list */
.objectives-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.objective-card {
  overflow: visible;
}

.obj-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.obj-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.obj-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.obj-actions {
  display: flex;
  gap: 4px;
}

.obj-description {
  margin: 8px 0 0 0;
  font-size: 13px;
  color: #909399;
}

/* Key Result list */
.kr-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kr-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 14px;
  background: #fafafa;
}

.kr-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.kr-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.kr-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kr-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kr-values {
  font-size: 12px;
  color: #909399;
  text-align: right;
}

/* Iterations */
.kr-iterations {
  margin-top: 10px;
}

.kr-iterations :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #606266;
  height: 36px;
}

.kr-iterations :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

/* Add KR */
.add-kr {
  margin-top: 12px;
  text-align: center;
}

/* Record data dialog context */
.record-context {
  margin-bottom: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
}

.record-context p {
  margin: 4px 0;
}
</style>
