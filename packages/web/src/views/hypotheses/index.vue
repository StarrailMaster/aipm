<template>
  <div class="hypothesis-list-page">
    <div class="page-header">
      <h1 class="page-title">{{ t('nav.hypotheses') }}</h1>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        {{ t('hypothesis.create.title') }}
      </el-button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <el-select v-model="filters.status" :placeholder="t('common.status')" clearable style="width: 160px" @change="refresh">
        <el-option v-for="s in statusOptions" :key="s" :label="t(`hypothesis.status.${s}`)" :value="s" />
      </el-select>
      <el-select v-model="filters.sortBy" :placeholder="t('common.sortBy')" style="width: 160px" @change="refresh">
        <el-option :label="t('common.byIce')" value="iceScore" />
        <el-option :label="t('common.byRice')" value="riceScore" />
        <el-option :label="t('common.byCreatedAt')" value="createdAt" />
        <el-option :label="t('common.byUpdatedAt')" value="updatedAt" />
      </el-select>
      <el-checkbox v-model="filters.mine" @change="refresh">{{ t('common.onlyMine') }}</el-checkbox>
    </div>

    <!-- 按指标目标分组卡片 -->
    <div v-loading="loading" class="grouped-view">
      <el-empty v-if="!loading && groups.length === 0" :description="t('common.empty')" />

      <section v-for="g in groups" :key="g.krId" class="kr-group">
        <!-- 分组 header：指标目标 + 进度 -->
        <div class="kr-group-header" @click="goKrDetail(g.krId)">
          <div class="kr-group-left">
            <h3 class="kr-group-name">{{ g.krName }}</h3>
            <span class="kr-group-count">{{ g.items.length }} {{ t('hypothesis.detail.countSuffix') }}</span>
          </div>
          <div class="kr-group-right">
            <span v-if="g.progress" class="kr-group-progress-text">
              {{ g.progress.currentValue }}{{ g.progress.unit }} / {{ g.progress.targetValue }}{{ g.progress.unit }}
            </span>
            <el-tag
              v-if="g.progress"
              :type="progressStatusTagType(g.progress.progressStatus)"
              size="small"
              effect="light"
            >
              {{ t(`dashboard.progress.${progressStatusKey(g.progress.progressStatus)}`) }}
            </el-tag>
          </div>
        </div>
        <!-- 进度条 -->
        <div v-if="g.progress" class="kr-group-bar">
          <div
            class="kr-group-bar-fill"
            :class="progressBarClass(g.progress.progressStatus)"
            :style="{ width: Math.min(100, g.progress.kpiProgressRatio * 100) + '%' }"
          />
        </div>

        <!-- 假设卡片 grid -->
        <div class="hyp-card-grid">
          <div
            v-for="h in g.items"
            :key="h.id"
            class="hyp-card"
            :class="`card-${statusColor(h.status)}`"
            @click="goDetail(h)"
          >
            <el-tag :type="statusTagType(h.status)" size="small" class="hyp-card-tag">
              {{ t(`hypothesis.status.${h.status}`) }}
            </el-tag>
            <div class="hyp-card-statement">{{ h.statement }}</div>
            <div class="hyp-card-meta">
              <span v-if="h.iceScore" class="hyp-card-score">ICE {{ h.iceScore.toFixed(1) }}</span>
              <span v-else class="hyp-card-score">—</span>
              <span class="hyp-card-owner">{{ h.owner.name }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Create dialog (simple, redirects to template picker for UX) -->
    <el-dialog v-model="showCreate" :title="t('hypothesis.create.title')" width="560px">
      <el-form :model="createForm" label-position="top">
        <el-form-item :label="t('hypothesis.create.linkKr')" required>
          <template v-if="!showInlineKrCreate">
            <el-select v-model="createForm.krId" filterable :placeholder="t('common.search')" style="width: 100%">
              <el-option
                v-for="kr in availableKrs"
                :key="kr.id"
                :label="kr.name"
                :value="kr.id"
              >
                <span>{{ kr.name }}</span>
                <span class="kr-option-meta">{{ kr.objectiveName }}</span>
              </el-option>
            </el-select>
            <div class="kr-create-hint">
              {{ t('hypothesis.create.noKrHint') }}
              <el-button type="primary" text size="small" @click="showInlineKrCreate = true">
                {{ t('hypothesis.create.createKrInline') }}
              </el-button>
            </div>
          </template>
          <!-- 内联创建指标目标 -->
          <template v-else>
            <div class="inline-kr-form">
              <el-input
                v-model="inlineKrForm.name"
                :placeholder="t('hypothesis.create.krNamePlaceholder')"
                style="margin-bottom: 8px"
              />
              <div class="inline-kr-row">
                <el-input-number
                  v-model="inlineKrForm.targetValue"
                  :placeholder="t('hypothesis.create.krTarget')"
                  :min="0"
                  style="flex: 1"
                />
                <el-input
                  v-model="inlineKrForm.unit"
                  placeholder="%"
                  style="width: 80px"
                />
              </div>
              <div class="inline-kr-actions">
                <el-button size="small" @click="showInlineKrCreate = false">{{ t('common.cancel') }}</el-button>
                <el-button
                  size="small"
                  type="primary"
                  :loading="creatingKr"
                  :disabled="!inlineKrForm.name.trim() || !inlineKrForm.targetValue"
                  @click="handleCreateKrInline"
                >
                  {{ t('hypothesis.create.createKrConfirm') }}
                </el-button>
              </div>
            </div>
          </template>
        </el-form-item>
        <el-form-item :label="t('hypothesis.create.statement')" required>
          <el-input
            v-model="createForm.statement"
            type="textarea"
            :rows="2"
            :placeholder="t('hypothesis.create.statementPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('hypothesis.create.mechanism')" required>
          <el-input
            v-model="createForm.mechanism"
            type="textarea"
            :rows="2"
            :placeholder="t('hypothesis.create.mechanismPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('hypothesis.create.expectedImpact')" required>
          <el-input
            v-model="createForm.expectedImpact"
            :placeholder="t('hypothesis.create.expectedImpactPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" :disabled="!canSubmit" @click="handleCreate">
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useHypothesisStore } from '@/stores/hypothesis'
import type { HypothesisBrief, HypothesisStatus } from '@/api/hypothesis'
import request from '@/api/request'

const route = useRoute()

const { t } = useI18n()
const router = useRouter()
const store = useHypothesisStore()

const loading = computed(() => store.loading)
const list = computed(() => store.list)
const total = computed(() => store.total)

const page = ref(1)
const pageSize = ref(100) // 分组视图一次拉全部
const filters = reactive({
  status: '' as '' | HypothesisStatus,
  sortBy: 'iceScore' as 'iceScore' | 'riceScore' | 'createdAt' | 'updatedAt',
  mine: false,
})

const statusOptions: HypothesisStatus[] = [
  'BACKLOG',
  'RUNNING',
  'CLOSED_WIN',
  'CLOSED_LOSS',
  'CLOSED_FLAT',
  'ABANDONED',
]

function statusTagType(s: HypothesisStatus): 'success' | 'warning' | 'danger' | 'info' | '' {
  if (s === 'CLOSED_WIN') return 'success'
  if (s === 'CLOSED_LOSS') return 'danger'
  if (s === 'CLOSED_FLAT' || s === 'ABANDONED') return 'info'
  if (s === 'RUNNING') return 'warning'
  return ''
}

function statusColor(s: string): string {
  if (s === 'CLOSED_WIN') return 'win'
  if (s === 'CLOSED_LOSS') return 'loss'
  if (s === 'RUNNING') return 'running'
  if (s === 'CLOSED_FLAT') return 'flat'
  return 'backlog'
}

function progressStatusTagType(s: string): 'success' | 'warning' | 'danger' {
  if (s === 'on_track') return 'success'
  if (s === 'behind') return 'warning'
  return 'danger'
}

function progressStatusKey(s: string): string {
  const map: Record<string, string> = { on_track: 'onTrack', behind: 'behind', critical: 'critical' }
  return map[s] ?? s
}

function progressBarClass(s: string): string {
  if (s === 'on_track') return 'bar-success'
  if (s === 'behind') return 'bar-warning'
  return 'bar-danger'
}

// KR 进度数据（从 dashboard API 拉一次）
interface KrProgress {
  id: string
  name: string
  currentValue: number
  targetValue: number
  unit: string
  kpiProgressRatio: number
  progressStatus: string
}
const krProgressMap = ref<Map<string, KrProgress>>(new Map())

async function fetchKrProgress() {
  try {
    const res = await request.get('/dashboard/learning', { params: { scope: 'all' } })
    const krs = (res.data.data?.activeKRs ?? []) as KrProgress[]
    const map = new Map<string, KrProgress>()
    for (const kr of krs) {
      map.set(kr.id, kr)
    }
    krProgressMap.value = map
  } catch { /* ignore */ }
}

// 按 krId 分组
interface KrGroup {
  krId: string
  krName: string
  progress: KrProgress | null
  items: HypothesisBrief[]
}

const groups = computed<KrGroup[]>(() => {
  const map = new Map<string, { krId: string; krName: string; items: HypothesisBrief[] }>()
  for (const h of list.value) {
    const key = h.krId
    if (!map.has(key)) {
      map.set(key, { krId: key, krName: h.krName ?? key, items: [] })
    }
    map.get(key)!.items.push(h)
  }
  return Array.from(map.values()).map((g) => ({
    ...g,
    progress: krProgressMap.value.get(g.krId) ?? null,
  }))
})

async function refresh() {
  await store.fetchList({
    page: page.value,
    pageSize: pageSize.value,
    status: filters.status || undefined,
    sortBy: filters.sortBy,
    order: 'desc',
    mine: filters.mine || undefined,
  })
}

function goDetail(row: HypothesisBrief) {
  router.push(`/hypotheses/${row.id}`)
}

function goKrDetail(krId: string) {
  router.push(`/dashboard/kr/${krId}`)
}

// ============ Create ============
const showCreate = ref(false)
const creating = ref(false)
const availableKrs = ref<Array<{ id: string; name: string; objectiveName: string }>>([])
const createForm = reactive({
  krId: '',
  statement: '',
  mechanism: '',
  expectedImpact: '',
})

// 内联创建指标目标
const showInlineKrCreate = ref(false)
const creatingKr = ref(false)
const inlineKrForm = reactive({
  name: '',
  targetValue: 0 as number,
  unit: '%',
})

async function handleCreateKrInline() {
  if (!inlineKrForm.name.trim() || !inlineKrForm.targetValue) return
  creatingKr.value = true
  try {
    // 需要 objectiveId，取第一个 objective 或让用户选
    // 简化：取 availableKrs 里第一个 KR 的 objective，或从项目拉
    let objectiveId = ''
    if (availableKrs.value.length > 0) {
      // 从已有 KR 推断 objectiveId（走 API 拉）
      const res = await request.get('/okr', {
        params: { projectId: availableKrs.value[0]?.objectiveName ? undefined : undefined },
      })
      const objectives = res.data.data as Array<{ id: string }> | null
      if (objectives && objectives.length > 0) {
        objectiveId = objectives[0].id
      }
    }
    if (!objectiveId) {
      // 如果没有任何 objective，先创建一个默认的
      const projRes = await request.get('/okr', { params: {} })
      const objs = projRes.data.data as Array<{ id: string }> | null
      if (objs && objs.length > 0) {
        objectiveId = objs[0].id
      } else {
        ElMessage.warning('请先在 OKR 管理中创建至少一个方向（Objective）')
        creatingKr.value = false
        return
      }
    }
    const res = await request.post('/okr/key-results', {
      objectiveId,
      name: inlineKrForm.name,
      targetValue: inlineKrForm.targetValue,
      unit: inlineKrForm.unit,
    })
    if (res.data.code === 0 && res.data.data) {
      const newKr = res.data.data as { id: string; name: string }
      availableKrs.value.push({
        id: newKr.id,
        name: newKr.name,
        objectiveName: '',
      })
      createForm.krId = newKr.id
      showInlineKrCreate.value = false
      inlineKrForm.name = ''
      inlineKrForm.targetValue = 0
      inlineKrForm.unit = '%'
      ElMessage.success('指标目标已创建')
    }
  } finally {
    creatingKr.value = false
  }
}

const canSubmit = computed(() => {
  return !!(
    createForm.krId &&
    createForm.statement.trim() &&
    createForm.mechanism.trim() &&
    createForm.expectedImpact.trim()
  )
})

async function openCreateDialog() {
  showCreate.value = true
  if (availableKrs.value.length === 0) {
    // 简化：直接从 dashboard/learning 拉 KR 列表
    try {
      const res = await request.get('/dashboard/learning', {
        params: { scope: 'all' },
      })
      const krs = ((res.data.data?.activeKRs ?? []) as Array<{
        id: string
        name: string
        objectiveName: string
      }>)
      availableKrs.value = krs.map((kr) => ({
        id: kr.id,
        name: kr.name,
        objectiveName: kr.objectiveName,
      }))
    } catch {
      /* ignore */
    }
  }
}

async function handleCreate() {
  if (!canSubmit.value) return
  creating.value = true
  try {
    const created = await store.create({
      krId: createForm.krId,
      statement: createForm.statement,
      mechanism: createForm.mechanism,
      expectedImpact: createForm.expectedImpact,
    })
    if (created) {
      ElMessage.success(t('common.create') + ' OK')
      showCreate.value = false
      createForm.krId = ''
      createForm.statement = ''
      createForm.mechanism = ''
      createForm.expectedImpact = ''
      router.push(`/hypotheses/${created.id}`)
    }
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  await Promise.all([refresh(), fetchKrProgress()])
  // Phase D.1: 从 Copilot 建议或 KR 详情跳转过来时自动打开新建 dialog 并预填
  const q = route.query
  if (q.adoptFrom === 'copilot' && q.statement) {
    createForm.krId = (q.krId as string) ?? ''
    createForm.statement = (q.statement as string) ?? ''
    createForm.mechanism = (q.mechanism as string) ?? ''
    createForm.expectedImpact = (q.expectedImpact as string) ?? ''
    await openCreateDialog()
  } else if (q.adoptFrom === 'blank' && q.krId) {
    // Phase E.3: 从 KR 详情页跳过来，预选 KR
    createForm.krId = q.krId as string
    await openCreateDialog()
  }
})
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints' as *;

.hypothesis-list-page {
  padding: var(--aipm-spacing-lg);

  @include mobile {
    padding: var(--aipm-spacing-md);
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--aipm-spacing-lg);
}

.page-title {
  font-size: var(--aipm-font-size-3xl);
  font-weight: var(--aipm-font-weight-bold);
  margin: 0;
}

.filters {
  display: flex;
  gap: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-md);
  flex-wrap: wrap;
}

// ========== Grouped card view ==========

.grouped-view {
  min-height: 200px;
}

.kr-group {
  margin-bottom: var(--aipm-spacing-xl);
}

.kr-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--aipm-spacing-sm) 0;
  cursor: pointer;
  border-bottom: 2px solid var(--aipm-border-light);
  margin-bottom: var(--aipm-spacing-sm);

  &:hover { opacity: 0.8; }

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--aipm-spacing-xs);
  }
}

.kr-group-left {
  display: flex;
  align-items: baseline;
  gap: var(--aipm-spacing-sm);
}

.kr-group-name {
  font-size: var(--aipm-font-size-xl);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-primary);
  margin: 0;
}

.kr-group-count {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
}

.kr-group-right {
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-sm);
}

.kr-group-progress-text {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-regular);
}

.kr-group-bar {
  height: 4px;
  background: var(--aipm-bg-page);
  border-radius: var(--aipm-radius-pill);
  overflow: hidden;
  margin-bottom: var(--aipm-spacing-md);
}

.kr-group-bar-fill {
  height: 100%;
  transition: width 0.3s;
  &.bar-success { background: var(--aipm-color-success); }
  &.bar-warning { background: var(--aipm-color-warning); }
  &.bar-danger { background: var(--aipm-color-danger); }
}

.hyp-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--aipm-spacing-md);

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.hyp-card {
  background: var(--aipm-bg-surface);
  border: 1px solid var(--aipm-border-light);
  border-left: 4px solid var(--aipm-text-secondary);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-md);
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;

  &:hover {
    box-shadow: var(--aipm-shadow-md);
    transform: translateY(-1px);
  }

  &.card-win { border-left-color: var(--aipm-color-success); }
  &.card-loss { border-left-color: var(--aipm-color-danger); }
  &.card-running { border-left-color: var(--aipm-color-primary); }
  &.card-flat { border-left-color: var(--aipm-text-secondary); }
  &.card-backlog { border-left-color: var(--aipm-text-placeholder); }
}

.hyp-card-tag {
  margin-bottom: var(--aipm-spacing-xs);
}

.hyp-card-statement {
  font-size: var(--aipm-font-size-base);
  font-weight: var(--aipm-font-weight-medium);
  color: var(--aipm-text-primary);
  line-height: var(--aipm-line-height-base);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: var(--aipm-spacing-sm);
}

.hyp-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
}

.hyp-card-score {
  color: var(--aipm-color-primary);
  font-weight: var(--aipm-font-weight-medium);
}

.hyp-card-owner {
  color: var(--aipm-text-placeholder);
}

.kr-option-meta {
  color: var(--aipm-text-secondary);
  font-size: var(--aipm-font-size-sm);
  margin-left: 8px;
}

.kr-create-hint {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  margin-top: var(--aipm-spacing-xs);
}

.inline-kr-form {
  border: 1px dashed var(--aipm-border-base);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-md);
  background: var(--aipm-bg-muted);
}

.inline-kr-row {
  display: flex;
  gap: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-sm);
}

.inline-kr-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--aipm-spacing-sm);
}

// Mobile
.mobile-list {
  display: flex;
  flex-direction: column;
  gap: var(--aipm-spacing-sm);
}

.mobile-card {
  background: var(--aipm-bg-surface);
  border: 1px solid var(--aipm-border-light);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-md);

  &:active {
    background: var(--aipm-bg-muted);
  }
}

.mobile-card-title {
  font-size: var(--aipm-font-size-md);
  font-weight: var(--aipm-font-weight-semibold);
  margin-bottom: var(--aipm-spacing-xs);
  line-height: 1.5;
}

.mobile-card-meta {
  display: flex;
  gap: var(--aipm-spacing-sm);
  align-items: center;
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  flex-wrap: wrap;
}

.mobile-card-score {
  color: var(--aipm-color-primary);
  font-weight: var(--aipm-font-weight-semibold);
}
</style>
