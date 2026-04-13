<template>
  <div class="skills-page">
    <!-- Header -->
    <div class="page-header">
      <h2 class="page-title">Skill 库</h2>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新建 Skill
      </el-button>
    </div>

    <!-- Search + Filter bar -->
    <div class="filter-bar">
      <el-input
        v-model="skillStore.listParams.keyword"
        placeholder="搜索 Skill..."
        clearable
        :prefix-icon="Search"
        style="width: 280px"
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      />
      <el-select
        v-model="skillStore.listParams.sort"
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option label="最近更新" value="recent" />
        <el-option label="最多收藏" value="star" />
      </el-select>
      <el-button @click="handleSearch">搜索</el-button>
    </div>

    <!-- Category tabs -->
    <el-tabs v-model="activeCategory" class="category-tabs" @tab-change="handleCategoryChange">
      <el-tab-pane label="全部" name="" />
      <el-tab-pane label="阶段辅助" name="STAGE_HELPER" />
      <el-tab-pane label="质量检查" name="QUALITY_CHECK" />
      <el-tab-pane label="通用工具" name="GENERAL_TOOL" />
    </el-tabs>

    <!-- Card grid -->
    <div v-loading="skillStore.loading" class="card-grid">
      <el-empty v-if="!skillStore.loading && skillStore.skills.length === 0" description="暂无 Skill" />
      <div
        v-for="skill in skillStore.skills"
        :key="skill.id"
        class="skill-card"
        @click="router.push(`/skills/${skill.id}`)"
      >
        <div class="card-header">
          <span class="card-name">{{ skill.name }}</span>
          <el-tag :type="categoryTagType(skill.category)" size="small" effect="plain">
            {{ categoryLabel(skill.category) }}
          </el-tag>
        </div>
        <p class="card-desc">{{ skill.description || '暂无描述' }}</p>
        <div class="card-tags" v-if="skill.tags.length">
          <el-tag
            v-for="tag in skill.tags.slice(0, 4)"
            :key="tag"
            size="small"
            type="info"
            effect="plain"
            class="tech-tag"
          >
            {{ tag }}
          </el-tag>
          <span v-if="skill.tags.length > 4" class="more-tags">+{{ skill.tags.length - 4 }}</span>
        </div>
        <div class="card-git" v-if="skill.gitRepoUrl" @click.stop>
          <el-icon><Link /></el-icon>
          <a :href="skill.gitRepoUrl" target="_blank" rel="noopener noreferrer" class="git-link">
            {{ shortenUrl(skill.gitRepoUrl) }}
          </a>
        </div>
        <div class="card-footer">
          <div class="card-stats">
            <span
              class="stat-item star-btn"
              :class="{ starred: skill.isStarred }"
              @click.stop="handleToggleStar(skill.id)"
            >
              <el-icon><StarFilled v-if="skill.isStarred" /><Star v-else /></el-icon>
              {{ skill.starCount }}
            </span>
            <span class="stat-item">
              <el-icon><DocumentCopy /></el-icon>
              {{ skill.forkCount }}
            </span>
          </div>
          <span class="card-author">{{ skill.createdBy.name }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination-wrapper" v-if="skillStore.total > 0">
      <el-pagination
        v-model:current-page="skillStore.listParams.page"
        v-model:page-size="skillStore.listParams.pageSize"
        :total="skillStore.total"
        :page-sizes="[12, 20, 40]"
        layout="total, sizes, prev, pager, next"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <!-- Create Dialog -->
    <el-dialog v-model="showCreateDialog" title="新建 Skill" width="600px" @close="resetForm">
      <el-form :model="createForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="Skill 名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="2" placeholder="Skill 用途说明" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="createForm.category" placeholder="选择分类" style="width: 200px">
            <el-option label="阶段辅助" value="STAGE_HELPER" />
            <el-option label="质量检查" value="QUALITY_CHECK" />
            <el-option label="通用工具" value="GENERAL_TOOL" />
          </el-select>
        </el-form-item>
        <el-form-item label="技术标签">
          <el-select
            v-model="createForm.tags"
            multiple
            filterable
            allow-create
            placeholder="输入标签后回车"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Git 仓库">
          <el-input v-model="createForm.gitRepoUrl" placeholder="https://github.com/..." />
        </el-form-item>
        <el-form-item label="可见性">
          <el-radio-group v-model="createForm.visibility">
            <el-radio value="private">私有</el-radio>
            <el-radio value="team">团队</el-radio>
            <el-radio value="public">公开</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="createForm.content"
            type="textarea"
            :rows="10"
            placeholder="Skill 内容描述（支持 Markdown）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Search, Star, StarFilled, DocumentCopy, Link } from '@element-plus/icons-vue'
import { useSkillStore } from '@/stores/skill'

const router = useRouter()
const skillStore = useSkillStore()

const activeCategory = ref('')
const showCreateDialog = ref(false)
const creating = ref(false)

const createForm = ref({
  name: '',
  description: '',
  category: '' as string,
  tags: [] as string[],
  content: '',
  gitRepoUrl: '',
  visibility: 'team' as string,
})

onMounted(() => {
  skillStore.fetchSkills()
})

function handleSearch() {
  skillStore.listParams.page = 1
  skillStore.fetchSkills()
}

function handleCategoryChange(category: string | number) {
  skillStore.listParams.category = category as string
  skillStore.listParams.page = 1
  skillStore.fetchSkills()
}

function handlePageChange() {
  skillStore.fetchSkills()
}

function handleSizeChange() {
  skillStore.listParams.page = 1
  skillStore.fetchSkills()
}

async function handleToggleStar(id: string) {
  await skillStore.toggleStar(id)
}

async function handleCreate() {
  if (!createForm.value.name.trim() || !createForm.value.category || !createForm.value.content.trim()) {
    ElMessage.warning('请填写名称、分类和内容')
    return
  }
  creating.value = true
  try {
    const skill = await skillStore.createSkill({
      name: createForm.value.name,
      description: createForm.value.description || undefined,
      category: createForm.value.category,
      tags: createForm.value.tags,
      content: createForm.value.content,
      gitRepoUrl: createForm.value.gitRepoUrl || undefined,
      visibility: createForm.value.visibility,
    })
    ElMessage.success('Skill 创建成功')
    showCreateDialog.value = false
    resetForm()
    router.push(`/skills/${skill.id}`)
  } finally {
    creating.value = false
  }
}

function resetForm() {
  createForm.value = {
    name: '',
    description: '',
    category: '',
    tags: [],
    content: '',
    gitRepoUrl: '',
    visibility: 'team',
  }
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    STAGE_HELPER: '阶段辅助',
    QUALITY_CHECK: '质量检查',
    GENERAL_TOOL: '通用工具',
  }
  return map[cat] ?? cat
}

function categoryTagType(cat: string) {
  const map: Record<string, string> = {
    STAGE_HELPER: 'success',
    QUALITY_CHECK: 'warning',
    GENERAL_TOOL: '',
  }
  return (map[cat] ?? '') as '' | 'success' | 'warning' | 'info' | 'danger'
}

function shortenUrl(url: string) {
  try {
    const u = new URL(url)
    return u.hostname + u.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}
</script>

<style scoped>
.skills-page {
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

.skill-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.skill-card:hover {
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
  margin-bottom: 8px;
}

.tech-tag {
  font-size: 11px;
}

.more-tags {
  font-size: 11px;
  color: #909399;
  line-height: 22px;
}

.card-git {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #909399;
}

.git-link {
  color: #409eff;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-link:hover {
  text-decoration: underline;
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
