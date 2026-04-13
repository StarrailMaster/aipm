<template>
  <div class="copilot-panel">
    <div class="copilot-header">
      <h3 class="copilot-title">
        <el-icon><MagicStick /></el-icon>
        {{ t('copilot.title') }}
      </h3>
      <!-- Fix 4: ADMIN 全局视图切换（D20） -->
      <el-switch
        v-if="isAdmin"
        v-model="showAllSquads"
        :active-text="t('copilot.showAllSquads')"
        size="small"
      />
    </div>

    <el-empty
      v-if="!digest"
      :description="t('common.empty')"
      :image-size="80"
      class="copilot-empty"
    />

    <template v-else>
      <!-- Alerts (highest priority) -->
      <section v-if="alerts.length > 0" class="copilot-section alerts-section">
        <h4 class="section-label">
          <el-icon><Warning /></el-icon>
          {{ t('copilot.alert') }}
        </h4>
        <div
          v-for="(alert, idx) in alerts"
          :key="idx"
          class="alert-item"
          :class="[`severity-${alert.severity}`, { 'other-squad': isOtherSquad(alert.squadId) }]"
        >
          <div class="alert-type">{{ t(`copilot.alerts.${alertTypeKey(alert.type)}`) }}</div>
          <div class="alert-message">{{ alert.message }}</div>
          <!-- Phase D.2: evidence hypothesis id 可点击 -->
          <div
            v-if="alert.evidenceHypothesisIds && alert.evidenceHypothesisIds.length > 0"
            class="evidence-tags"
          >
            <el-tag
              v-for="(eid, i) in alert.evidenceHypothesisIds"
              :key="eid"
              size="small"
              effect="plain"
              class="evidence-tag"
              @click.stop="goEvidence(eid)"
            >
              #{{ i + 1 }}
            </el-tag>
          </div>
          <div v-if="isOtherSquad(alert.squadId)" class="other-squad-tag">
            {{ t('copilot.otherSquad') }}
          </div>
        </div>
      </section>

      <!-- Patterns (killer feature) -->
      <section v-if="patterns.length > 0" class="copilot-section">
        <h4 class="section-label">
          <el-icon><Connection /></el-icon>
          {{ t('copilot.pattern') }}
        </h4>
        <div
          v-for="(pattern, idx) in patterns"
          :key="idx"
          class="pattern-item"
          :class="{ 'other-squad': !involvesMySquad(pattern.relatedSquadIds) }"
        >
          <div class="pattern-title">
            {{ pattern.title }}
            <el-tag
              size="small"
              :type="confidenceTagType(pattern.confidence)"
              effect="plain"
            >
              {{ pattern.confidence }}
            </el-tag>
            <el-tag
              v-if="!involvesMySquad(pattern.relatedSquadIds)"
              size="small"
              type="info"
              effect="plain"
            >
              {{ t('copilot.crossSquad') }}
            </el-tag>
          </div>
          <MarkdownRenderer :content="pattern.description" />
          <div class="pattern-recommendation">
            <el-icon><ArrowRight /></el-icon>
            {{ pattern.recommendation }}
          </div>
          <!-- Phase D.2: pattern evidence 可点击 -->
          <div
            v-if="pattern.evidenceHypothesisIds && pattern.evidenceHypothesisIds.length > 0"
            class="evidence-tags"
          >
            <span class="evidence-label">{{ t('copilot.evidence') }}:</span>
            <el-tag
              v-for="(eid, i) in pattern.evidenceHypothesisIds"
              :key="eid"
              size="small"
              effect="plain"
              type="primary"
              class="evidence-tag"
              @click.stop="goEvidence(eid)"
            >
              #{{ i + 1 }}
            </el-tag>
          </div>
        </div>
      </section>

      <!-- Next suggestions -->
      <section
        v-if="suggestions.length > 0"
        class="copilot-section"
      >
        <h4 class="section-label">
          <el-icon><Plus /></el-icon>
          {{ t('copilot.suggestion') }}
        </h4>
        <div
          v-for="(s, idx) in suggestions"
          :key="idx"
          class="suggestion-item"
          :class="{ 'other-squad': isOtherSquad(s.targetSquadId) }"
        >
          <div class="suggestion-statement">{{ s.statement }}</div>
          <div class="suggestion-mechanism">{{ s.mechanism }}</div>
          <div class="suggestion-impact">{{ s.expectedImpact }}</div>
          <!-- Phase D.1: 采纳此建议 CTA -->
          <div class="suggestion-actions">
            <el-button
              size="small"
              type="primary"
              plain
              @click="adoptSuggestion(s)"
            >
              <el-icon><Plus /></el-icon>
              {{ t('copilot.adopt') }}
            </el-button>
          </div>
        </div>
      </section>

      <!-- Learnings -->
      <section v-if="learnings.length > 0" class="copilot-section">
        <h4 class="section-label">
          <el-icon><Reading /></el-icon>
          {{ t('nav.learnings') }}
        </h4>
        <div
          v-for="(l, idx) in learnings"
          :key="idx"
          class="learning-item"
          :class="{ 'other-squad': isOtherSquad(l.squadId) }"
        >
          <MarkdownRenderer :content="l.text" />
        </div>
      </section>

      <!-- Timestamp -->
      <div class="copilot-timestamp">
        {{ formatTime(digest.createdAt) }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  MagicStick,
  Warning,
  Connection,
  Plus,
  Reading,
  ArrowRight,
} from '@element-plus/icons-vue'
import type {
  CopilotDigest,
  CopilotNextHypothesisSuggestion,
  CopilotAlert,
  CopilotPattern,
} from '@/api/copilot-dashboard'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const props = defineProps<{
  digest: CopilotDigest | null
}>()

// Phase D.1: 采纳 Copilot 建议 → 跳 /hypotheses 并预填新建 dialog
function adoptSuggestion(s: CopilotNextHypothesisSuggestion) {
  router.push({
    path: '/hypotheses',
    query: {
      adoptFrom: 'copilot',
      krId: s.krId,
      statement: s.statement,
      mechanism: s.mechanism,
      expectedImpact: s.expectedImpact,
    },
  })
}

// Phase D.2: 点击 evidence hypothesis id 跳假设详情
function goEvidence(hypothesisId: string) {
  router.push(`/hypotheses/${hypothesisId}`)
}

// 方便 template 里对 alert/pattern 类型做 guard
function _typeHelper(): {
  alert?: CopilotAlert
  pattern?: CopilotPattern
} {
  return {}
}
void _typeHelper

// Fix 4 (D20): 跨 squad 匿名化
// - 本组 evidence 可点，他组 evidence 灰化
// - ADMIN 可切换全局视图（showAllSquads=true 时不灰化任何条目）
const mySquadId = computed(() => authStore.user?.squadId ?? null)
const isAdmin = computed(() => authStore.user?.role === 'ADMIN')
const showAllSquads = ref(false)

function isOtherSquad(squadId: string | null | undefined): boolean {
  if (showAllSquads.value) return false // ADMIN 全局视图：都不灰
  if (!mySquadId.value) return false // 用户无 squad 绑定：不灰
  if (squadId == null) return false // 全局级条目：不灰
  return squadId !== mySquadId.value
}

function involvesMySquad(squadIds: string[] | null | undefined): boolean {
  if (showAllSquads.value) return true // ADMIN 全局视图：显示为本组
  if (!mySquadId.value || !squadIds || squadIds.length === 0) return true
  return squadIds.includes(mySquadId.value)
}

const alerts = computed(() => {
  const items = props.digest?.payload?.alerts ?? []
  // 非 ADMIN 且非全局视图：过滤掉他组 alerts（保留本组+全局）
  if (showAllSquads.value || isAdmin.value) return items
  return items.filter((a) => !a.squadId || a.squadId === mySquadId.value)
})

const patterns = computed(() => props.digest?.payload?.patterns ?? [])
const suggestions = computed(() => props.digest?.payload?.nextHypothesisSuggestions ?? [])
const learnings = computed(() => props.digest?.payload?.learnings ?? [])

function alertTypeKey(type: string): string {
  // 映射 snake_case 到 camelCase for i18n key
  const map: Record<string, string> = {
    stagnant_kr: 'stagnantKr',
    behind_schedule: 'behindSchedule',
    dead_direction: 'deadDirection',
    winning_streak: 'winningStreak',
    quota_exceeded: 'quotaExceeded',
  }
  return map[type] ?? 'stagnantKr'
}

function confidenceTagType(c: string): 'success' | 'warning' | 'info' {
  if (c === 'high') return 'success'
  if (c === 'medium') return 'warning'
  return 'info'
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return t('common.justNow')
  if (hours < 24) return t('common.hoursAgo', { hours })
  const days = Math.floor(hours / 24)
  return t('common.daysAgo', { days })
}
</script>

<style lang="scss" scoped>
.copilot-panel {
  background: var(--aipm-bg-surface);
  border: 1px solid var(--aipm-border-light);
  border-radius: var(--aipm-radius-lg);
  padding: var(--aipm-spacing-lg);
  box-shadow: var(--aipm-shadow-sm);
  position: sticky;
  top: var(--aipm-spacing-md);
  max-height: calc(100vh - 80px);
  overflow-y: auto;
}

.copilot-header {
  margin-bottom: var(--aipm-spacing-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--aipm-spacing-sm);
}

.copilot-title {
  font-size: var(--aipm-font-size-lg);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-sm);

  .el-icon {
    color: var(--aipm-color-primary);
  }
}

.copilot-empty {
  padding: var(--aipm-spacing-lg) 0;
}

.copilot-section {
  margin-bottom: var(--aipm-spacing-lg);

  &:last-child {
    margin-bottom: 0;
  }
}

.section-label {
  font-size: var(--aipm-font-size-sm);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-secondary);
  margin: 0 0 var(--aipm-spacing-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 4px;
}

// Alerts
.alert-item {
  background: var(--aipm-surface-warning-tint);
  border-left: 3px solid var(--aipm-color-warning);
  border-radius: 4px;
  padding: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-sm);

  &.severity-critical {
    background: var(--aipm-surface-danger-tint);
    border-left-color: var(--aipm-color-danger);
  }
  &.severity-info {
    background: var(--aipm-surface-info-tint);
    border-left-color: var(--aipm-color-info);
  }
}

.alert-type {
  font-size: var(--aipm-font-size-xs);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.alert-message {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-primary);
  line-height: 1.5;
}

// Patterns
.pattern-item {
  background: var(--aipm-surface-primary-tint);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-sm);
}

.pattern-title {
  font-size: var(--aipm-font-size-base);
  font-weight: var(--aipm-font-weight-semibold);
  color: var(--aipm-text-primary);
  margin-bottom: var(--aipm-spacing-xs);
  display: flex;
  align-items: center;
  gap: 6px;
}

.pattern-recommendation {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-color-primary);
  margin-top: var(--aipm-spacing-xs);
  display: flex;
  align-items: center;
  gap: 4px;
}

// Suggestions
.suggestion-item {
  border: 1px dashed var(--aipm-border-base);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-sm);
  transition: border-color 0.15s;

  &:hover {
    border-color: var(--aipm-color-primary);
    border-style: solid;
  }
}

.suggestion-statement {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-primary);
  line-height: 1.5;
  margin-bottom: 4px;
}

.suggestion-mechanism {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-text-secondary);
  margin-bottom: 4px;
}

.suggestion-impact {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-color-primary);
  font-weight: var(--aipm-font-weight-semibold);
}

// Learnings
.learning-item {
  background: var(--aipm-surface-success-tint);
  border-radius: var(--aipm-radius-md);
  padding: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-sm);
  border-left: 3px solid var(--aipm-color-success);
}

.copilot-timestamp {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-text-placeholder);
  text-align: right;
  padding-top: var(--aipm-spacing-sm);
  border-top: 1px solid var(--aipm-border-lighter);
}

// Fix 4 (D20): 跨 squad 匿名化 — 他组条目灰化不可点 evidence
.other-squad {
  opacity: 0.5;
  filter: grayscale(0.4);
  pointer-events: none;
  position: relative;

  .other-squad-tag {
    font-size: 10px;
    color: var(--aipm-text-secondary);
    font-style: italic;
    margin-top: 4px;
  }
}

// Phase D.1: 采纳建议按钮
.suggestion-actions {
  margin-top: var(--aipm-spacing-sm);
  display: flex;
  justify-content: flex-end;
}

// Phase D.2: evidence tags
.evidence-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-top: var(--aipm-spacing-xs);
}

.evidence-label {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-text-secondary);
  margin-right: 4px;
}

.evidence-tag {
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.7;
  }
}
</style>
