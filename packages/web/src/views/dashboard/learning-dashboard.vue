<template>
  <div class="learning-dashboard-page">
    <!-- Page header -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">{{ t('dashboard.title') }}</h1>
        <p class="page-subtitle">
          {{ t('dashboard.learningVelocity') }}:
          <strong>{{ summary?.learningVelocity ?? 0 }}</strong>
          &nbsp;·&nbsp;
          {{ t('dashboard.winRate') }}:
          <strong>{{ winRateDisplay }}</strong>
        </p>
      </div>
      <div class="header-right">
        <el-button
          v-if="isAdmin"
          size="default"
          @click="handleManualDigest"
          :loading="digestLoading"
        >
          <el-icon><Refresh /></el-icon>
          {{ t('copilot.regenerate') }}
        </el-button>
      </div>
    </div>

    <div v-loading="loading" class="dashboard-grid">
      <!-- Left: KRs + hypothesis buckets -->
      <div class="dashboard-main">
        <!-- Active KRs -->
        <section class="dashboard-section">
          <h2 class="section-title">
            <el-icon><Aim /></el-icon>
            {{ t('dashboard.activeKRs') }}
          </h2>

          <el-empty
            v-if="!loading && activeKRs.length === 0"
            :description="t('common.empty')"
            :image-size="80"
          />

          <div v-else class="kr-list">
            <div
              v-for="kr in activeKRs"
              :key="kr.id"
              class="kr-card clickable"
              :class="`status-${kr.progressStatus}`"
              @click="goKrDetail(kr.id)"
            >
              <div class="kr-header">
                <div class="kr-title">
                  <span class="kr-objective">{{ kr.objectiveName }}</span>
                  <span class="kr-arrow">›</span>
                  <strong>{{ kr.name }}</strong>
                </div>
                <el-tag
                  :type="progressStatusTagType(kr.progressStatus)"
                  size="small"
                  effect="light"
                >
                  {{ t(`dashboard.progress.${progressStatusKey(kr.progressStatus)}`) }}
                </el-tag>
              </div>

              <div class="kr-progress">
                <div class="kr-progress-bar">
                  <div
                    class="kr-progress-fill"
                    :class="`status-${kr.progressStatus}`"
                    :style="{ width: Math.min(100, kr.kpiProgressRatio * 100) + '%' }"
                  />
                </div>
                <div class="kr-progress-label">
                  {{ kr.currentValue }}{{ kr.unit }}
                  /
                  {{ kr.targetValue }}{{ kr.unit }}
                  <span class="kr-progress-percent">({{ Math.round(kr.kpiProgressRatio * 100) }}%)</span>
                </div>
              </div>

              <div class="kr-meta">
                <span v-if="kr.isStagnant" class="kr-stagnant">
                  <el-icon><Warning /></el-icon>
                  {{ t('dashboard.stagnant', { days: stagnantDays(kr.lastHypothesisAt) }) }}
                </span>
                <span v-if="kr.daysLeft !== null" class="kr-days-left">
                  {{ t('dashboard.daysLeft', { days: kr.daysLeft }) }}
                </span>
                <span class="kr-contribution">
                  {{ t('dashboard.hypothesisCount', { count: kr.contributionHypothesisCount }) }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- This Week Hypotheses -->
        <section class="dashboard-section">
          <h2 class="section-title">
            <el-icon><Calendar /></el-icon>
            {{ t('dashboard.thisWeek') }}
          </h2>

          <div class="hypothesis-buckets">
            <div class="bucket">
              <div class="bucket-header running">
                {{ t('dashboard.running') }}
                <span class="bucket-count">{{ thisWeek.running.length }}</span>
              </div>
              <div class="bucket-body">
                <HypothesisBucketItem
                  v-for="h in thisWeek.running"
                  :key="h.id"
                  :hypothesis="h"
                  @click="goDetail(h.id)"
                />
                <el-empty
                  v-if="thisWeek.running.length === 0"
                  :image-size="40"
                  :description="t('common.empty')"
                />
              </div>
            </div>

            <div class="bucket">
              <div class="bucket-header won">
                {{ t('dashboard.closedWins') }}
                <span class="bucket-count">{{ thisWeek.closedWins.length }}</span>
              </div>
              <div class="bucket-body">
                <HypothesisBucketItem
                  v-for="h in thisWeek.closedWins"
                  :key="h.id"
                  :hypothesis="h"
                  @click="goDetail(h.id)"
                />
                <el-empty
                  v-if="thisWeek.closedWins.length === 0"
                  :image-size="40"
                  :description="t('common.empty')"
                />
              </div>
            </div>

            <div class="bucket">
              <div class="bucket-header lost">
                {{ t('dashboard.closedLosses') }}
                <span class="bucket-count">{{ thisWeek.closedLosses.length }}</span>
              </div>
              <div class="bucket-body">
                <HypothesisBucketItem
                  v-for="h in thisWeek.closedLosses"
                  :key="h.id"
                  :hypothesis="h"
                  @click="goDetail(h.id)"
                />
                <el-empty
                  v-if="thisWeek.closedLosses.length === 0"
                  :image-size="40"
                  :description="t('common.empty')"
                />
              </div>
            </div>

            <div class="bucket">
              <div class="bucket-header backlog">
                {{ t('dashboard.backlog') }}
                <span class="bucket-count">{{ thisWeek.backlog.length }}</span>
              </div>
              <div class="bucket-body">
                <HypothesisBucketItem
                  v-for="h in thisWeek.backlog"
                  :key="h.id"
                  :hypothesis="h"
                  @click="goDetail(h.id)"
                />
                <el-empty
                  v-if="thisWeek.backlog.length === 0"
                  :image-size="40"
                  :description="t('common.empty')"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Right: Copilot panel -->
      <aside class="dashboard-copilot">
        <CopilotPanel :digest="latestDigest" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Aim, Calendar, Refresh, Warning } from '@element-plus/icons-vue'
import { useLearningDashboardStore } from '@/stores/learning-dashboard'
import { useAuthStore } from '@/stores/auth'
import HypothesisBucketItem from '@/components/learning/HypothesisBucketItem.vue'
import CopilotPanel from '@/components/learning/CopilotPanel.vue'

const { t } = useI18n()
const router = useRouter()
const store = useLearningDashboardStore()
const authStore = useAuthStore()

const loading = computed(() => store.loading)
const activeKRs = computed(() => store.data?.activeKRs ?? [])
const thisWeek = computed(
  () =>
    store.data?.thisWeekHypotheses ?? {
      running: [],
      closedWins: [],
      closedLosses: [],
      backlog: [],
    },
)
const summary = computed(() => store.data?.summary)
const latestDigest = computed(() => store.data?.latestCopilotDigest ?? null)
const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

const winRateDisplay = computed(() => {
  if (!summary.value) return '—'
  return `${Math.round(summary.value.winRate * 100)}%`
})

const digestLoading = ref(false)

async function handleManualDigest() {
  digestLoading.value = true
  try {
    const ok = await store.triggerDigest('global')
    if (ok) {
      ElMessage.success(t('hypothesis.close.triggered'))
    }
  } finally {
    digestLoading.value = false
  }
}

function progressStatusTagType(status: string): 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'on_track':
      return 'success'
    case 'behind':
      return 'warning'
    case 'critical':
      return 'danger'
    default:
      return 'warning'
  }
}

// 后端返回 snake_case，locale 用 camelCase，此处 map
function progressStatusKey(status: string): string {
  const map: Record<string, string> = {
    on_track: 'onTrack',
    behind: 'behind',
    critical: 'critical',
  }
  return map[status] ?? status
}

function stagnantDays(lastAt: number | null): number {
  if (!lastAt) return 0
  return Math.floor((Date.now() - lastAt) / 86400000)
}

function goDetail(id: string) {
  router.push(`/hypotheses/${id}`)
}

// Phase E.3: KR 卡片可点击
function goKrDetail(krId: string) {
  router.push(`/dashboard/kr/${krId}`)
}

onMounted(() => {
  store.fetch({ scope: isAdmin.value ? 'all' : 'mine' })
})
</script>

<script lang="ts">
import { ref } from 'vue'
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints' as *;

.learning-dashboard-page {
  padding: var(--aipm-spacing-lg);
  max-width: 1400px;
  margin: 0 auto;

  @include mobile {
    padding: var(--aipm-spacing-md);
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--aipm-spacing-lg);
  gap: var(--aipm-spacing-md);

  @include mobile {
    flex-direction: column;
    align-items: stretch;
  }
}

.page-title {
  font-size: var(--aipm-font-size-4xl);
  font-weight: var(--aipm-font-weight-bold);
  color: var(--aipm-text-primary);
  margin: 0 0 var(--aipm-spacing-xs);
}

.page-subtitle {
  font-size: var(--aipm-font-size-base);
  color: var(--aipm-text-secondary);
  margin: 0;

  strong {
    color: var(--aipm-text-primary);
    font-weight: var(--aipm-font-weight-semibold);
  }
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--aipm-spacing-lg);

  @include mobile-tablet {
    grid-template-columns: 1fr;
  }
}

.dashboard-main {
  display: flex;
  flex-direction: column;
  gap: var(--aipm-spacing-lg);
}

.dashboard-copilot {
  @include mobile-tablet {
    order: -1;
  }
}

.dashboard-section {
  background: var(--aipm-bg-surface);
  border: 1px solid var(--aipm-border-light);
  border-radius: var(--aipm-radius-lg);
  padding: var(--aipm-spacing-lg);
  box-shadow: var(--aipm-shadow-sm);
}

.section-title {
  font-size: var(--aipm-font-size-xl);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-primary);
  margin: 0 0 var(--aipm-spacing-md);
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-sm);
}

// KR cards
.kr-list {
  display: flex;
  flex-direction: column;
  gap: var(--aipm-spacing-md);
}

.kr-card {
  border: 1px solid var(--aipm-border-light);
  border-left: 4px solid var(--aipm-text-secondary);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-md);
  transition: box-shadow 0.15s;

  &.clickable {
    cursor: pointer;
    &:hover { box-shadow: var(--aipm-shadow-md); }
  }

  &.status-on_track {
    border-left-color: var(--aipm-color-success);
  }
  &.status-behind {
    border-left-color: var(--aipm-color-warning);
  }
  &.status-critical {
    border-left-color: var(--aipm-color-danger);
  }
}

.kr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--aipm-spacing-sm);

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--aipm-spacing-xs);
  }
}

.kr-title {
  font-size: var(--aipm-font-size-md);
  color: var(--aipm-text-regular);

  strong {
    color: var(--aipm-text-primary);
    font-weight: var(--aipm-font-weight-semibold);
  }
}

.kr-objective {
  color: var(--aipm-text-secondary);
}

.kr-arrow {
  margin: 0 6px;
  color: var(--aipm-text-placeholder);
}

.kr-progress {
  margin: var(--aipm-spacing-sm) 0;
}

.kr-progress-bar {
  background: var(--aipm-border-lighter);
  border-radius: 100px;
  height: 8px;
  overflow: hidden;
  margin-bottom: var(--aipm-spacing-xs);
}

.kr-progress-fill {
  height: 100%;
  background: var(--aipm-color-info);
  transition: width 0.3s ease;

  &.status-on_track {
    background: var(--aipm-color-success);
  }
  &.status-behind {
    background: var(--aipm-color-warning);
  }
  &.status-critical {
    background: var(--aipm-color-danger);
  }
}

.kr-progress-label {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-regular);
}

.kr-progress-percent {
  color: var(--aipm-text-secondary);
  margin-left: 4px;
}

.kr-meta {
  display: flex;
  gap: var(--aipm-spacing-md);
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  flex-wrap: wrap;

  .kr-stagnant {
    color: var(--aipm-color-danger);
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

// Hypothesis buckets
.hypothesis-buckets {
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

.bucket {
  background: var(--aipm-bg-subtle);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-sm);
  min-height: 100px;
}

.bucket-header {
  font-size: var(--aipm-font-size-base);
  font-weight: var(--aipm-font-weight-semibold);
  padding: 6px var(--aipm-spacing-sm);
  border-radius: var(--aipm-radius-sm);
  margin-bottom: var(--aipm-spacing-sm);
  display: flex;
  justify-content: space-between;
  align-items: center;

  &.running {
    background: var(--aipm-bg-primary-soft);
    color: var(--aipm-color-primary);
  }
  &.won {
    background: var(--aipm-bg-success-soft);
    color: var(--aipm-color-success);
  }
  &.lost {
    background: var(--aipm-bg-danger-soft);
    color: var(--aipm-color-danger);
  }
  &.backlog {
    background: var(--aipm-bg-info-soft);
    color: var(--aipm-color-info);
  }
}

.bucket-count {
  background: rgba(0, 0, 0, 0.1);
  color: var(--aipm-text-regular);
  font-size: var(--aipm-font-size-xs);
  padding: 1px 8px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.bucket-body {
  display: flex;
  flex-direction: column;
  gap: var(--aipm-spacing-xs);
}
</style>
