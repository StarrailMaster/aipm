<template>
  <div v-loading="loading" class="hypothesis-detail-page">
    <template v-if="detail">
      <!-- Breadcrumb -->
      <el-breadcrumb class="breadcrumb">
        <el-breadcrumb-item :to="{ path: '/dashboard' }">{{ t('dashboard.title') }}</el-breadcrumb-item>
        <el-breadcrumb-item :to="{ path: '/hypotheses' }">{{ t('nav.hypotheses') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ detail.statement.slice(0, 30) }}...</el-breadcrumb-item>
      </el-breadcrumb>

      <!-- Header -->
      <div class="detail-header">
        <div class="header-left">
          <el-tag :type="statusTagType(detail.status)" size="large">
            {{ t(`hypothesis.status.${detail.status}`) }}
          </el-tag>
          <h1 class="detail-title">{{ detail.statement }}</h1>
          <p class="detail-meta">
            {{ detail.krName }} · owner: {{ detail.owner.name }}
          </p>
        </div>
        <div class="header-right">
          <el-button v-if="canClose" type="success" @click="openCloseDialog">
            <el-icon><Check /></el-icon>
            {{ t('hypothesis.close.title') }}
          </el-button>
        </div>
      </div>

      <!-- Tabs -->
      <el-tabs v-model="activeTab">
        <el-tab-pane :label="t('hypothesis.detail.overview')" name="overview">
          <div class="card-grid">
            <el-card class="info-card">
              <template #header>{{ t('hypothesis.detail.mechanism') }}</template>
              <p>{{ detail.mechanism }}</p>
            </el-card>

            <el-card class="info-card">
              <template #header>{{ t('hypothesis.detail.expectedImpact') }}</template>
              <p>{{ detail.expectedImpact }}</p>
            </el-card>

            <el-card class="info-card">
              <template #header>{{ t('hypothesis.scoring.title') }}</template>
              <div v-if="detail.iceScore !== null">
                ICE: <strong>{{ detail.iceScore.toFixed(1) }}</strong>
                <small>(impact={{ detail.iceImpact }} × conf={{ detail.iceConfidence }} × ease={{ detail.iceEase }})</small>
              </div>
              <div v-else-if="detail.riceScore !== null">
                RICE: <strong>{{ detail.riceScore.toFixed(1) }}</strong>
              </div>
              <div v-else>
                <el-button size="small" @click="showIceDialog = true">{{ t('hypothesis.scoring.addIce') }}</el-button>
                <el-button size="small" @click="showRiceDialog = true">{{ t('hypothesis.scoring.rice') }}</el-button>
              </div>
            </el-card>

            <el-card v-if="detail.result" class="info-card">
              <template #header>{{ t('hypothesis.detail.result') }}</template>
              <div>{{ detail.result.metricName }}</div>
              <div>
                {{ detail.result.baseline }}{{ detail.result.unit }}
                →
                {{ detail.result.actual }}{{ detail.result.unit }}
                (Δ <strong :class="deltaClass(detail.result.delta)">{{ detail.result.delta > 0 ? '+' : '' }}{{ detail.result.delta }}</strong>)
              </div>
              <el-tag :type="conclusionTag(detail.result.conclusion)">
                {{ t(`hypothesis.conclusion.${detail.result.conclusion}`) }}
              </el-tag>
            </el-card>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="t('hypothesis.variants.title')" :name="'variants'">
          <VariantsPanel :hypothesis-id="detail.id" :variants="detail.variants" @changed="refresh" />
        </el-tab-pane>

        <!-- Phase B.3: 执行任务 tab -->
        <el-tab-pane :name="'iterations'">
          <template #label>
            {{ t('hypothesis.iterations.tabLabel') }}
            <el-badge
              v-if="detail.iterations.length > 0"
              :value="detail.iterations.length"
              type="primary"
              class="tab-badge"
            />
          </template>
          <div class="iterations-tab">
            <div class="iterations-toolbar">
              <el-button type="primary" @click="openCreateIterationDialog">
                <el-icon><Plus /></el-icon>
                {{ t('hypothesis.iterations.create') }}
              </el-button>
              <span class="iterations-hint">
                {{ t('hypothesis.iterations.hint') }}
              </span>
            </div>
            <div v-if="detail.iterations.length === 0" class="iterations-empty">
              <el-empty :description="t('hypothesis.iterations.empty')" :image-size="80" />
            </div>
            <div v-else class="iterations-list">
              <el-card
                v-for="it in detail.iterations"
                :key="it.id"
                class="iteration-card"
                shadow="hover"
                @click="goIteration(it)"
              >
                <div class="iteration-card-header">
                  <h4 class="iteration-name">{{ it.name }}</h4>
                  <el-tag :type="iterationStatusTag(it.status)" size="small">
                    {{ iterationStatusLabel(it.status) }}
                  </el-tag>
                </div>
                <div class="iteration-meta">
                  <span>
                    <el-icon><Box /></el-icon>
                    {{ t('hypothesis.iterations.feedCount', { count: it.feedCount }) }}
                  </span>
                  <span>{{ formatIterationDate(it.createdAt) }}</span>
                </div>
              </el-card>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="t('hypothesis.tree.title')" name="tree">
          <HypothesisTreeView :hypothesis-id="detail.id" />
        </el-tab-pane>

        <el-tab-pane :label="t('hypothesis.detail.learningsTab')" name="learnings">
          <div v-if="detail.learnings.length === 0">
            <el-empty :description="t('common.empty')" />
          </div>
          <div v-else>
            <el-card v-for="l in detail.learnings" :key="l.id" class="learning-card" shadow="never">
              <template #header>
                <el-tag v-if="l.source === 'AI_GENERATED'" type="primary" size="small">AI</el-tag>
                <el-tag v-else type="info" size="small">{{ t('learning.source.HUMAN') }}</el-tag>
                <span class="learning-time">{{ new Date(l.createdAt).toLocaleString() }}</span>
              </template>
              <MarkdownRenderer :content="l.content" />
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- Close dialog -->
      <el-dialog v-model="showCloseDialog" :title="t('hypothesis.close.title')" width="520px">
        <!-- Phase C.1: 任务完成提示 banner -->
        <el-alert
          v-if="doneIteration"
          type="success"
          :closable="false"
          show-icon
          class="close-dialog-banner"
        >
          <template #title>
            {{ t('hypothesis.close.iterationDoneBanner', { name: doneIteration.name }) }}
          </template>
        </el-alert>
        <el-form :model="closeForm" label-position="top">
          <el-form-item :label="t('hypothesis.close.metricType')" required>
            <el-select v-model="closeForm.metricType" style="width: 100%">
              <el-option :label="t('hypothesis.metricType.conversion_rate')" value="conversion_rate" />
              <el-option :label="t('hypothesis.metricType.count')" value="count" />
              <el-option :label="t('hypothesis.metricType.revenue_cny')" value="revenue_cny" />
              <el-option :label="t('hypothesis.metricType.duration_seconds')" value="duration_seconds" />
              <el-option :label="t('hypothesis.metricType.score')" value="score" />
              <el-option :label="t('hypothesis.metricType.custom')" value="custom" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('hypothesis.close.metricName')" required>
            <el-input v-model="closeForm.metricName" />
          </el-form-item>
          <el-form-item :label="t('hypothesis.close.baseline')" required>
            <el-input-number v-model="closeForm.baseline" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('hypothesis.close.actual')" required>
            <el-input-number v-model="closeForm.actual" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('hypothesis.close.unit')">
            <el-input v-model="closeForm.unit" placeholder="%" />
          </el-form-item>
          <el-form-item :label="t('hypothesis.close.conclusion')" required>
            <el-radio-group v-model="closeForm.conclusion">
              <el-radio value="WIN">{{ t('hypothesis.conclusion.WIN') }}</el-radio>
              <el-radio value="LOSS">{{ t('hypothesis.conclusion.LOSS') }}</el-radio>
              <el-radio value="FLAT">{{ t('hypothesis.conclusion.FLAT') }}</el-radio>
              <el-radio value="INCONCLUSIVE">{{ t('hypothesis.conclusion.INCONCLUSIVE') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('hypothesis.close.humanNote')">
            <el-input v-model="closeForm.humanNote" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCloseDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="closing" @click="handleClose">{{ t('common.confirm') }}</el-button>
        </template>
      </el-dialog>

      <!-- ICE dialog -->
      <el-dialog v-model="showIceDialog" :title="'ICE ' + t('hypothesis.scoring.title')" width="420px">
        <el-form :model="iceForm" label-position="top">
          <el-form-item :label="t('hypothesis.scoring.impact') + ' (1-10)'">
            <el-slider v-model="iceForm.iceImpact" :min="1" :max="10" show-input />
          </el-form-item>
          <el-form-item :label="t('hypothesis.scoring.confidence') + ' (1-10)'">
            <el-slider v-model="iceForm.iceConfidence" :min="1" :max="10" show-input />
          </el-form-item>
          <el-form-item :label="t('hypothesis.scoring.ease') + ' (1-10)'">
            <el-slider v-model="iceForm.iceEase" :min="1" :max="10" show-input />
          </el-form-item>
          <div class="ice-preview">
            {{ t('hypothesis.scoring.icePreview') }}: <strong>{{ icePreview }}</strong>
          </div>
        </el-form>
        <template #footer>
          <el-button @click="showIceDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleSaveIce">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>

      <!-- Phase B.3: Create Iteration dialog -->
      <el-dialog
        v-model="showCreateIterationDialog"
        :title="t('hypothesis.iterations.createTitle')"
        width="480px"
      >
        <el-form :model="iterationForm" label-position="top">
          <el-form-item :label="t('hypothesis.iterations.taskName')" required>
            <el-input
              v-model="iterationForm.name"
              :placeholder="iterationDefaultName"
            />
          </el-form-item>
          <div class="iteration-dialog-hint">
            {{ t('hypothesis.iterations.projectHint') }}
          </div>
        </el-form>
        <template #footer>
          <el-button @click="showCreateIterationDialog = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button
            type="primary"
            :loading="creatingIteration"
            @click="handleCreateIteration"
          >
            {{ t('common.create') }}
          </el-button>
        </template>
      </el-dialog>

      <!-- RICE dialog (G9 + Fix 7) -->
      <el-dialog v-model="showRiceDialog" :title="'RICE ' + t('hypothesis.scoring.title')" width="440px">
        <el-form :model="riceForm" label-position="top">
          <el-form-item :label="t('hypothesis.scoring.reach')">
            <el-input-number v-model="riceForm.riceReach" :min="0" :step="100" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('hypothesis.scoring.impact')">
            <el-radio-group v-model="riceForm.riceImpact">
              <el-radio-button :value="0.25">0.25</el-radio-button>
              <el-radio-button :value="0.5">0.5</el-radio-button>
              <el-radio-button :value="1">1</el-radio-button>
              <el-radio-button :value="2">2</el-radio-button>
              <el-radio-button :value="3">3</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('hypothesis.scoring.confidence') + ' (%)'">
            <el-radio-group v-model="riceForm.riceConfidence">
              <el-radio-button :value="50">50%</el-radio-button>
              <el-radio-button :value="80">80%</el-radio-button>
              <el-radio-button :value="100">100%</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('hypothesis.scoring.effort')">
            <el-input-number v-model="riceForm.riceEffort" :min="0.25" :step="0.25" style="width: 100%" />
          </el-form-item>
          <div class="ice-preview">
            {{ t('hypothesis.scoring.ricePreview') }}: <strong>{{ ricePreview }}</strong>
          </div>
        </el-form>
        <template #footer>
          <el-button @click="showRiceDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="handleSaveRice">{{ t('common.save') }}</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Check, Plus, Box } from '@element-plus/icons-vue'
import { useHypothesisStore } from '@/stores/hypothesis'
import type {
  HypothesisStatus,
  ResultConclusion,
  IterationBrief,
} from '@/api/hypothesis'
import MarkdownRenderer from '@/components/learning/MarkdownRenderer.vue'
import VariantsPanel from '@/components/learning/VariantsPanel.vue'
import HypothesisTreeView from '@/components/learning/HypothesisTreeView.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const store = useHypothesisStore()

const loading = computed(() => store.loading)
const detail = computed(() => store.currentDetail)
const activeTab = ref('overview')

const canClose = computed(() => {
  if (!detail.value) return false
  return ['BACKLOG', 'RUNNING'].includes(detail.value.status)
})

// Phase C.1: 找出最近一个 DONE iteration（如果有）作为 banner 依据
const doneIteration = computed(() => {
  if (!detail.value) return null
  const done = detail.value.iterations.filter((it) => it.status === 'DONE')
  if (done.length === 0) return null
  // 返回最新的
  return done.sort((a, b) => b.createdAt - a.createdAt)[0]
})

function statusTagType(s: HypothesisStatus): 'success' | 'warning' | 'danger' | 'info' | '' {
  if (s === 'CLOSED_WIN') return 'success'
  if (s === 'CLOSED_LOSS') return 'danger'
  if (s === 'CLOSED_FLAT' || s === 'ABANDONED') return 'info'
  if (s === 'RUNNING') return 'warning'
  return ''
}

function conclusionTag(c: ResultConclusion): 'success' | 'warning' | 'danger' | 'info' {
  if (c === 'WIN') return 'success'
  if (c === 'LOSS') return 'danger'
  if (c === 'FLAT') return 'info'
  return 'warning'
}

function deltaClass(delta: number): string {
  if (delta > 0) return 'delta-positive'
  if (delta < 0) return 'delta-negative'
  return ''
}

async function refresh() {
  const id = route.params.id as string
  await store.fetchDetail(id)
}

// ============ Close ============
const showCloseDialog = ref(false)
const closing = ref(false)
const closeForm = reactive({
  metricType: 'conversion_rate',
  metricName: '',
  baseline: 0,
  actual: 0,
  unit: '%',
  conclusion: 'WIN' as ResultConclusion,
  humanNote: '',
})

// Phase C.1: 打开 close dialog 时预填（从 hypothesis 可知的字段）
function openCloseDialog() {
  if (!detail.value) return
  // metricName 如果 hypothesis 的 expectedImpactUnit 存在就用它，否则留空让用户填
  closeForm.metricName = detail.value.expectedImpactUnit ?? ''
  // expectedImpactValue 可作为 actual 提示值
  if (detail.value.expectedImpactValue != null) {
    closeForm.actual = detail.value.expectedImpactValue
  }
  // 如果有胜出 variant，用它的 conversionRate 作为 actual 更精确
  const winner = detail.value.variants.find((v) => v.isWinner)
  if (winner && winner.conversionRate != null) {
    closeForm.actual = winner.conversionRate * 100
  }
  showCloseDialog.value = true
}

async function handleClose() {
  if (!detail.value) return
  closing.value = true
  try {
    const result = await store.close(detail.value.id, {
      metricType: closeForm.metricType,
      metricName: closeForm.metricName,
      baseline: closeForm.baseline,
      actual: closeForm.actual,
      unit: closeForm.unit,
      conclusion: closeForm.conclusion,
      humanNote: closeForm.humanNote,
    })
    if (result) {
      ElMessage.success(t('hypothesis.close.success'))
      showCloseDialog.value = false
      if (result.copilotStatus === 'pending') {
        ElMessage.info(t('hypothesis.close.aiPending'))
        // Fix 7: 前端轮询 AI learning
        startPollingForLearning()
      }
    }
  } finally {
    closing.value = false
  }
}

// ============ Poll for AI learning after close (D18 前端轮询) ============
let pollingTimer: ReturnType<typeof setInterval> | null = null
const MAX_POLL_ATTEMPTS = 10

function startPollingForLearning() {
  if (!detail.value) return
  let attempts = 0
  const initialLearningCount = detail.value.learnings.length
  stopPolling()
  pollingTimer = setInterval(async () => {
    attempts += 1
    await refresh()
    // 只要 learning 计数涨了，或 10 次后停止
    if (
      (detail.value && detail.value.learnings.length > initialLearningCount) ||
      attempts >= MAX_POLL_ATTEMPTS
    ) {
      stopPolling()
    }
  }, 3000)
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// ============ ICE scoring ============
const showIceDialog = ref(false)
const iceForm = reactive({
  iceImpact: 5,
  iceConfidence: 5,
  iceEase: 5,
})
const icePreview = computed(
  () => ((iceForm.iceImpact * iceForm.iceConfidence * iceForm.iceEase) / 10).toFixed(1),
)

async function handleSaveIce() {
  if (!detail.value) return
  const result = await store.updateIce(detail.value.id, {
    iceImpact: iceForm.iceImpact,
    iceConfidence: iceForm.iceConfidence,
    iceEase: iceForm.iceEase,
  })
  if (result) {
    ElMessage.success(t('hypothesis.scoring.iceSaved'))
    showIceDialog.value = false
  }
}

// ============ RICE scoring (Fix 7) ============
const showRiceDialog = ref(false)
const riceForm = reactive({
  riceReach: 100,
  riceImpact: 1 as 0.25 | 0.5 | 1 | 2 | 3,
  riceConfidence: 80 as 50 | 80 | 100,
  riceEffort: 1,
})
const ricePreview = computed(() => {
  const { riceReach: r, riceImpact: i, riceConfidence: c, riceEffort: e } = riceForm
  if (!e || e <= 0) return '—'
  return ((r * i * (c / 100)) / e).toFixed(1)
})

async function handleSaveRice() {
  if (!detail.value) return
  const result = await store.updateRice(detail.value.id, {
    riceReach: riceForm.riceReach,
    riceImpact: riceForm.riceImpact,
    riceConfidence: riceForm.riceConfidence,
    riceEffort: riceForm.riceEffort,
  })
  if (result) {
    ElMessage.success(t('hypothesis.scoring.riceSaved'))
    showRiceDialog.value = false
  }
}

// ============ Phase B.3: Create Iteration ============
const showCreateIterationDialog = ref(false)
const creatingIteration = ref(false)
const iterationForm = reactive({
  name: '',
})

const iterationDefaultName = computed(() => {
  if (!detail.value) return ''
  return `${detail.value.statement.slice(0, 40)} · 执行`
})

function openCreateIterationDialog() {
  iterationForm.name = ''
  showCreateIterationDialog.value = true
}

async function handleCreateIteration() {
  if (!detail.value) return
  creatingIteration.value = true
  try {
    const created = await store.createIterationForHypothesis(detail.value.id, {
      name: iterationForm.name || iterationDefaultName.value,
    })
    if (created) {
      ElMessage.success(t('hypothesis.iterations.created'))
      showCreateIterationDialog.value = false
      await refresh()
    }
  } finally {
    creatingIteration.value = false
  }
}

function goIteration(it: IterationBrief) {
  // 跳到任务 board 页面
  if (it.boardId) {
    router.push(`/tasks/${it.boardId}`)
  } else {
    router.push(`/tasks`)
  }
}

function iterationStatusTag(
  s: string,
): 'success' | 'warning' | 'danger' | 'info' | '' {
  switch (s) {
    case 'DONE':
      return 'success'
    case 'IMPLEMENT':
    case 'ACCEPT':
      return 'warning'
    case 'SPEC':
    case 'DESIGN':
    case 'REFINE':
      return ''
    default:
      return 'info'
  }
}

function iterationStatusLabel(s: string): string {
  const map: Record<string, string> = {
    SPEC: '① 定规范',
    DESIGN: '② 生成设计',
    REFINE: '③ UI 精修',
    IMPLEMENT: '④ 实施',
    ACCEPT: '⑤ 验收',
    DONE: '⑥ 完成',
  }
  return map[s] ?? s
}

function formatIterationDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(async () => {
  await refresh()
  // Phase C.2: URL query 带 action=close 时自动打开 close dialog
  if (route.query.action === 'close' && canClose.value) {
    openCloseDialog()
  }
})

// 组件卸载时清理轮询
import { onBeforeUnmount } from 'vue'
onBeforeUnmount(stopPolling)
void router
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints' as *;

.hypothesis-detail-page {
  padding: var(--aipm-spacing-lg);
  max-width: 1200px;
  margin: 0 auto;

  @include mobile {
    padding: var(--aipm-spacing-md);
  }
}

.breadcrumb {
  margin-bottom: var(--aipm-spacing-md);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--aipm-spacing-md);
  margin-bottom: var(--aipm-spacing-lg);
  padding-bottom: var(--aipm-spacing-md);
  border-bottom: 1px solid var(--aipm-border-light);

  @include mobile {
    flex-direction: column;
  }
}

.detail-title {
  font-size: var(--aipm-font-size-2xl);
  font-weight: var(--aipm-font-weight-semibold);
  margin: var(--aipm-spacing-sm) 0 var(--aipm-spacing-xs);
  line-height: 1.4;
}

.detail-meta {
  font-size: var(--aipm-font-size-base);
  color: var(--aipm-text-secondary);
  margin: 0;
}

.card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--aipm-spacing-md);

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.info-card {
  small {
    display: block;
    color: var(--aipm-text-secondary);
    margin-top: 4px;
    font-size: var(--aipm-font-size-xs);
  }
}

.delta-positive {
  color: var(--aipm-color-success);
}
.delta-negative {
  color: var(--aipm-color-danger);
}

.ice-preview {
  padding: var(--aipm-spacing-sm);
  background: var(--aipm-bg-muted);
  border-radius: var(--aipm-radius-sm);
  text-align: center;
  font-size: var(--aipm-font-size-md);

  strong {
    font-size: var(--aipm-font-size-2xl);
    color: var(--aipm-color-primary);
  }
}

.learning-card {
  margin-bottom: var(--aipm-spacing-md);
}

// Phase B.3: Iteration tab
.iterations-tab {
  padding: var(--aipm-spacing-sm) 0;
}

.iterations-toolbar {
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-md);
  margin-bottom: var(--aipm-spacing-md);

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--aipm-spacing-sm);
  }
}

.iterations-hint {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  line-height: var(--aipm-line-height-base);
}

.iterations-empty {
  padding: var(--aipm-spacing-2xl) 0;
}

.iterations-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--aipm-spacing-md);
}

.iteration-card {
  cursor: pointer;
  transition: transform 0.15s;

  &:hover {
    transform: translateY(-2px);
  }
}

.iteration-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-sm);
}

.iteration-name {
  font-size: var(--aipm-font-size-md);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-primary);
  margin: 0;
  line-height: var(--aipm-line-height-tight);
}

.iteration-meta {
  display: flex;
  justify-content: space-between;
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);

  .el-icon {
    vertical-align: middle;
    margin-right: 4px;
  }
}

.tab-badge {
  margin-left: 6px;
}

.iteration-dialog-hint {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  line-height: var(--aipm-line-height-base);
  margin-top: var(--aipm-spacing-sm);
  padding: var(--aipm-spacing-sm);
  background: var(--aipm-bg-muted);
  border-radius: var(--aipm-radius-sm);
}

// Phase C.1: close dialog banner
.close-dialog-banner {
  margin-bottom: var(--aipm-spacing-md);
}

.learning-time {
  color: var(--aipm-text-secondary);
  margin-left: var(--aipm-spacing-sm);
  font-size: var(--aipm-font-size-sm);
}
</style>
