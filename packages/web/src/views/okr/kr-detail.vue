<template>
  <div v-loading="loading" class="kr-detail-page">
    <template v-if="kr">
      <el-breadcrumb class="breadcrumb">
        <el-breadcrumb-item :to="{ path: '/dashboard' }">{{ t('dashboard.title') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ kr.name }}</el-breadcrumb-item>
      </el-breadcrumb>

      <!-- Header -->
      <div class="kr-header">
        <div class="kr-header-left">
          <div class="kr-objective-tag">{{ t('okr.direction') }}: {{ kr.objective.name }}</div>
          <h1 class="kr-title">{{ kr.name }}</h1>
          <div class="kr-progress-summary">
            {{ kr.currentValue }}{{ kr.unit }} / {{ kr.targetValue }}{{ kr.unit }}
            <span class="kr-progress-pct">({{ Math.round(kr.kpiProgressRatio * 100) }}%)</span>
            <el-tag v-if="kr.daysLeft !== null" size="small" effect="plain" type="info">
              {{ t('dashboard.daysLeft', { days: kr.daysLeft }) }}
            </el-tag>
          </div>
        </div>
        <div class="kr-header-right">
          <el-button type="primary" @click="goCreateHypothesis">
            <el-icon><Plus /></el-icon>
            {{ t('hypothesis.iterations.create').replace('执行任务', '假设') }}
          </el-button>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="kr-progress-bar">
        <div
          class="kr-progress-fill"
          :class="progressClass"
          :style="{ width: Math.min(100, kr.kpiProgressRatio * 100) + '%' }"
        />
      </div>

      <!-- Hypothesis kanban -->
      <section class="kr-section">
        <h2 class="section-title">
          {{ t('hypothesis.title') }} ({{ kr.hypothesisStats.total }})
        </h2>
        <div class="hypothesis-kanban">
          <div class="kanban-col">
            <div class="kanban-header backlog">
              {{ t('dashboard.backlog') }}
              <span class="kanban-count">{{ backlogList.length }}</span>
            </div>
            <div v-for="h in backlogList" :key="h.id" class="kanban-item" @click="goHypothesis(h.id)">
              <div class="kanban-statement">{{ h.statement }}</div>
              <div class="kanban-meta">{{ h.ownerName }}</div>
            </div>
          </div>
          <div class="kanban-col">
            <div class="kanban-header running">
              {{ t('dashboard.running') }}
              <span class="kanban-count">{{ runningList.length }}</span>
            </div>
            <div v-for="h in runningList" :key="h.id" class="kanban-item" @click="goHypothesis(h.id)">
              <div class="kanban-statement">{{ h.statement }}</div>
              <div class="kanban-meta">{{ h.ownerName }}</div>
            </div>
          </div>
          <div class="kanban-col">
            <div class="kanban-header won">
              {{ t('dashboard.closedWins') }}
              <span class="kanban-count">{{ wonList.length }}</span>
            </div>
            <div v-for="h in wonList" :key="h.id" class="kanban-item" @click="goHypothesis(h.id)">
              <div class="kanban-statement">{{ h.statement }}</div>
              <div class="kanban-meta">
                <span class="delta-positive" v-if="h.result">+{{ h.result.delta }}</span>
                {{ h.ownerName }}
              </div>
            </div>
          </div>
          <div class="kanban-col">
            <div class="kanban-header lost">
              {{ t('dashboard.closedLosses') }}
              <span class="kanban-count">{{ lostList.length }}</span>
            </div>
            <div v-for="h in lostList" :key="h.id" class="kanban-item" @click="goHypothesis(h.id)">
              <div class="kanban-statement">{{ h.statement }}</div>
              <div class="kanban-meta">{{ h.ownerName }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Iteration history -->
      <section v-if="kr.iterations.length > 0" class="kr-section">
        <h2 class="section-title">{{ t('hypothesis.tree.title') }}</h2>
        <el-timeline>
          <el-timeline-item
            v-for="it in kr.iterations"
            :key="it.id"
            :timestamp="new Date(it.createdAt).toLocaleDateString()"
            :type="it.isAchieved ? 'success' : 'info'"
          >
            <div>{{ it.changes }}</div>
            <div class="timeline-data">
              {{ it.dataFeedback }}{{ kr.unit }}
              <el-tag v-if="it.isAchieved" type="success" size="small">{{ t('hypothesis.conclusion.WIN') }}</el-tag>
            </div>
          </el-timeline-item>
        </el-timeline>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Plus } from '@element-plus/icons-vue'
import request from '@/api/request'

interface ApiResponse<T> {
  code: number
  data: T | null
}

interface KrHypothesisBrief {
  id: string
  statement: string
  status: string
  iceScore: number | null
  closedAt: number | null
  ownerName: string
  result: { delta: number; conclusion: string } | null
}

interface KrDetailData {
  id: string
  name: string
  targetValue: number
  currentValue: number
  baseline: number
  unit: string
  startDate: number
  endDate: number | null
  kpiProgressRatio: number
  daysLeft: number | null
  objective: { id: string; name: string; projectName: string | null }
  hypotheses: KrHypothesisBrief[]
  iterations: Array<{
    id: string
    roundNumber: number
    changes: string
    dataFeedback: number
    isAchieved: boolean
    createdAt: number
  }>
  hypothesisStats: {
    total: number
    running: number
    won: number
    lost: number
    winRate: number
  }
}

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const loading = ref(false)
const kr = ref<KrDetailData | null>(null)

const backlogList = computed(() =>
  kr.value?.hypotheses.filter((h) => h.status === 'BACKLOG') ?? [],
)
const runningList = computed(() =>
  kr.value?.hypotheses.filter((h) => h.status === 'RUNNING') ?? [],
)
const wonList = computed(() =>
  kr.value?.hypotheses.filter((h) => h.status === 'CLOSED_WIN') ?? [],
)
const lostList = computed(() =>
  kr.value?.hypotheses.filter((h) =>
    ['CLOSED_LOSS', 'CLOSED_FLAT'].includes(h.status),
  ) ?? [],
)

const progressClass = computed(() => {
  if (!kr.value) return ''
  const r = kr.value.kpiProgressRatio
  if (r >= 0.7) return 'fill-success'
  if (r >= 0.4) return 'fill-warning'
  return 'fill-danger'
})

async function fetchDetail() {
  loading.value = true
  try {
    const res = await request.get<ApiResponse<KrDetailData>>(
      `/okr/key-results/${route.params.id}`,
    )
    if (res.data.code === 0 && res.data.data) {
      kr.value = res.data.data
    }
  } finally {
    loading.value = false
  }
}

function goHypothesis(id: string) {
  router.push(`/hypotheses/${id}`)
}

function goCreateHypothesis() {
  if (!kr.value) return
  router.push({
    path: '/hypotheses',
    query: { adoptFrom: 'blank', krId: kr.value.id },
  })
}

onMounted(fetchDetail)
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints' as *;

.kr-detail-page {
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

.kr-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--aipm-spacing-lg);

  @include mobile {
    flex-direction: column;
    gap: var(--aipm-spacing-sm);
  }
}

.kr-objective-tag {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  margin-bottom: var(--aipm-spacing-xs);
}

.kr-title {
  font-size: var(--aipm-font-size-3xl);
  font-weight: var(--aipm-font-weight-bold);
  color: var(--aipm-text-primary);
  margin: 0 0 var(--aipm-spacing-xs);
}

.kr-progress-summary {
  font-size: var(--aipm-font-size-md);
  color: var(--aipm-text-regular);
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-sm);
}

.kr-progress-pct {
  color: var(--aipm-text-secondary);
}

.kr-progress-bar {
  background: var(--aipm-bg-page);
  border-radius: var(--aipm-radius-pill);
  height: 10px;
  overflow: hidden;
  margin-bottom: var(--aipm-spacing-lg);
}

.kr-progress-fill {
  height: 100%;
  transition: width 0.3s ease;

  &.fill-success { background: var(--aipm-color-success); }
  &.fill-warning { background: var(--aipm-color-warning); }
  &.fill-danger { background: var(--aipm-color-danger); }
}

.kr-section {
  margin-bottom: var(--aipm-spacing-xl);
}

.section-title {
  font-size: var(--aipm-font-size-xl);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-primary);
  margin: 0 0 var(--aipm-spacing-md);
}

.hypothesis-kanban {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--aipm-spacing-md);

  @include tablet {
    grid-template-columns: repeat(2, 1fr);
  }

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.kanban-col {
  background: var(--aipm-bg-subtle);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-sm);
  min-height: 120px;
}

.kanban-header {
  font-size: var(--aipm-font-size-base);
  font-weight: var(--aipm-font-weight-semibold);
  padding: var(--aipm-spacing-xs) var(--aipm-spacing-sm);
  border-radius: var(--aipm-radius-sm);
  margin-bottom: var(--aipm-spacing-sm);
  display: flex;
  justify-content: space-between;

  &.backlog { background: var(--aipm-bg-info-soft); color: var(--aipm-color-info); }
  &.running { background: var(--aipm-bg-primary-soft); color: var(--aipm-color-primary); }
  &.won { background: var(--aipm-bg-success-soft); color: var(--aipm-color-success); }
  &.lost { background: var(--aipm-bg-danger-soft); color: var(--aipm-color-danger); }
}

.kanban-count {
  background: rgba(0, 0, 0, 0.1);
  color: var(--aipm-text-regular);
  font-size: var(--aipm-font-size-xs);
  padding: 1px 8px;
  border-radius: 10px;
}

.kanban-item {
  background: var(--aipm-bg-surface);
  border: 1px solid var(--aipm-border-light);
  border-radius: var(--aipm-radius-sm);
  padding: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-xs);
  cursor: pointer;
  transition: box-shadow 0.15s;

  &:hover {
    box-shadow: var(--aipm-shadow-md);
  }
}

.kanban-statement {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-primary);
  line-height: var(--aipm-line-height-base);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kanban-meta {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-text-secondary);
  margin-top: var(--aipm-spacing-xs);
}

.delta-positive {
  color: var(--aipm-color-success);
  font-weight: var(--aipm-font-weight-semibold);
  margin-right: 4px;
}

.timeline-data {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-regular);
  margin-top: 4px;
}
</style>
