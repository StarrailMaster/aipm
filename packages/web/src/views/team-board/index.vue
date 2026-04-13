<template>
  <div class="team-board-page">
    <div class="page-header">
      <h2 class="page-title">团队看板</h2>
      <p class="page-subtitle">以贡献数据驱动团队知识沉淀与协作激励</p>
    </div>

    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane name="contribution">
        <template #label>
          <span class="tab-label">
            <el-icon><Trophy /></el-icon>
            <span>团队贡献</span>
          </span>
        </template>
        <ContributionTab />
      </el-tab-pane>

      <el-tab-pane name="efficiency">
        <template #label>
          <span class="tab-label">
            <el-icon><TrendCharts /></el-icon>
            <span>效能看板</span>
          </span>
        </template>
        <!-- 懒渲染：切到该 tab 再挂载，避免首次进入团队看板就发 pm-metrics 请求 -->
        <EfficiencyPage v-if="activeTab === 'efficiency' || hasVisitedEfficiency" />
      </el-tab-pane>

      <!-- U-5: 绩效管理 tab 暂未开发，上线前隐藏。通过设置 VITE_PERFORMANCE_TAB=true 提前打开预览 -->
      <el-tab-pane v-if="showPerformanceTab" name="performance">
        <template #label>
          <span class="tab-label">
            <el-icon><DataAnalysis /></el-icon>
            <span>绩效管理</span>
          </span>
        </template>
        <div class="wip-placeholder">
          <el-empty description="绩效管理模块建设中，敬请期待" :image-size="120" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Trophy, DataAnalysis, TrendCharts } from '@element-plus/icons-vue'
import ContributionTab from './ContributionTab.vue'
import EfficiencyPage from '@/views/dashboard/efficiency.vue'

type TeamBoardTab = 'contribution' | 'efficiency' | 'performance'

const activeTab = ref<TeamBoardTab>('contribution')

// U-5: 绩效管理 tab 是空壳，默认隐藏
const showPerformanceTab = import.meta.env.VITE_PERFORMANCE_TAB === 'true'

// 标记用户是否访问过"效能看板"tab —— 访问过之后就保持挂载（KeepAlive-lite），
// 避免每次来回切 tab 都重拉 pm-metrics
const hasVisitedEfficiency = ref(false)
watch(activeTab, (v) => {
  if (v === 'efficiency') hasVisitedEfficiency.value = true
})
</script>

<style scoped>
.team-board-page {
  min-height: 300px;
}

/* ========== Page header ========== */

.page-header {
  margin-bottom: 18px;
}

.page-title {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  letter-spacing: 0.3px;
}

.page-subtitle {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

/* ========== Main tabs ========== */

.main-tabs {
  --el-tabs-header-height: 46px;
}

.main-tabs :deep(.el-tabs__header) {
  margin: 0 0 16px;
}

.main-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: #e5e7eb;
}

.main-tabs :deep(.el-tabs__item) {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  padding: 0 22px;
  height: 46px;
  line-height: 46px;
}

.main-tabs :deep(.el-tabs__item.is-active) {
  color: #409eff;
  font-weight: 600;
}

.main-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 2px;
  background: #409eff;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ========== WIP placeholder ========== */

.wip-placeholder {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  padding: 60px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}
</style>
