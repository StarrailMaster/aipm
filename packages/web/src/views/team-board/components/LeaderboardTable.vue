<template>
  <el-table
    v-loading="loading"
    :data="items"
    :default-sort="{ prop: 'totalPoints', order: 'descending' }"
    :stripe="true"
    :border="false"
    size="default"
    class="leaderboard-table"
    :empty-text="loading ? ' ' : '当前筛选下还没有贡献数据'"
  >
    <!-- 排名 -->
    <el-table-column
      label="排名"
      width="64"
      align="center"
    >
      <template #default="{ row }">
        <span
          v-if="row.rank <= 3"
          class="rank-badge"
          :class="`rank-${row.rank}`"
        >
          {{ medalFor(row.rank) }}
        </span>
        <span v-else class="rank-number">{{ row.rank }}</span>
      </template>
    </el-table-column>

    <!-- 用户 -->
    <el-table-column label="成员" min-width="130">
      <template #default="{ row }">
        <div class="user-cell">
          <el-avatar :size="26" :src="row.user.avatar ?? undefined">
            {{ initialOf(row.user.name) }}
          </el-avatar>
          <span class="user-name">{{ row.user.name }}</span>
        </div>
      </template>
    </el-table-column>

    <!-- 总贡献值 -->
    <el-table-column
      label="总贡献值"
      prop="totalPoints"
      width="96"
      align="right"
      sortable
    >
      <template #default="{ row }">
        <span class="total-points">{{ row.totalPoints }}</span>
      </template>
    </el-table-column>

    <!-- 创建积分 -->
    <el-table-column
      label="创建"
      prop="basePoints"
      width="72"
      align="right"
      sortable
    >
      <template #default="{ row }">
        <span class="base-points">{{ row.basePoints }}</span>
      </template>
    </el-table-column>

    <!-- 价值积分 -->
    <el-table-column
      label="价值"
      prop="valuePoints"
      width="72"
      align="right"
      sortable
    >
      <template #default="{ row }">
        <span class="value-points">{{ row.valuePoints }}</span>
      </template>
    </el-table-column>

    <!-- 贡献分布 -->
    <el-table-column label="贡献分布" min-width="160">
      <template #default="{ row }">
        <el-tooltip
          placement="top"
          effect="light"
          :show-after="150"
          :disabled="rowTotal(row) === 0"
        >
          <template #content>
            <div class="breakdown-tooltip">
              <div class="breakdown-tooltip-header">
                共 {{ rowTotal(row) }} 分
              </div>
              <div
                v-for="key in nonZeroBreakdownKeys(row)"
                :key="key"
                class="breakdown-tooltip-row"
              >
                <span
                  class="tag-dot"
                  :style="{ background: colorOfSourceType(key) }"
                />
                <span class="tag-name">{{ labelOfSourceType(key) }}</span>
                <span class="tag-count">
                  {{ row.breakdown[key] }}
                  <span class="tag-percent">
                    ({{ percentOf(row, key) }}%)
                  </span>
                </span>
              </div>
            </div>
          </template>
          <div class="breakdown-bar-wrap">
            <div v-if="rowTotal(row) === 0" class="breakdown-empty">—</div>
            <div v-else class="breakdown-bar">
              <div
                v-for="key in nonZeroBreakdownKeys(row)"
                :key="key"
                class="breakdown-segment"
                :style="{
                  width: segmentWidth(row, key),
                  background: colorOfSourceType(key),
                }"
              />
            </div>
          </div>
        </el-tooltip>
      </template>
    </el-table-column>

    <!-- 事件数 -->
    <el-table-column
      label="事件"
      prop="recentEventCount"
      width="70"
      align="center"
      sortable
    >
      <template #default="{ row }">
        <el-badge
          :value="row.recentEventCount"
          :max="999"
          :hidden="row.recentEventCount === 0"
          type="info"
          class="event-badge"
        >
          <span v-if="row.recentEventCount === 0" class="event-zero">—</span>
        </el-badge>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import type { LeaderboardItem, ContributionSourceType } from '@/api/contribution'
import {
  SOURCE_TYPE_ORDER,
  labelOfSourceType,
  colorOfSourceType,
} from '../contribution-meta'

defineProps<{
  items: LeaderboardItem[]
  loading?: boolean
}>()

function medalFor(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return String(rank)
}

function initialOf(name: string): string {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

/** breakdown 里 value > 0 的所有 key，按积分降序（这样堆叠条最大的一段在左边）*/
function nonZeroBreakdownKeys(row: LeaderboardItem): ContributionSourceType[] {
  const entries = SOURCE_TYPE_ORDER.filter((k) => row.breakdown[k] > 0)
  entries.sort((a, b) => row.breakdown[b] - row.breakdown[a])
  return entries
}

/** 此用户所有类型积分的总和（作为 100% 基数）*/
function rowTotal(row: LeaderboardItem): number {
  let sum = 0
  for (const k of SOURCE_TYPE_ORDER) sum += row.breakdown[k]
  return sum
}

/** 某个类型占总分的百分比（四舍五入到整数，用于 tooltip）*/
function percentOf(row: LeaderboardItem, key: ContributionSourceType): number {
  const total = rowTotal(row)
  if (total <= 0) return 0
  return Math.round((row.breakdown[key] / total) * 100)
}

/** 堆叠条某段的实际宽度（用 CSS calc 保证 flex-grow 后仍然成比例 + 非零段最小 6px）*/
function segmentWidth(row: LeaderboardItem, key: ContributionSourceType): string {
  const total = rowTotal(row)
  if (total <= 0) return '0%'
  const pct = (row.breakdown[key] / total) * 100
  // 防止小段被挤没：non-zero 段至少占 2%
  return `${Math.max(pct, 2)}%`
}
</script>

<style scoped>
.leaderboard-table :deep(.el-table__header-wrapper) {
  border-radius: 10px 10px 0 0;
}

.leaderboard-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: #475569;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #e5e7eb;
}

.leaderboard-table :deep(td.el-table__cell) {
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
  padding: 10px 0;
}

.leaderboard-table :deep(.cell) {
  padding-left: 8px;
  padding-right: 8px;
}

.leaderboard-table :deep(.el-table__row:hover td) {
  background-color: #f8fafc !important;
}

/* ========== Rank badge ========== */

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  line-height: 1;
}

.rank-number {
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  font-weight: 600;
  color: #64748b;
}

/* ========== User cell ========== */

.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ========== Points ========== */

.total-points {
  font-size: 17px;
  font-weight: 700;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

.base-points {
  font-size: 13px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.value-points {
  font-size: 13px;
  font-weight: 600;
  color: #f59e0b;
  font-variant-numeric: tabular-nums;
}

/* ========== Breakdown stacked bar ========== */

.breakdown-bar-wrap {
  padding: 2px 4px;
  min-width: 0;
}

.breakdown-bar {
  display: flex;
  width: 100%;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  background: #f1f5f9;
  box-shadow: inset 0 0 0 1px #e5e7eb;
  cursor: default;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.breakdown-bar:hover {
  transform: translateY(-1px);
  box-shadow: inset 0 0 0 1px #e5e7eb, 0 2px 6px rgba(0, 0, 0, 0.08);
}

.breakdown-segment {
  height: 100%;
  transition: filter 0.15s ease;
}

.breakdown-segment + .breakdown-segment {
  border-left: 1px solid rgba(255, 255, 255, 0.7);
}

.breakdown-bar:hover .breakdown-segment {
  filter: saturate(1.15);
}

.breakdown-empty {
  color: #cbd5e1;
  font-size: 14px;
  text-align: center;
}

/* ========== Tooltip ========== */

.breakdown-tooltip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;
}

.breakdown-tooltip-header {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
  padding-bottom: 4px;
  margin-bottom: 2px;
  border-bottom: 1px solid #f1f5f9;
  letter-spacing: 0.3px;
}

.breakdown-tooltip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.tag-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}

.tag-name {
  color: #475569;
  flex: 1;
}

.tag-count {
  font-weight: 600;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

.tag-percent {
  font-weight: 400;
  color: #94a3b8;
  font-size: 11px;
  margin-left: 2px;
}

/* ========== Event ========== */

.event-badge :deep(.el-badge__content) {
  background-color: #e0f2fe;
  color: #0369a1;
  border: none;
}

.event-zero {
  color: #cbd5e1;
  font-size: 13px;
}
</style>
