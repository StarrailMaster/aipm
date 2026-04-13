<template>
  <div class="prompts-page">
    <!-- Header -->
    <div class="page-header">
      <h2 class="page-title">提示词库</h2>
      <el-button type="primary" @click="router.push('/prompts/create')">
        <el-icon><Plus /></el-icon>
        新建提示词
      </el-button>
    </div>

    <!-- Search + Filter bar -->
    <div class="filter-bar">
      <el-input
        v-model="promptStore.listParams.keyword"
        placeholder="搜索提示词..."
        clearable
        :prefix-icon="Search"
        style="width: 280px"
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      />
      <el-select
        v-model="promptStore.listParams.sort"
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option label="最近更新" value="recent" />
        <el-option label="最多收藏" value="star" />
        <el-option label="最多复制" value="popular" />
      </el-select>
      <el-select
        v-model="promptStore.listParams.visibility"
        placeholder="可见性"
        clearable
        style="width: 120px"
        @change="handleSearch"
      >
        <el-option label="私有" value="private" />
        <el-option label="团队" value="team" />
        <el-option label="公开" value="public" />
      </el-select>
      <el-button @click="handleSearch">搜索</el-button>
    </div>

    <!-- Category tabs -->
    <el-tabs v-model="activeCategory" class="category-tabs" @tab-change="handleCategoryChange">
      <el-tab-pane label="全部" name="" />
      <el-tab-pane label="设计" name="DESIGN" />
      <el-tab-pane label="前端" name="FRONTEND" />
      <el-tab-pane label="后端" name="BACKEND" />
      <el-tab-pane label="测试" name="TESTING" />
      <el-tab-pane label="集成" name="INTEGRATION" />
      <el-tab-pane label="优化" name="OPTIMIZATION" />
    </el-tabs>

    <!-- Card grid -->
    <div v-loading="promptStore.loading" class="card-grid">
      <el-empty v-if="!promptStore.loading && promptStore.prompts.length === 0" description="暂无提示词" />
      <div
        v-for="prompt in promptStore.prompts"
        :key="prompt.id"
        class="prompt-card"
        @click="router.push(`/prompts/${prompt.id}`)"
      >
        <div class="card-header">
          <span class="card-name">{{ prompt.name }}</span>
          <el-tag :type="categoryTagType(prompt.category)" size="small" effect="plain">
            {{ categoryLabel(prompt.category) }}
          </el-tag>
        </div>
        <p class="card-desc">{{ prompt.description || '暂无描述' }}</p>
        <div class="card-tags" v-if="prompt.tags.length">
          <el-tag
            v-for="tag in prompt.tags.slice(0, 4)"
            :key="tag"
            size="small"
            type="info"
            effect="plain"
            class="tech-tag"
          >
            {{ tag }}
          </el-tag>
          <span v-if="prompt.tags.length > 4" class="more-tags">+{{ prompt.tags.length - 4 }}</span>
        </div>
        <div class="card-footer">
          <div class="card-stats">
            <span
              class="stat-item star-btn"
              :class="{ starred: prompt.isStarred }"
              @click.stop="handleToggleStar(prompt.id)"
            >
              <el-icon><StarFilled v-if="prompt.isStarred" /><Star v-else /></el-icon>
              {{ prompt.starCount }}
            </span>
            <span class="stat-item">
              <el-icon><DocumentCopy /></el-icon>
              {{ prompt.forkCount }}
            </span>
          </div>
          <span class="card-author">{{ prompt.createdBy.name }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination-wrapper" v-if="promptStore.total > 0">
      <el-pagination
        v-model:current-page="promptStore.listParams.page"
        v-model:page-size="promptStore.listParams.pageSize"
        :total="promptStore.total"
        :page-sizes="[12, 20, 40]"
        layout="total, sizes, prev, pager, next"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Search, Star, StarFilled, DocumentCopy } from '@element-plus/icons-vue'
import { usePromptStore } from '@/stores/prompt'

const router = useRouter()
const promptStore = usePromptStore()

const activeCategory = ref('')

onMounted(() => {
  promptStore.fetchPrompts()
})

function handleSearch() {
  promptStore.listParams.page = 1
  promptStore.fetchPrompts()
}

function handleCategoryChange(category: string | number) {
  promptStore.listParams.category = category as string
  promptStore.listParams.page = 1
  promptStore.fetchPrompts()
}

function handlePageChange() {
  promptStore.fetchPrompts()
}

function handleSizeChange() {
  promptStore.listParams.page = 1
  promptStore.fetchPrompts()
}

async function handleToggleStar(id: string) {
  await promptStore.toggleStar(id)
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    DESIGN: '设计',
    FRONTEND: '前端',
    BACKEND: '后端',
    TESTING: '测试',
    INTEGRATION: '集成',
    OPTIMIZATION: '优化',
  }
  return map[cat] ?? cat
}

function categoryTagType(cat: string) {
  const map: Record<string, string> = {
    DESIGN: 'warning',
    FRONTEND: 'success',
    BACKEND: '',
    TESTING: 'info',
    INTEGRATION: 'danger',
    OPTIMIZATION: 'warning',
  }
  return (map[cat] ?? '') as '' | 'success' | 'warning' | 'info' | 'danger'
}
</script>

<style scoped>
.prompts-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: center;
}

.category-tabs {
  margin-bottom: 20px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.prompt-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.prompt-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 12px rgba(64, 158, 255, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  gap: 8px;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.card-desc {
  color: #909399;
  font-size: 13px;
  margin: 0 0 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.tech-tag {
  font-size: 11px;
}

.more-tags {
  font-size: 11px;
  color: #909399;
  line-height: 22px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f2f3f5;
}

.card-stats {
  display: flex;
  gap: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  color: #909399;
}

.star-btn {
  cursor: pointer;
  transition: color 0.2s;
}

.star-btn:hover {
  color: #e6a23c;
}

.star-btn.starred {
  color: #e6a23c;
}

.card-author {
  font-size: 12px;
  color: #c0c4cc;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
