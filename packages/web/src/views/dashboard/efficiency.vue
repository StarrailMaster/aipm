<template>
  <div class="efficiency-page" v-loading="loading">
    <!-- Filter bar -->
    <el-card class="filter-bar" shadow="never">
      <div class="filter-row">
        <div class="filter-group">
          <span class="filter-label">时间窗</span>
          <el-segmented
            v-model="days"
            :options="periodOptions"
            @change="load"
          />
        </div>

        <!-- 非管理员：只能看自己的数据，显示一个 locked 的"个人"标签 -->
        <div v-if="!isAdmin" class="filter-group">
          <el-tag type="info" effect="plain" size="large">
            <el-icon style="margin-right: 4px"><User /></el-icon>
            仅查看个人数据
          </el-tag>
        </div>

        <!-- ADMIN：scope 切换器 -->
        <template v-else>
          <div class="filter-group">
            <span class="filter-label">范围</span>
            <el-segmented
              v-model="scope"
              :options="scopeOptions"
              @change="onScopeChange"
            />
          </div>

          <div v-if="scope === 'project'" class="filter-group">
            <el-select
              v-model="projectId"
              placeholder="选择项目"
              clearable
              filterable
              style="width: 220px"
              @change="load"
            >
              <el-option
                v-for="proj in orgStore.projects"
                :key="proj.id"
                :label="proj.name"
                :value="proj.id"
              />
            </el-select>
          </div>

          <div v-if="scope === 'squad'" class="filter-group">
            <el-select
              v-model="squadId"
              placeholder="选择小组"
              clearable
              filterable
              style="width: 220px"
              @change="load"
            >
              <el-option
                v-for="sq in squadOptions"
                :key="sq.id"
                :label="sq.name"
                :value="sq.id"
              />
            </el-select>
          </div>

          <div v-if="scope === 'user'" class="filter-group">
            <el-select
              v-model="userId"
              placeholder="选择成员"
              clearable
              filterable
              style="width: 220px"
              @change="load"
            >
              <el-option
                v-for="u in userOptions"
                :key="u.id"
                :label="u.name"
                :value="u.id"
              />
            </el-select>
          </div>
        </template>

        <div class="filter-spacer" />
        <el-button size="small" :icon="Refresh" @click="load">刷新</el-button>
      </div>
    </el-card>

    <!-- Row 1: KPI cards -->
    <div class="kpi-row">
      <el-card class="kpi-card kpi-primary" shadow="hover">
        <div class="kpi-label">吞吐量</div>
        <div class="kpi-value">{{ metrics?.throughput.total ?? 0 }}</div>
        <div class="kpi-sub">近 {{ days }} 天完成卡片 + 包</div>
      </el-card>

      <el-card class="kpi-card" shadow="hover">
        <div class="kpi-label">平均周期</div>
        <div class="kpi-value">
          {{ formatHours(metrics?.cycleTime.avgHours ?? 0) }}
        </div>
        <div class="kpi-sub">
          p50 {{ formatHours(metrics?.cycleTime.p50Hours ?? 0) }} · p90
          {{ formatHours(metrics?.cycleTime.p90Hours ?? 0) }}
        </div>
      </el-card>

      <el-card class="kpi-card" shadow="hover">
        <div class="kpi-label">进行中 WIP</div>
        <div class="kpi-value">{{ wipTotal }}</div>
        <div class="kpi-sub">
          白板 {{ metrics?.wip.boardSelections ?? 0 }} · 包
          {{ metrics?.wip.feedPackages ?? 0 }} · 迭代
          {{ metrics?.wip.iterations ?? 0 }}
        </div>
      </el-card>

      <el-card class="kpi-card kpi-warn" shadow="hover">
        <div class="kpi-label">驳回率</div>
        <div class="kpi-value">{{ metrics?.rejectionRate.rate ?? 0 }}%</div>
        <div class="kpi-sub">
          {{ metrics?.rejectionRate.rejected ?? 0 }} /
          {{ metrics?.rejectionRate.total ?? 0 }} 次推送
        </div>
      </el-card>
    </div>

    <!-- Row 2: Throughput trend + Cycle distribution -->
    <div class="chart-row">
      <el-card class="chart-card" shadow="hover">
        <template #header>
          <div class="chart-header">
            <span class="chart-title">吞吐量趋势</span>
            <span class="chart-sub">每日完成的卡片与包</span>
          </div>
        </template>
        <div class="chart-body">
          <v-chart
            v-if="throughputOption"
            :option="throughputOption"
            :autoresize="true"
            style="width: 100%; height: 260px"
          />
          <el-empty
            v-else
            :image-size="60"
            description="暂无数据，可能是还没有开始使用工作台/白板"
          />
        </div>
      </el-card>

      <el-card class="chart-card" shadow="hover">
        <template #header>
          <div class="chart-header">
            <span class="chart-title">周期时间分布</span>
            <span class="chart-sub">从创建到完成所耗时间</span>
          </div>
        </template>
        <div class="chart-body">
          <v-chart
            v-if="cycleOption"
            :option="cycleOption"
            :autoresize="true"
            style="width: 100%; height: 260px"
          />
          <el-empty
            v-else
            :image-size="60"
            description="暂无数据，可能是还没有开始使用工作台/白板"
          />
        </div>
      </el-card>
    </div>

    <!-- Row 3: Hourly + Layer distribution -->
    <div class="chart-row">
      <el-card class="chart-card" shadow="hover">
        <template #header>
          <div class="chart-header">
            <span class="chart-title">小时段活跃度</span>
            <span class="chart-sub">UTC 24 小时分布</span>
          </div>
        </template>
        <div class="chart-body">
          <v-chart
            v-if="hourlyOption"
            :option="hourlyOption"
            :autoresize="true"
            style="width: 100%; height: 260px"
          />
          <el-empty
            v-else
            :image-size="60"
            description="暂无数据，可能是还没有开始使用工作台/白板"
          />
        </div>
      </el-card>

      <el-card class="chart-card" shadow="hover">
        <template #header>
          <div class="chart-header">
            <span class="chart-title">八层分布</span>
            <span class="chart-sub">工作分布在哪些 SOP 层</span>
          </div>
        </template>
        <div class="chart-body">
          <v-chart
            v-if="layerOption"
            :option="layerOption"
            :autoresize="true"
            style="width: 100%; height: 260px"
          />
          <el-empty
            v-else
            :image-size="60"
            description="暂无数据，可能是还没有开始使用工作台/白板"
          />
        </div>
      </el-card>
    </div>

    <!-- Row 4: Lead time banner + Top collaborators table -->
    <div class="chart-row">
      <el-card class="chart-card leadtime-card" shadow="hover">
        <template #header>
          <div class="chart-header">
            <span class="chart-title">交付周期 Lead Time</span>
            <span class="chart-sub">需求提出 → 全部 Feed 完成</span>
          </div>
        </template>
        <div class="leadtime-body">
          <div class="lead-metric">
            <div class="lead-label">平均</div>
            <div class="lead-value">
              {{ metrics?.leadTime.avgDays ?? 0 }}
              <span class="lead-unit">天</span>
            </div>
          </div>
          <div class="lead-metric">
            <div class="lead-label">p50</div>
            <div class="lead-value">
              {{ metrics?.leadTime.p50Days ?? 0 }}
              <span class="lead-unit">天</span>
            </div>
          </div>
          <div class="lead-metric">
            <div class="lead-label">样本</div>
            <div class="lead-value">
              {{ metrics?.leadTime.samples ?? 0 }}
              <span class="lead-unit">个</span>
            </div>
          </div>
        </div>
        <el-empty
          v-if="!metrics || metrics.leadTime.samples === 0"
          :image-size="50"
          description="暂无数据，可能是还没有开始使用工作台/白板"
        />
      </el-card>

      <el-card class="chart-card" shadow="hover">
        <template #header>
          <div class="chart-header">
            <span class="chart-title">协作贡献榜</span>
            <span class="chart-sub">完成卡片数 TOP 10</span>
          </div>
        </template>
        <el-table
          v-if="metrics && metrics.topCollaborators.length > 0"
          :data="metrics.topCollaborators"
          :show-header="true"
          size="small"
          class="collab-table"
        >
          <el-table-column label="成员" min-width="160">
            <template #default="{ row }">
              <div class="collab-cell">
                <el-avatar :size="28" :src="row.avatar ?? undefined">
                  {{ row.name.charAt(0) }}
                </el-avatar>
                <span class="collab-name">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="完成数" prop="completed" width="90" align="right" />
          <el-table-column label="平均周期" width="120" align="right">
            <template #default="{ row }">
              {{ formatHours(row.avgCycleHours) }}
            </template>
          </el-table-column>
        </el-table>
        <el-empty
          v-else
          :image-size="60"
          description="暂无数据，可能是还没有开始使用工作台/白板"
        />
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { ComposeOption } from 'echarts/core'
import type {
  LineSeriesOption,
  BarSeriesOption,
  PieSeriesOption,
} from 'echarts/charts'
import type {
  TitleComponentOption,
  TooltipComponentOption,
  GridComponentOption,
  LegendComponentOption,
} from 'echarts/components'
import { Refresh, User } from '@element-plus/icons-vue'
import {
  getPmMetricsApi,
  type PmMetrics,
  type PmMetricsScope,
} from '@/api/dashboard'
import { listUsersApi, type UserProfileItem } from '@/api/org'
import { listSquadsApi, type SquadItem } from '@/api/squad'
import { useOrgStore } from '@/stores/org'
import { useAuthStore } from '@/stores/auth'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
])

type EChartsOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | PieSeriesOption
  | TitleComponentOption
  | TooltipComponentOption
  | GridComponentOption
  | LegendComponentOption
>

// ========== Stores ==========
const orgStore = useOrgStore()
const authStore = useAuthStore()

const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

// ========== State ==========
const loading = ref(false)
const metrics = ref<PmMetrics | null>(null)
const days = ref(30)

// 筛选范围（仅 ADMIN 可切换）
const scope = ref<PmMetricsScope>('all')
const projectId = ref<string>('')
const squadId = ref<string>('')
const userId = ref<string>('')

// ADMIN 的下拉选项数据
const squadOptions = ref<SquadItem[]>([])
const userOptions = ref<UserProfileItem[]>([])

const periodOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 14 天', value: 14 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
]

const scopeOptions = [
  { label: '全部', value: 'all' as const },
  { label: '按项目', value: 'project' as const },
  { label: '按小组', value: 'squad' as const },
  { label: '按个人', value: 'user' as const },
]

function onScopeChange() {
  // 切换 scope 时清空其它维度，避免携带脏数据
  if (scope.value !== 'project') projectId.value = ''
  if (scope.value !== 'squad') squadId.value = ''
  if (scope.value !== 'user') userId.value = ''
  // 切换后立刻拉（全部模式不需要选择，其它模式用户会自己选）
  if (scope.value === 'all') {
    load()
  }
}

// ========== Derived ==========

const wipTotal = computed(() => {
  if (!metrics.value) return 0
  const w = metrics.value.wip
  return w.boardSelections + w.feedPackages + w.iterations
})

function formatHours(h: number): string {
  if (!h || h <= 0) return '—'
  if (h < 1) return `${Math.round(h * 60)} 分`
  if (h < 24) return `${h.toFixed(1)} 小时`
  return `${(h / 24).toFixed(1)} 天`
}

// ========== Chart: Throughput trend ==========

const throughputOption = computed<EChartsOption | null>(() => {
  if (!metrics.value || metrics.value.throughput.trend.length === 0) return null
  const trend = metrics.value.throughput.trend
  return {
    tooltip: { trigger: 'axis' },
    grid: { top: 20, left: 36, right: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      data: trend.map((t) => t.date.slice(5)),
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e4e7ed' } },
      axisLabel: { color: '#909399', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f2f5', type: 'dashed' } },
      axisLabel: { color: '#909399', fontSize: 11 },
    },
    series: [
      {
        name: '完成数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: trend.map((t) => t.count),
        lineStyle: { color: '#409eff', width: 2.5 },
        itemStyle: { color: '#409eff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(64, 158, 255, 0.28)' },
              { offset: 1, color: 'rgba(64, 158, 255, 0.02)' },
            ],
          },
        },
      },
    ],
  }
})

// ========== Chart: Cycle distribution ==========

const cycleOption = computed<EChartsOption | null>(() => {
  if (!metrics.value) return null
  const dist = metrics.value.cycleTime.distribution
  const total = dist.reduce((a, b) => a + b.count, 0)
  if (total === 0) return null
  return {
    tooltip: { trigger: 'axis' },
    grid: { top: 20, left: 40, right: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      data: dist.map((d) => d.bucket),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e4e7ed' } },
      axisLabel: { color: '#909399', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f2f5', type: 'dashed' } },
      axisLabel: { color: '#909399', fontSize: 11 },
    },
    series: [
      {
        name: '卡片数',
        type: 'bar',
        data: dist.map((d) => d.count),
        barWidth: '50%',
        itemStyle: {
          color: '#67c23a',
          borderRadius: [6, 6, 0, 0],
        },
      },
    ],
  }
})

// ========== Chart: Hourly distribution ==========

const hourlyOption = computed<EChartsOption | null>(() => {
  if (!metrics.value) return null
  const hourly = metrics.value.hourlyDistribution
  const totalActivity = hourly.reduce((a, b) => a + b.activityCount, 0)
  if (totalActivity === 0) return null
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: { top: 20, left: 40, right: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      data: hourly.map((h) => `${h.hour}h`),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e4e7ed' } },
      axisLabel: { color: '#909399', fontSize: 10, interval: 2 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f2f5', type: 'dashed' } },
      axisLabel: { color: '#909399', fontSize: 11 },
    },
    series: [
      {
        name: '活动数',
        type: 'bar',
        data: hourly.map((h) => h.activityCount),
        barWidth: '60%',
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#f78a3b' },
              { offset: 1, color: '#ffcf96' },
            ],
          },
          borderRadius: [4, 4, 0, 0],
        },
      },
    ],
  }
})

// ========== Chart: Layer distribution (pie) ==========

const LAYER_LABELS: Record<string, string> = {
  PRODUCT_REQ: '产品需求',
  CONTENT: '内容',
  DESIGN_SYSTEM: '设计系统',
  FRONTEND_ARCH: '前端架构',
  BACKEND_ARCH: '后端架构',
  AI_PROMPTS: 'AI 提示词',
  ACCEPTANCE: '验收',
  APPENDIX: '附录',
}

const layerOption = computed<EChartsOption | null>(() => {
  if (!metrics.value) return null
  const layers = metrics.value.layerDistribution.filter((l) => l.count > 0)
  if (layers.length === 0) return null
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number }
        return `${p.name}<br/><b>${p.value}</b> 项 (${p.percent}%)`
      },
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'middle',
      textStyle: { color: '#606266', fontSize: 11 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        name: '八层分布',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: { show: false },
        labelLine: { show: false },
        data: layers.map((l) => ({
          name: LAYER_LABELS[l.layer] ?? l.layer,
          value: l.count,
        })),
      },
    ],
  }
})

// ========== Data loading ==========

async function load() {
  loading.value = true
  try {
    const params: {
      days?: number
      scope?: PmMetricsScope
      projectId?: string
      squadId?: string
      userId?: string
    } = { days: days.value }

    // 非 ADMIN：无论 scope 是什么，后端都会强制 user 模式，前端也简化成只传 days
    if (isAdmin.value) {
      params.scope = scope.value
      if (scope.value === 'project' && projectId.value) params.projectId = projectId.value
      if (scope.value === 'squad' && squadId.value) params.squadId = squadId.value
      if (scope.value === 'user' && userId.value) params.userId = userId.value
    }

    const res = await getPmMetricsApi(params)
    if (res.data.code === 0 && res.data.data) {
      metrics.value = res.data.data
    }
  } finally {
    loading.value = false
  }
}

/** 加载 ADMIN 专用的 squad / user 下拉选项，懒加载一次 */
async function loadAdminFilterOptions() {
  if (!isAdmin.value) return
  try {
    const [squadRes, userRes] = await Promise.all([
      listSquadsApi({ page: 1, pageSize: 200 }),
      listUsersApi({ page: 1, pageSize: 200 }),
    ])
    squadOptions.value = squadRes.data.data?.items ?? []
    userOptions.value = userRes.data.data?.items ?? []
  } catch {
    // ignore; filter 为空
  }
}

// ========== Init ==========

onMounted(async () => {
  // ADMIN 需要项目 / 小组 / 成员列表；非 ADMIN 什么都不用拉
  if (isAdmin.value) {
    if (orgStore.projects.length === 0) {
      try {
        await orgStore.fetchProjects({ page: 1, pageSize: 100 })
      } catch {
        // ignore
      }
    }
    await loadAdminFilterOptions()
  }
  await load()
})
</script>

<style scoped>
.efficiency-page {
  min-height: 300px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px;
}

/* ========== Filter bar ========== */

.filter-bar {
  margin-bottom: 16px;
  border-radius: 12px;
}

.filter-bar :deep(.el-card__body) {
  padding: 14px 18px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}

.filter-spacer {
  flex: 1;
}

/* ========== KPI row ========== */

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.kpi-card {
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  transition: transform 0.2s;
}

.kpi-card :deep(.el-card__body) {
  padding: 18px 20px;
}

.kpi-card:hover {
  transform: translateY(-2px);
}

.kpi-label {
  font-size: 13px;
  color: #909399;
  font-weight: 500;
  margin-bottom: 8px;
}

.kpi-value {
  font-size: 30px;
  font-weight: 700;
  color: #303133;
  line-height: 1.1;
  margin-bottom: 4px;
}

.kpi-sub {
  font-size: 12px;
  color: #909399;
}

.kpi-card.kpi-primary {
  background: linear-gradient(135deg, #409eff 0%, #5aaaff 100%);
  border: none;
}
.kpi-card.kpi-primary .kpi-label,
.kpi-card.kpi-primary .kpi-sub {
  color: rgba(255, 255, 255, 0.82);
}
.kpi-card.kpi-primary .kpi-value {
  color: #fff;
}

.kpi-card.kpi-warn .kpi-value {
  color: #e6a23c;
}

/* ========== Chart rows ========== */

.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
}

.chart-card {
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
}

.chart-card :deep(.el-card__header) {
  padding: 12px 18px;
  border-bottom: 1px solid #f0f2f5;
}

.chart-card :deep(.el-card__body) {
  padding: 12px 18px 18px;
}

.chart-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.chart-sub {
  font-size: 12px;
  color: #909399;
}

.chart-body {
  min-height: 260px;
}

/* ========== Lead time ========== */

.leadtime-card :deep(.el-card__body) {
  padding: 20px 22px;
}

.leadtime-body {
  display: flex;
  gap: 32px;
}

.lead-metric {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.lead-label {
  font-size: 13px;
  color: #909399;
  font-weight: 500;
}

.lead-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  line-height: 1.1;
}

.lead-unit {
  font-size: 14px;
  font-weight: 500;
  color: #909399;
  margin-left: 4px;
}

/* ========== Collaborator table ========== */

.collab-table {
  margin-top: 4px;
}

.collab-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.collab-name {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

@media (max-width: 1200px) {
  .kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .chart-row {
    grid-template-columns: 1fr;
  }
}
</style>
