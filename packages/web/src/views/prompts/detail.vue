<template>
  <div class="prompt-detail-page" v-loading="promptStore.detailLoading">
    <template v-if="promptStore.currentPrompt">
      <!-- Back button -->
      <el-button link @click="router.push('/prompts')" class="back-btn">
        <el-icon><ArrowLeft /></el-icon> 返回列表
      </el-button>

      <!-- Header -->
      <div class="detail-header">
        <div class="header-left">
          <h2 class="prompt-name">{{ promptStore.currentPrompt.name }}</h2>
          <div class="prompt-meta">
            <el-tag :type="categoryTagType(promptStore.currentPrompt.category)" size="small" effect="plain">
              {{ categoryLabel(promptStore.currentPrompt.category) }}
            </el-tag>
            <el-tag size="small" type="info" effect="plain">
              v{{ promptStore.currentPrompt.version }}
            </el-tag>
            <span class="meta-text">
              由 {{ promptStore.currentPrompt.createdBy.name }} 创建于
              {{ formatTime(promptStore.currentPrompt.createdAt) }}
            </span>
          </div>
        </div>
        <div class="header-actions">
          <el-button
            :type="promptStore.currentPrompt.isStarred ? 'warning' : 'default'"
            @click="handleToggleStar"
          >
            <el-icon>
              <StarFilled v-if="promptStore.currentPrompt.isStarred" />
              <Star v-else />
            </el-icon>
            {{ promptStore.currentPrompt.isStarred ? '已收藏' : '收藏' }}
            ({{ promptStore.currentPrompt.starCount }})
          </el-button>
          <el-button @click="showForkDialog = true">
            <el-icon><DocumentCopy /></el-icon>
            复制 ({{ promptStore.currentPrompt.forkCount }})
          </el-button>
          <el-button v-if="isOwner" type="primary" @click="handleEdit">
            <el-icon><Edit /></el-icon> 编辑
          </el-button>
          <el-popconfirm
            v-if="isOwner"
            title="确认删除此提示词？"
            @confirm="handleDelete"
          >
            <template #reference>
              <el-button type="danger">
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>

      <!-- Description -->
      <p v-if="promptStore.currentPrompt.description" class="prompt-description">
        {{ promptStore.currentPrompt.description }}
      </p>

      <!-- Tags -->
      <div class="prompt-tags" v-if="promptStore.currentPrompt.tags.length">
        <el-tag
          v-for="tag in promptStore.currentPrompt.tags"
          :key="tag"
          size="small"
          type="info"
          effect="plain"
        >
          {{ tag }}
        </el-tag>
      </div>

      <!-- Main tabs: Content / PRs / Version History -->
      <el-tabs v-model="activeTab" type="border-card" class="main-tabs">
        <!-- Tab 1: Content -->
        <el-tab-pane name="content">
          <template #label>
            <span class="tab-label">
              <el-icon><Document /></el-icon>
              内容
            </span>
          </template>
          <div class="detail-body">
            <div class="content-area">
              <!-- Prompt Content (Markdown) -->
              <el-card shadow="never" class="content-card">
                <template #header>
                  <div class="card-title">提示词内容</div>
                </template>
                <div class="markdown-content">
                  <pre class="prompt-content-text">{{ promptStore.currentPrompt.content }}</pre>
                </div>
              </el-card>
            </div>

            <!-- Sidebar -->
            <div class="sidebar">
              <el-card shadow="never" class="sidebar-card">
                <template #header>
                  <div class="card-title">信息</div>
                </template>
                <div class="sidebar-info">
                  <div class="info-row">
                    <span class="info-label">可见性</span>
                    <el-tag size="small" :type="visibilityTagType(promptStore.currentPrompt.visibility)">
                      {{ visibilityLabel(promptStore.currentPrompt.visibility) }}
                    </el-tag>
                  </div>
                  <div class="info-row">
                    <span class="info-label">版本</span>
                    <span>v{{ promptStore.currentPrompt.version }}</span>
                  </div>
                  <div class="info-row" v-if="promptStore.currentPrompt.sourceId">
                    <span class="info-label">复制自</span>
                    <el-link type="primary" @click="router.push(`/prompts/${promptStore.currentPrompt.sourceId}`)">
                      查看原版
                    </el-link>
                  </div>
                </div>
              </el-card>

              <el-card shadow="never" class="sidebar-card" v-if="promptStore.currentPrompt.dependsOn.length > 0">
                <template #header>
                  <div class="card-title">前置依赖</div>
                </template>
                <div class="dep-list">
                  <el-tag
                    v-for="dep in promptStore.currentPrompt.dependsOn"
                    :key="dep"
                    size="small"
                    effect="plain"
                    class="dep-tag"
                  >
                    {{ dep }}
                  </el-tag>
                </div>
              </el-card>

              <el-card shadow="never" class="sidebar-card" v-if="promptStore.currentPrompt.requiredSopLayers.length > 0">
                <template #header>
                  <div class="card-title">依赖 SOP 模块</div>
                </template>
                <div class="dep-list">
                  <el-tag
                    v-for="layer in promptStore.currentPrompt.requiredSopLayers"
                    :key="layer"
                    size="small"
                    type="warning"
                    effect="plain"
                    class="dep-tag"
                  >
                    {{ layer }}
                  </el-tag>
                </div>
              </el-card>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 2: PRs -->
        <el-tab-pane name="prs">
          <template #label>
            <span class="tab-label">
              <el-icon><MagicStick /></el-icon>
              改进建议
            </span>
          </template>
          <div class="pr-header-bar">
            <span>共 {{ promptStore.prs.length }} 条建议</span>
            <el-button type="primary" size="small" @click="showPrDialog = true">
              提交改进建议
            </el-button>
          </div>
          <div v-loading="promptStore.prsLoading">
            <el-empty v-if="promptStore.prs.length === 0" description="暂无改进建议" />
            <div
              v-for="pr in promptStore.prs"
              :key="pr.id"
              class="pr-item"
              @click="router.push(`/prompts/${promptId}/pr/${pr.id}`)"
            >
              <div class="pr-item-left">
                <el-tag
                  :type="prStatusType(pr.status)"
                  size="small"
                >
                  {{ prStatusLabel(pr.status) }}
                </el-tag>
                <span class="pr-title">{{ pr.title }}</span>
              </div>
              <div class="pr-item-right">
                <span class="pr-author">{{ pr.submittedBy.name }}</span>
                <span class="pr-time">{{ formatTime(pr.createdAt) }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 3: Version History -->
        <el-tab-pane name="versions">
          <template #label>
            <span class="tab-label">
              <el-icon><Clock /></el-icon>
              版本历史
            </span>
          </template>
          <div v-loading="promptStore.versionsLoading">
            <el-empty v-if="promptStore.versions.length === 0" description="暂无版本记录" />
            <el-timeline v-else>
              <el-timeline-item
                v-for="version in promptStore.versions"
                :key="version.id"
                :timestamp="formatTime(version.createdAt)"
                placement="top"
              >
                <el-card shadow="never" class="version-card">
                  <div class="version-header">
                    <span class="version-label">v{{ version.version }}</span>
                    <span class="version-name">{{ version.name }}</span>
                  </div>
                  <p class="version-changelog">{{ version.changelog || '(无变更说明)' }}</p>
                  <span class="version-author">{{ version.createdBy.name }}</span>
                </el-card>
              </el-timeline-item>
            </el-timeline>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <!-- Fork Dialog -->
    <el-dialog v-model="showForkDialog" title="复制提示词" width="400px">
      <p>将此提示词复制到你的私有空间。你可以给副本起一个新名称：</p>
      <el-input v-model="forkName" placeholder="可选: 输入新名称（留空则自动命名）" />
      <template #footer>
        <el-button @click="showForkDialog = false">取消</el-button>
        <el-button type="primary" :loading="forking" @click="handleFork">确认复制</el-button>
      </template>
    </el-dialog>

    <!-- PR Submit Dialog -->
    <el-dialog v-model="showPrDialog" title="提交改进建议" width="700px">
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="prForm.title" placeholder="简要描述你的改进" />
        </el-form-item>
        <el-form-item label="说明" required>
          <el-input
            v-model="prForm.description"
            type="textarea"
            :rows="3"
            placeholder="详细说明改进的原因和内容"
          />
        </el-form-item>
        <el-form-item label="新内容" required>
          <el-input
            v-model="prForm.newContent"
            type="textarea"
            :rows="12"
            placeholder="粘贴修改后的完整提示词内容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPrDialog = false">取消</el-button>
        <el-button type="primary" :loading="submittingPr" @click="handleSubmitPr">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  Star,
  StarFilled,
  DocumentCopy,
  Edit,
  Delete,
  Document,
  MagicStick,
  Clock,
} from '@element-plus/icons-vue'
import { usePromptStore } from '@/stores/prompt'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const promptStore = usePromptStore()
const authStore = useAuthStore()

const promptId = computed(() => route.params.id as string)
const isOwner = computed(
  () => promptStore.currentPrompt?.createdBy.id === authStore.user?.id,
)

const activeTab = ref('content')
const showForkDialog = ref(false)
const forkName = ref('')
const forking = ref(false)
const showPrDialog = ref(false)
const submittingPr = ref(false)
const prForm = ref({
  title: '',
  description: '',
  newContent: '',
})

onMounted(() => {
  loadDetail()
})

watch(() => route.params.id, () => {
  if (route.params.id) {
    loadDetail()
  }
})

async function loadDetail() {
  await promptStore.fetchPromptDetail(promptId.value)
  promptStore.fetchVersions(promptId.value)
  promptStore.fetchPrs(promptId.value)
}

async function handleToggleStar() {
  await promptStore.toggleStar(promptId.value)
}

async function handleFork() {
  forking.value = true
  try {
    const forked = await promptStore.forkPrompt(promptId.value, forkName.value || undefined)
    ElMessage.success('复制成功')
    showForkDialog.value = false
    forkName.value = ''
    router.push(`/prompts/${forked.id}`)
  } finally {
    forking.value = false
  }
}

function handleEdit() {
  router.push(`/prompts/create?edit=${promptId.value}`)
}

async function handleDelete() {
  await promptStore.deletePrompt(promptId.value)
  ElMessage.success('删除成功')
  router.push('/prompts')
}

async function handleSubmitPr() {
  if (!prForm.value.title.trim() || !prForm.value.description.trim() || !prForm.value.newContent.trim()) {
    ElMessage.warning('请填写所有必填字段')
    return
  }
  submittingPr.value = true
  try {
    await promptStore.submitPr(promptId.value, prForm.value)
    ElMessage.success('改进建议已提交')
    showPrDialog.value = false
    prForm.value = { title: '', description: '', newContent: '' }
    promptStore.fetchPrs(promptId.value)
  } finally {
    submittingPr.value = false
  }
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

function visibilityLabel(v: string) {
  const map: Record<string, string> = { private: '私有', team: '团队', public: '公开' }
  return map[v] ?? v
}

function visibilityTagType(v: string) {
  const map: Record<string, string> = { private: 'info', team: '', public: 'success' }
  return (map[v] ?? '') as '' | 'success' | 'info' | 'warning' | 'danger'
}

function prStatusLabel(status: string) {
  const map: Record<string, string> = { OPEN: '待审核', MERGED: '已合并', REJECTED: '已拒绝' }
  return map[status] ?? status
}

function prStatusType(status: string) {
  const map: Record<string, string> = { OPEN: 'warning', MERGED: 'success', REJECTED: 'danger' }
  return (map[status] ?? 'info') as 'warning' | 'success' | 'danger' | 'info'
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN')
}
</script>

<style scoped>
.prompt-detail-page {
  padding: 0;
}

.back-btn {
  margin-bottom: 16px;
  color: #909399;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  flex: 1;
  min-width: 0;
}

.prompt-name {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}

.prompt-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-text {
  font-size: 13px;
  color: #909399;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.prompt-description {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 16px;
}

.prompt-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.main-tabs {
  margin-top: 8px;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.detail-body {
  display: flex;
  gap: 20px;
}

.content-area {
  flex: 1;
  min-width: 0;
}

.content-card {
  margin-bottom: 0;
}

.card-title {
  font-weight: 600;
  font-size: 14px;
}

.markdown-content {
  max-height: 500px;
  overflow-y: auto;
}

.prompt-content-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
  background: #fafafa;
  padding: 16px;
  border-radius: 6px;
  margin: 0;
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
}

.version-card {
  padding: 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.version-label {
  font-weight: 600;
  color: #409eff;
  font-size: 13px;
}

.version-name {
  font-weight: 500;
  font-size: 14px;
}

.version-changelog {
  margin: 4px 0;
  font-size: 13px;
  color: #606266;
}

.version-author {
  font-size: 12px;
  color: #c0c4cc;
}

.pr-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: #606266;
}

.pr-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.pr-item:hover {
  border-color: #409eff;
}

.pr-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pr-title {
  font-weight: 500;
  font-size: 14px;
}

.pr-item-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #c0c4cc;
}

.pr-author {
  color: #909399;
}

/* Sidebar */
.sidebar {
  width: 280px;
  flex-shrink: 0;
}

.sidebar-card {
  margin-bottom: 16px;
}

.sidebar-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.info-label {
  color: #909399;
}

.dep-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dep-tag {
  font-size: 12px;
}
</style>
