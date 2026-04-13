<template>
  <div class="cross-project-page">
    <div class="page-header">
      <h1 class="page-title">{{ t('nav.crossProject') }}</h1>
      <el-button @click="refresh">
        <el-icon><Refresh /></el-icon>
        {{ t('common.retry') }}
      </el-button>
    </div>

    <div v-loading="loading">
      <!-- Projects table -->
      <el-card class="section-card" shadow="never">
        <template #header>{{ t('crossProject.projects') }}</template>
        <el-empty v-if="!data?.projects?.length" :description="t('common.empty')" />
        <el-table v-else :data="data.projects" stripe>
          <el-table-column prop="projectName" :label="t('crossProject.project')" />
          <el-table-column :label="t('crossProject.activeKRCount')" width="120">
            <template #default="{ row }">{{ row.activeKRCount }}</template>
          </el-table-column>
          <el-table-column :label="t('crossProject.kpiAchievementRate')" width="140">
            <template #default="{ row }">
              <el-progress
                :percentage="Math.round(row.kpiAchievementRate * 100)"
                :status="row.kpiAchievementRate >= 0.8 ? 'success' : row.kpiAchievementRate >= 0.5 ? 'warning' : 'exception'"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('crossProject.hypothesisCount')" width="120">
            <template #default="{ row }">{{ row.hypothesisCount }}</template>
          </el-table-column>
          <el-table-column :label="t('crossProject.winRate')" width="140">
            <template #default="{ row }">
              {{ Math.round(row.winRate * 100) }}%
            </template>
          </el-table-column>
          <el-table-column :label="t('crossProject.learningVelocity')" width="120">
            <template #default="{ row }">{{ row.learningVelocity }}</template>
          </el-table-column>
          <el-table-column :label="t('crossProject.stagnantKRs')" width="120">
            <template #default="{ row }">
              <el-tag v-if="row.stagnantKRs > 0" type="danger" size="small">
                {{ row.stagnantKRs }}
              </el-tag>
              <span v-else>—</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Cross patterns -->
      <el-card v-if="data?.crossPatterns?.length" class="section-card" shadow="never">
        <template #header>{{ t('crossProject.crossPatterns') }}</template>
        <div v-for="(p, idx) in data.crossPatterns" :key="idx" class="pattern">
          <h4>{{ p.title }}</h4>
          <MarkdownRenderer :content="p.description" />
          <p class="recommendation">→ {{ p.recommendation }}</p>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Refresh } from '@element-plus/icons-vue'
import { useLearningDashboardStore } from '@/stores/learning-dashboard'
import MarkdownRenderer from '@/components/learning/MarkdownRenderer.vue'

const { t } = useI18n()
const store = useLearningDashboardStore()

const data = computed(() => store.crossProjectData)
const loading = computed(() => store.loading)

async function refresh() {
  await store.fetchCrossProject()
}

onMounted(refresh)
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints' as *;

.cross-project-page {
  padding: var(--aipm-spacing-lg);
  max-width: 1200px;
  margin: 0 auto;

  @include mobile {
    padding: var(--aipm-spacing-md);
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--aipm-spacing-lg);

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--aipm-spacing-sm);
  }
}

// 在移动端允许 table 横向滚动（不换行）
.section-card :deep(.el-table) {
  @include mobile {
    min-width: 700px;
  }
}

.section-card :deep(.el-card__body) {
  @include mobile {
    overflow-x: auto;
  }
}

.page-title {
  font-size: var(--aipm-font-size-3xl);
  font-weight: var(--aipm-font-weight-bold);
  margin: 0;
}

.section-card {
  margin-bottom: var(--aipm-spacing-lg);
}

.pattern {
  padding: var(--aipm-spacing-md) 0;
  border-bottom: 1px solid var(--aipm-border-lighter);

  &:last-child {
    border-bottom: none;
  }

  h4 {
    margin: 0 0 var(--aipm-spacing-sm);
    font-size: var(--aipm-font-size-md);
    font-weight: var(--aipm-font-weight-semibold);
  }
}

.recommendation {
  margin-top: var(--aipm-spacing-sm);
  color: var(--aipm-color-primary);
  font-size: var(--aipm-font-size-base);
}
</style>
