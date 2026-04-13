<template>
  <el-card
    v-loading="loading"
    class="my-points-card"
    shadow="never"
  >
    <div class="card-header">
      <div class="card-title-row">
        <el-icon :size="18" class="title-icon"><Medal /></el-icon>
        <span class="card-title">我的贡献</span>
      </div>
      <el-tag
        v-if="mine"
        size="small"
        effect="plain"
        class="realtime-tag"
      >
        实时
      </el-tag>
    </div>

    <template v-if="mine">
      <!-- 三大数字：总 / 周 / 月 -->
      <div class="metric-row">
        <div class="metric-item metric-total">
          <div class="metric-label">总积分</div>
          <div class="metric-value">{{ mine.totalPoints }}</div>
        </div>
        <div class="metric-sep" />
        <div class="metric-item">
          <div class="metric-label">本周</div>
          <div class="metric-value">{{ mine.weekPoints }}</div>
        </div>
        <div class="metric-sep" />
        <div class="metric-item">
          <div class="metric-label">本月</div>
          <div class="metric-value">{{ mine.monthPoints }}</div>
        </div>
      </div>

      <el-divider class="card-divider" />

      <!-- 排名 -->
      <div class="rank-row">
        <div class="rank-item">
          <span class="rank-label">周榜</span>
          <span class="rank-value">{{ formatRank(mine.rank.week) }}</span>
        </div>
        <div class="rank-item">
          <span class="rank-label">月榜</span>
          <span class="rank-value">{{ formatRank(mine.rank.month) }}</span>
        </div>
        <div class="rank-item">
          <span class="rank-label">总榜</span>
          <span class="rank-value">{{ formatRank(mine.rank.all) }}</span>
        </div>
      </div>

      <el-divider class="card-divider" />

      <!-- 创建 / 价值 小字分项 -->
      <div class="split-row">
        <span class="split-label">创建</span>
        <span class="split-value">{{ mine.basePoints }} 分</span>
        <span class="split-divider">·</span>
        <span class="split-label">价值</span>
        <span class="split-value value-accent">{{ mine.valuePoints }} 分</span>
      </div>

      <el-divider class="card-divider" />

      <!-- 按类型分布 -->
      <div class="breakdown-section">
        <div class="breakdown-title">按类型分布</div>
        <div v-if="hasAnyBreakdown" class="breakdown-list">
          <div
            v-for="key in SOURCE_TYPE_ORDER"
            :key="key"
            class="breakdown-row"
          >
            <span class="breakdown-label">{{ labelOfSourceType(key) }}</span>
            <el-progress
              :percentage="percentOf(key)"
              :stroke-width="8"
              :show-text="false"
              :color="colorOfSourceType(key)"
              class="breakdown-bar"
            />
            <span class="breakdown-count">{{ mine.breakdown[key] }}</span>
          </div>
        </div>
        <el-empty
          v-else
          :image-size="46"
          description="还没有贡献数据"
        />
      </div>
    </template>

    <el-empty
      v-else-if="!loading"
      :image-size="60"
      description="暂无贡献数据"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Medal } from '@element-plus/icons-vue'
import type { MyContributionResult, ContributionSourceType } from '@/api/contribution'
import {
  SOURCE_TYPE_ORDER,
  labelOfSourceType,
  colorOfSourceType,
} from '../contribution-meta'

const props = defineProps<{
  mine: MyContributionResult | null
  loading?: boolean
}>()

const maxBreakdown = computed<number>(() => {
  if (!props.mine) return 0
  let max = 0
  for (const key of SOURCE_TYPE_ORDER) {
    const v = props.mine.breakdown[key]
    if (v > max) max = v
  }
  return max
})

const hasAnyBreakdown = computed<boolean>(() => maxBreakdown.value > 0)

function percentOf(key: ContributionSourceType): number {
  if (!props.mine) return 0
  const total = maxBreakdown.value
  if (total <= 0) return 0
  const v = props.mine.breakdown[key]
  return Math.round((v / total) * 100)
}

function formatRank(rank: number | null): string {
  if (rank == null) return '—'
  return `第 ${rank} 名`
}
</script>

<style scoped>
.my-points-card {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.25s ease;
}

.my-points-card:hover {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.06);
}

.my-points-card :deep(.el-card__body) {
  padding: 18px 20px 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  color: #f59e0b;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.realtime-tag {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}

/* ========== Metric row ========== */

.metric-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.metric-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  padding: 4px 0;
}

.metric-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.metric-total .metric-value {
  color: #f59e0b;
  font-size: 28px;
}

.metric-sep {
  width: 1px;
  height: 34px;
  background: #e5e7eb;
}

.card-divider {
  margin: 14px 0;
}

.card-divider :deep(.el-divider--horizontal) {
  margin: 0;
}

/* ========== Rank row ========== */

.rank-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.rank-label {
  color: #64748b;
  font-weight: 500;
}

.rank-value {
  font-weight: 600;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

/* ========== Split row ========== */

.split-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  color: #64748b;
}

.split-label {
  color: #94a3b8;
}

.split-value {
  font-weight: 600;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

.split-value.value-accent {
  color: #f59e0b;
}

.split-divider {
  color: #cbd5e1;
}

/* ========== Breakdown ========== */

.breakdown-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.breakdown-title {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.3px;
}

.breakdown-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.breakdown-row {
  display: grid;
  grid-template-columns: 72px 1fr 40px;
  align-items: center;
  gap: 10px;
}

.breakdown-label {
  font-size: 12px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.breakdown-bar {
  min-width: 0;
}

.breakdown-count {
  font-size: 12px;
  color: #303133;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
