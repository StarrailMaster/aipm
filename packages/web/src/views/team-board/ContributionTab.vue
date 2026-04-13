<template>
  <div class="contribution-tab">
    <!-- Filter bar -->
    <el-card class="filter-bar" shadow="never">
      <div class="filter-row">
        <div class="filter-group">
          <span class="filter-label">时间</span>
          <el-radio-group v-model="activeWindow" @change="onWindowChange">
            <el-radio-button value="week">本周</el-radio-button>
            <el-radio-button value="month">本月</el-radio-button>
            <el-radio-button value="all">总榜</el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-group">
          <span class="filter-label">类型</span>
          <el-radio-group v-model="activeType" @change="onTypeChange">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="prompt">提示词</el-radio-button>
            <el-radio-button value="skill">Skill</el-radio-button>
            <el-radio-button value="sop_project">SOP 模板</el-radio-button>
            <el-radio-button value="prompt_pr">改进建议</el-radio-button>
            <el-radio-button value="hypothesis">胜出假设</el-radio-button>
            <el-radio-button value="learning">学习笔记</el-radio-button>
          </el-radio-group>
        </div>
        <div class="filter-spacer" />
        <el-button
          size="small"
          :icon="Refresh"
          :loading="contributionStore.leaderboardLoading"
          @click="refreshAll"
        >
          刷新
        </el-button>
      </div>
    </el-card>

    <!-- Main grid: left column (Podium + Leaderboard) | right column (MyPoints + Recent) -->
    <div class="main-grid">
      <!-- Left column: podium + leaderboard，宽度一致 -->
      <div class="left-column">
        <el-card class="podium-card" shadow="never">
          <Podium :items="contributionStore.leaderboard" />
        </el-card>

        <el-card class="leaderboard-card" shadow="never">
          <template #header>
            <div class="card-header">
              <div class="header-title-row">
                <el-icon :size="18" class="header-icon"><DataAnalysis /></el-icon>
                <span class="header-title">完整排行榜</span>
              </div>
              <span class="header-sub">
                共 {{ contributionStore.leaderboard.length }} 位贡献者
              </span>
            </div>
          </template>

          <LeaderboardTable
            :items="contributionStore.leaderboard"
            :loading="contributionStore.leaderboardLoading"
          />
        </el-card>
      </div>

      <!-- Right column: my points + recent events -->
      <div class="right-column">
        <MyPointsCard
          :mine="contributionStore.myContribution"
          :loading="contributionStore.myLoading"
        />
        <RecentEventsPanel
          :events="contributionStore.recentEvents"
          :loading="contributionStore.recentLoading"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Refresh, DataAnalysis } from '@element-plus/icons-vue'
import { useContributionStore } from '@/stores/contribution'
import type { ContributionSourceType } from '@/api/contribution'
import Podium from './components/Podium.vue'
import LeaderboardTable from './components/LeaderboardTable.vue'
import MyPointsCard from './components/MyPointsCard.vue'
import RecentEventsPanel from './components/RecentEventsPanel.vue'

type WindowKey = 'week' | 'month' | 'all'
type TypeKey = '' | ContributionSourceType

const contributionStore = useContributionStore()

const activeWindow = ref<WindowKey>('all')
const activeType = ref<TypeKey>('')

async function onWindowChange() {
  await contributionStore.fetchLeaderboard({
    window: activeWindow.value,
    sourceType: activeType.value || undefined,
    limit: 50,
  })
}

async function onTypeChange() {
  await Promise.all([
    contributionStore.fetchLeaderboard({
      window: activeWindow.value,
      sourceType: activeType.value || undefined,
      limit: 50,
    }),
    contributionStore.fetchRecentEvents({
      limit: 30,
      sourceType: activeType.value || undefined,
    }),
  ])
}

async function refreshAll() {
  await Promise.all([
    contributionStore.fetchLeaderboard({
      window: activeWindow.value,
      sourceType: activeType.value || undefined,
      limit: 50,
    }),
    contributionStore.fetchMyContribution(),
    contributionStore.fetchRecentEvents({
      limit: 30,
      sourceType: activeType.value || undefined,
    }),
  ])
}

onMounted(async () => {
  await Promise.all([
    contributionStore.fetchLeaderboard({
      window: activeWindow.value,
      limit: 50,
    }),
    contributionStore.fetchMyContribution(),
    contributionStore.fetchRecentEvents({ limit: 30 }),
  ])
})
</script>

<style scoped>
.contribution-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* ========== Filter bar ========== */

.filter-bar {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
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

/* ========== Main grid ========== */

.main-grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr);
  gap: 16px;
  align-items: start;
}

.left-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* ========== Podium wrapper ========== */

.podium-card {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.podium-card :deep(.el-card__body) {
  padding: 20px 24px 28px;
}

.leaderboard-card {
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  min-width: 0;
}

.leaderboard-card :deep(.el-card__header) {
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
}

.leaderboard-card :deep(.el-card__body) {
  padding: 4px 8px 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: #409eff;
}

.header-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.header-sub {
  font-size: 12px;
  color: #94a3b8;
}

/* ========== Right column ========== */

.right-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

@media (max-width: 1200px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
  .right-column {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .right-column > * {
    flex: 1 1 320px;
    min-width: 0;
  }
}
</style>
