<template>
  <div class="my-tasks-page" v-loading="loading">
    <h2 class="page-title">我的待办</h2>

    <!-- Summary header -->
    <div class="summary-bar">
      <div class="summary-total">
        <span class="total-num">{{ summary.total }}</span>
        <span class="total-label">项待处理</span>
      </div>
      <div class="summary-chips">
        <!-- 全部 -->
        <el-button
          :class="{ active: activeSuperCategory === 'all' }"
          @click="activeSuperCategory = 'all'"
          size="small"
          plain
        >
          <el-icon><List /></el-icon>
          全部
        </el-button>

        <!-- 三个超级分类 -->
        <el-badge
          v-for="sc in superCategories"
          :key="sc.key"
          :value="superCounts[sc.key]"
          :hidden="superCounts[sc.key] === 0"
          :type="sc.badgeType"
        >
          <el-button
            :class="{ active: activeSuperCategory === sc.key }"
            @click="activeSuperCategory = sc.key"
            size="small"
            plain
          >
            <el-icon><component :is="sc.icon" /></el-icon>
            {{ sc.label }}
          </el-button>
        </el-badge>

        <el-button size="small" text @click="refresh">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- Empty state -->
    <el-empty
      v-if="!loading && filteredTasks.length === 0"
      :description="summary.total === 0 ? '当前没有待处理的任务 🎉' : `${activeSuperCategoryLabel} 里暂无任务`"
    />

    <!-- Task list -->
    <div v-else class="task-groups">
      <template v-for="group in visibleGroups" :key="group.key">
        <div v-if="group.tasks.length > 0" class="task-group">
          <div class="group-header" :style="{ '--accent': group.accentColor }">
            <el-icon :size="18" class="group-icon">
              <component :is="group.icon" />
            </el-icon>
            <h3 class="group-title">{{ group.label }}</h3>
            <span class="group-desc">{{ group.description }}</span>
            <el-tag :type="group.badgeType" size="small" effect="light" round>
              {{ group.tasks.length }}
            </el-tag>
          </div>

          <div class="task-list">
            <div
              v-for="task in group.tasks"
              :key="task.id"
              class="task-card"
              :class="`cat-${task.category}`"
              @click="goToTask(task)"
            >
              <div class="task-main">
                <div class="task-title-row">
                  <span class="task-title">{{ task.title }}</span>
                  <el-tag
                    :type="fineCategoryTag(task.category).type"
                    size="small"
                    effect="plain"
                    class="task-sub-tag"
                  >
                    {{ fineCategoryTag(task.category).label }}
                  </el-tag>
                </div>
                <div class="task-subtitle">{{ task.subtitle }}</div>
              </div>
              <div class="task-right">
                <el-button type="primary" size="small" plain>
                  {{ task.actionLabel }}
                  <el-icon class="el-icon--right"><ArrowRight /></el-icon>
                </el-button>
                <div class="task-time">{{ formatRelativeTime(task.updatedAt) }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  Refresh, ArrowRight, List, Box, Document, Collection,
} from '@element-plus/icons-vue'
import {
  getMyTasksApi,
  type MyTaskItem,
  type MyTaskCategory,
  type MyTasksSummary,
} from '@/api/dashboard'

const router = useRouter()

// ========== State ==========
const loading = ref(false)
const tasks = ref<MyTaskItem[]>([])
const summary = ref<MyTasksSummary>({
  total: 0,
  byCategory: {
    boardCard: 0,
    feedImplement: 0,
    feedDesignReview: 0,
    feedRejected: 0,
    promptPrReview: 0,
  },
})

// ========== Super category（3 大类） ==========
// 把原来 5 种细粒度分类合并成 3 个产品阶段维度：
//   需求 → 产品规划阶段的白板卡片
//   实施 → 工作台包（执行/审核/返工）
//   知识库 → 提示词库的改进建议审核

type SuperCategory = 'requirement' | 'implement' | 'knowledge'

const activeSuperCategory = ref<'all' | SuperCategory>('all')

/** 细粒度 → 超级分类的映射 */
const SUPER_CATEGORY_MAP: Record<MyTaskCategory, SuperCategory> = {
  board_card: 'requirement',
  feed_implement: 'implement',
  feed_design_review: 'implement',
  feed_rejected: 'implement',
  prompt_pr_review: 'knowledge',
}

interface SuperCategoryMeta {
  key: SuperCategory
  label: string
  icon: Component
  badgeType: '' | 'success' | 'warning' | 'info' | 'danger' | 'primary'
  accentColor: string
  description: string
}

const superCategories: SuperCategoryMeta[] = [
  {
    key: 'requirement',
    label: '需求',
    icon: Document,
    badgeType: 'info',
    accentColor: '#409eff',
    description: '白板上指派给我、尚未完成的卡片',
  },
  {
    key: 'implement',
    label: '实施',
    icon: Box,
    badgeType: 'warning',
    accentColor: '#e6a23c',
    description: '工作台包：待实施 / 待我审核 / 被驳回',
  },
  {
    key: 'knowledge',
    label: '知识库',
    icon: Collection,
    badgeType: 'primary',
    accentColor: '#8b5cf6',
    description: '我创建的提示词上有改进建议等我审核',
  },
]

/** 每个超级分类的任务数 */
const superCounts = computed<Record<SuperCategory, number>>(() => {
  const s = summary.value.byCategory
  return {
    requirement: s.boardCard,
    implement: s.feedImplement + s.feedDesignReview + s.feedRejected,
    knowledge: s.promptPrReview,
  }
})

const activeSuperCategoryLabel = computed(() => {
  if (activeSuperCategory.value === 'all') return '全部任务'
  return superCategories.find((c) => c.key === activeSuperCategory.value)?.label ?? ''
})

// ========== Fine category tag（卡片右侧的二级类型标签） ==========

function fineCategoryTag(cat: MyTaskCategory): {
  label: string
  type: '' | 'success' | 'warning' | 'info' | 'danger'
} {
  const map: Record<MyTaskCategory, { label: string; type: '' | 'success' | 'warning' | 'info' | 'danger' }> = {
    board_card: { label: '白板卡片', type: 'info' },
    feed_implement: { label: '待实施', type: 'warning' },
    feed_design_review: { label: '待我审核', type: 'info' },
    feed_rejected: { label: '被驳回', type: 'danger' },
    prompt_pr_review: { label: '改进建议', type: '' },
  }
  return map[cat]
}

// ========== Filtering ==========

const filteredTasks = computed(() => {
  if (activeSuperCategory.value === 'all') return tasks.value
  return tasks.value.filter(
    (t) => SUPER_CATEGORY_MAP[t.category] === activeSuperCategory.value,
  )
})

/**
 * 按"超级分类"分组的显示数据。
 * - 过滤态为 all 时：三组都可能显示
 * - 过滤态为某个具体超级分类时：只显示那一组（但还是套一层分组头，视觉一致）
 */
const visibleGroups = computed(() => {
  const groups = superCategories.map((sc) => ({
    key: sc.key,
    label: sc.label,
    icon: sc.icon,
    badgeType: sc.badgeType,
    accentColor: sc.accentColor,
    description: sc.description,
    tasks: [] as MyTaskItem[],
  }))
  for (const task of filteredTasks.value) {
    const superKey = SUPER_CATEGORY_MAP[task.category]
    const g = groups.find((gg) => gg.key === superKey)
    if (g) g.tasks.push(task)
  }
  return groups
})

// ========== Time helper ==========

function formatRelativeTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

// ========== Data loading ==========

async function load() {
  loading.value = true
  try {
    const res = await getMyTasksApi()
    if (res.data.code === 0 && res.data.data) {
      tasks.value = res.data.data.tasks
      summary.value = res.data.data.summary
    }
  } finally {
    loading.value = false
  }
}

function refresh() {
  load()
}

// ========== Navigation ==========

function goToTask(task: MyTaskItem) {
  // task.link 是后端返回的路由；/feeds 老路由兼容性处理
  const link = task.link === '/feeds' ? '/workbench' : task.link
  router.push(link)
}

// ========== Init ==========

onMounted(() => {
  load()
})
</script>

<style scoped>
.my-tasks-page {
  min-height: 300px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px;
}

/* ========== Summary bar ========== */

.summary-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%);
  border-radius: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.summary-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.total-num {
  font-size: 28px;
  font-weight: 700;
  color: #409eff;
  font-variant-numeric: tabular-nums;
}

.total-label {
  font-size: 14px;
  color: #606266;
}

.summary-chips {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.summary-chips :deep(.el-button) {
  border-radius: 999px;
  padding: 0 14px;
  transition: all 0.15s;
}

.summary-chips :deep(.el-button.active) {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.summary-chips :deep(.el-button .el-icon) {
  margin-right: 4px;
}

/* ========== Task groups ========== */

.task-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.task-group {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
}

.group-header {
  --accent: #409eff;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: linear-gradient(to right, rgba(64, 158, 255, 0.04), transparent 60%);
  border-bottom: 1px solid #f1f5f9;
  border-left: 3px solid var(--accent);
}

.group-icon {
  color: var(--accent);
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.group-desc {
  flex: 1;
  font-size: 12px;
  color: #94a3b8;
  margin-left: 4px;
}

/* ========== Task list ========== */

.task-list {
  display: flex;
  flex-direction: column;
}

.task-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: background 0.15s;
}

.task-card:last-child {
  border-bottom: none;
}

.task-card:hover {
  background: #f8fafc;
}

.task-card.cat-feed_rejected:hover {
  background: #fff5f5;
}

.task-main {
  flex: 1;
  min-width: 0;
}

.task-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  min-width: 0;
}

.task-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.task-sub-tag {
  flex-shrink: 0;
}

.task-subtitle {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.task-time {
  font-size: 11px;
  color: #c0c4cc;
}
</style>
