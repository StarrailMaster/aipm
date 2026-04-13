<template>
  <div class="learnings-page">
    <div class="page-header">
      <h1 class="page-title">{{ t('learning.title') }}</h1>
    </div>

    <div class="filters">
      <el-input
        v-model="search"
        :placeholder="t('learning.searchPlaceholder')"
        clearable
        style="width: 280px"
        @change="refresh"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-radio-group v-model="sourceFilter" @change="refresh">
        <el-radio-button value="">{{ t('common.all') }}</el-radio-button>
        <el-radio-button value="HUMAN">{{ t('learning.source.HUMAN') }}</el-radio-button>
        <el-radio-button value="AI_GENERATED">{{ t('learning.source.AI_GENERATED') }}</el-radio-button>
      </el-radio-group>
    </div>

    <div v-loading="store.loading" class="learnings-list">
      <el-card
        v-for="l in store.list"
        :key="l.id"
        class="learning-card"
        :class="{ clickable: !!l.hypothesisId }"
        shadow="hover"
        @click="l.hypothesisId && goHypothesis(l.hypothesisId)"
      >
        <template #header>
          <div class="learning-header">
            <el-tag :type="l.source === 'AI_GENERATED' ? 'primary' : 'info'" size="small">
              {{ t(`learning.source.${l.source}`) }}
            </el-tag>
            <span class="learning-title">{{ l.title }}</span>
            <span class="learning-time">{{ formatTime(l.createdAt) }}</span>
          </div>
        </template>
        <MarkdownRenderer :content="l.content" />
        <div class="learning-footer">
          <span>{{ l.createdBy.name }}</span>
          <span v-if="l.hypothesisId" class="learning-link">
            {{ t('hypothesis.detail.overview') }} →
          </span>
        </div>
      </el-card>
      <el-empty v-if="!store.loading && store.list.length === 0" :description="t('common.empty')" />
    </div>

    <el-pagination
      v-if="store.total > pageSize"
      v-model:current-page="page"
      :page-size="pageSize"
      :total="store.total"
      layout="total, prev, pager, next"
      @current-change="refresh"
      class="pagination"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { useLearningStore } from '@/stores/learning'
import MarkdownRenderer from '@/components/learning/MarkdownRenderer.vue'
import type { LearningSource } from '@/api/learning'

const router = useRouter()

const { t } = useI18n()
const store = useLearningStore()

const search = ref('')
const sourceFilter = ref<LearningSource | ''>('')
const page = ref(1)
const pageSize = ref(20)

async function refresh() {
  await store.fetchList({
    page: page.value,
    pageSize: pageSize.value,
    source: sourceFilter.value || undefined,
    search: search.value || undefined,
  })
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleDateString()
}

function goHypothesis(hypothesisId: string) {
  router.push(`/hypotheses/${hypothesisId}`)
}

onMounted(refresh)
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints' as *;

.learnings-page {
  padding: var(--aipm-spacing-lg);
  max-width: 900px;
  margin: 0 auto;

  @include mobile {
    padding: var(--aipm-spacing-md);
  }
}

.page-header {
  margin-bottom: var(--aipm-spacing-lg);
}

.page-title {
  font-size: var(--aipm-font-size-3xl);
  font-weight: var(--aipm-font-weight-bold);
  margin: 0;
}

.filters {
  display: flex;
  gap: var(--aipm-spacing-md);
  margin-bottom: var(--aipm-spacing-md);
  flex-wrap: wrap;

  @include mobile {
    gap: var(--aipm-spacing-sm);

    :deep(.el-input) {
      width: 100% !important;
    }
  }
}

.learnings-list {
  display: flex;
  flex-direction: column;
  gap: var(--aipm-spacing-md);
}

.learning-header {
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-sm);
}

.learning-title {
  font-weight: var(--aipm-font-weight-semibold);
  flex: 1;
}

.learning-time {
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
}

.learning-footer {
  margin-top: var(--aipm-spacing-sm);
  padding-top: var(--aipm-spacing-sm);
  border-top: 1px solid var(--aipm-border-lighter);
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.learning-link {
  color: var(--aipm-color-primary);
  font-weight: var(--aipm-font-weight-medium);
}

.learning-card.clickable {
  cursor: pointer;
  transition: transform 0.15s;
  &:hover { transform: translateY(-1px); }
}

.pagination {
  margin-top: var(--aipm-spacing-lg);
  text-align: center;
}
</style>
