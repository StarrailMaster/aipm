<template>
  <div class="experience-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2 class="page-title">经验沉淀</h2>
        <p class="page-subtitle">
          提示词改进建议 & 经验反馈都汇总在这里 —— 提交改进建议到「知识中心 → 提示词库」里任意提示词下即可
        </p>
      </div>
      <el-button type="primary" @click="openSubmitDialog">
        <el-icon><Plus /></el-icon>
        提交经验反馈
      </el-button>
    </div>

    <!-- Main tabs -->
    <el-tabs v-model="activeTab" class="main-tabs" @tab-change="handleTabChange">
      <!-- Tab 1: 我的反馈 — 提示词改进建议 + 经验反馈（统一时间线）-->
      <el-tab-pane name="mine">
        <template #label>
          <span class="tab-label">
            <el-icon><Promotion /></el-icon>
            我的反馈
            <el-badge
              v-if="mineFeed.length > 0"
              :value="mineFeed.length"
              :max="99"
              class="tab-badge"
            />
          </span>
        </template>
        <div v-loading="mineLoading" class="pr-list">
          <el-empty
            v-if="!mineLoading && mineFeed.length === 0"
            description="还没有提交过反馈"
          >
            <span class="empty-hint">
              在提示词详情页可以提交"改进建议"，或点右上角"提交经验反馈"记录一条经验
            </span>
          </el-empty>

          <template v-for="item in mineFeed" :key="item.kind + '-' + item.id">
            <!-- 类型 A: 提示词改进建议 (PromptPr) -->
            <div
              v-if="item.kind === 'pr'"
              class="pr-card"
              :class="`status-${item.pr.status.toLowerCase()}`"
              @click="goToPrDetail(item.pr)"
            >
              <div class="pr-card-header">
                <el-tag type="info" size="small" effect="plain" class="kind-tag">
                  <el-icon><ChatDotRound /></el-icon>
                  改进建议
                </el-tag>
                <el-tag :type="prStatusTagType(item.pr.status)" size="small">
                  {{ prStatusLabel(item.pr.status) }}
                </el-tag>
                <span class="pr-card-prompt">
                  针对
                  <strong>{{ item.pr.promptName }}</strong>
                  <el-tag
                    size="small"
                    :type="getCategoryTag(item.pr.promptCategory)"
                    effect="plain"
                    style="margin-left: 4px"
                  >
                    {{ getCategoryLabel(item.pr.promptCategory) }}
                  </el-tag>
                </span>
                <span class="pr-card-time">{{ formatTime(item.sortAt) }}</span>
              </div>
              <div class="pr-card-title">{{ item.pr.title }}</div>
              <div v-if="item.pr.description" class="pr-card-desc">
                {{ truncate(item.pr.description, 140) }}
              </div>
              <div
                v-if="item.pr.reviewComment && item.pr.status !== 'OPEN'"
                class="pr-card-review"
                :class="`review-${item.pr.status.toLowerCase()}`"
              >
                <el-icon>
                  <Check v-if="item.pr.status === 'MERGED'" />
                  <Close v-else-if="item.pr.status === 'REJECTED'" />
                  <ChatDotSquare v-else />
                </el-icon>
                <span>
                  <strong>{{ item.pr.reviewedBy?.name ?? '审核人' }}</strong>
                  {{ item.pr.status === 'MERGED' ? '已合并' : '已驳回' }}：{{ item.pr.reviewComment }}
                </span>
              </div>
            </div>

            <!-- 类型 B: 经验反馈 (ExperienceFeedback) -->
            <div
              v-else-if="item.kind === 'feedback'"
              class="pr-card status-feedback"
              @click="openDetail(item.feedback)"
            >
              <div class="pr-card-header">
                <el-tag type="success" size="small" effect="plain" class="kind-tag">
                  <el-icon><Notebook /></el-icon>
                  经验反馈
                </el-tag>
                <span v-if="item.feedback.linkedPrompt" class="pr-card-prompt">
                  关联
                  <strong>{{ item.feedback.linkedPrompt.name }}</strong>
                  <el-tag
                    size="small"
                    :type="getCategoryTag(item.feedback.linkedPrompt.category)"
                    effect="plain"
                    style="margin-left: 4px"
                  >
                    {{ getCategoryLabel(item.feedback.linkedPrompt.category) }}
                  </el-tag>
                </span>
                <span class="pr-card-time">{{ formatTime(item.sortAt) }}</span>
              </div>
              <div class="pr-card-desc">
                {{ truncate(item.feedback.problemDescription, 160) }}
              </div>
              <div
                v-if="item.feedback.markdownFileName"
                class="attachment-line"
              >
                <el-icon><Document /></el-icon>
                <span>{{ item.feedback.markdownFileName }}</span>
              </div>
            </div>
          </template>
        </div>
      </el-tab-pane>

      <!-- Tab 2: 需要审核 -->
      <el-tab-pane name="to-review">
        <template #label>
          <span class="tab-label">
            <el-icon><Bell /></el-icon>
            需要审核
            <el-badge
              v-if="toReviewPrs.length > 0"
              :value="toReviewPrs.length"
              :max="99"
              class="tab-badge"
              type="warning"
            />
          </span>
        </template>
        <div v-loading="toReviewLoading" class="pr-list">
          <el-empty
            v-if="!toReviewLoading && toReviewPrs.length === 0"
            description="没有需要你审核的改进建议"
          >
            <span class="empty-hint">
              别人对你创建的提示词提交改进建议时，会出现在这里
            </span>
          </el-empty>
          <div
            v-for="pr in toReviewPrs"
            :key="pr.id"
            class="pr-card status-open is-pending"
            @click="goToPrDetail(pr)"
          >
            <div class="pr-card-header">
              <el-tag type="warning" size="small">待你审核</el-tag>
              <span class="pr-card-prompt">
                针对
                <strong>{{ pr.promptName }}</strong>
                <el-tag
                  size="small"
                  :type="getCategoryTag(pr.promptCategory)"
                  effect="plain"
                  style="margin-left: 4px"
                >
                  {{ getCategoryLabel(pr.promptCategory) }}
                </el-tag>
              </span>
              <span class="pr-card-time">{{ formatTime(pr.createdAt) }}</span>
            </div>
            <div class="pr-card-title">{{ pr.title }}</div>
            <div v-if="pr.description" class="pr-card-desc">
              {{ truncate(pr.description, 140) }}
            </div>
            <div class="pr-card-footer">
              <span class="submitter">
                由 <strong>{{ pr.submittedBy.name }}</strong> 提交
              </span>
              <el-button type="primary" size="small">
                去审核
                <el-icon style="margin-left: 2px"><ArrowRight /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Submit Feedback Dialog -->
    <el-dialog
      v-model="showSubmitDialog"
      title="提交反馈"
      width="640px"
      :close-on-click-modal="false"
      @closed="resetForm"
    >
      <el-form :model="submitForm" label-position="top">
        <!-- 问题描述 -->
        <el-form-item label="问题描述" required>
          <el-input
            v-model="submitForm.problemDescription"
            type="textarea"
            :rows="5"
            placeholder="请详细描述遇到的问题、改进建议或经验沉淀..."
          />
        </el-form-item>

        <!-- Markdown 附件 -->
        <el-form-item label="Markdown 附件（可选）">
          <div v-if="!submitForm.markdownFileName" class="upload-wrapper">
            <el-upload
              class="markdown-upload"
              drag
              action="#"
              accept=".md"
              :auto-upload="false"
              :show-file-list="false"
              :limit="1"
              :on-change="handleFileChange"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">
                拖动 <em>.md</em> 文件到此处 或 <em>点击上传</em>
              </div>
              <template #tip>
                <div class="el-upload__tip">仅支持 .md 文件，文件内容将被读取并保存</div>
              </template>
            </el-upload>
          </div>
          <div v-else class="file-selected">
            <el-icon><Document /></el-icon>
            <span class="file-selected-name">{{ submitForm.markdownFileName }}</span>
            <el-button
              type="danger"
              :icon="Delete"
              size="small"
              circle
              @click="removeMarkdown"
            />
          </div>
        </el-form-item>

        <!-- 关联提示词 -->
        <el-form-item label="关联提示词（可选）">
          <div class="prompt-select-row">
            <el-select
              v-model="promptCategoryFilter"
              placeholder="分类筛选"
              clearable
              class="category-select"
              @change="handleCategoryFilterChange"
            >
              <el-option label="全部" value="" />
              <el-option
                v-for="cat in categoryOptions"
                :key="cat.value"
                :label="cat.label"
                :value="cat.value"
              />
            </el-select>
            <el-select
              v-model="submitForm.linkedPromptId"
              filterable
              remote
              clearable
              :remote-method="searchPrompts"
              :loading="promptLoading"
              placeholder="搜索提示词名称..."
              class="prompt-select"
              @visible-change="handlePromptSelectVisible"
            >
              <el-option
                v-for="p in promptOptions"
                :key="p.id"
                :label="`${p.name} (${getCategoryLabel(p.category)})`"
                :value="p.id"
              />
            </el-select>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showSubmitDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          提交
        </el-button>
      </template>
    </el-dialog>

    <!-- Detail Drawer -->
    <el-drawer
      v-model="showDetailDrawer"
      title="反馈详情"
      size="640px"
      direction="rtl"
    >
      <template v-if="store.currentFeedback">
        <!-- Problem Description -->
        <div class="detail-section">
          <h4>问题描述</h4>
          <div class="raw-description">
            {{ store.currentFeedback.problemDescription }}
          </div>
        </div>

        <!-- Linked Prompt -->
        <div v-if="store.currentFeedback.linkedPrompt" class="detail-section">
          <h4>关联提示词</h4>
          <div class="linked-prompt-box">
            <div class="linked-prompt-name">
              {{ store.currentFeedback.linkedPrompt.name }}
            </div>
            <el-tag
              size="small"
              :type="getCategoryTag(store.currentFeedback.linkedPrompt.category)"
              effect="plain"
            >
              {{ getCategoryLabel(store.currentFeedback.linkedPrompt.category) }}
            </el-tag>
          </div>
        </div>

        <!-- Markdown Attachment -->
        <div v-if="store.currentFeedback.markdownContent" class="detail-section">
          <h4>
            Markdown 附件
            <span v-if="store.currentFeedback.markdownFileName" class="file-badge">
              <el-icon><Document /></el-icon>
              {{ store.currentFeedback.markdownFileName }}
            </span>
          </h4>
          <pre class="markdown-content">{{ store.currentFeedback.markdownContent }}</pre>
        </div>

        <!-- Metadata -->
        <div class="detail-section">
          <h4>基本信息</h4>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="提交者">
              {{ store.currentFeedback.createdBy.name }}
            </el-descriptions-item>
            <el-descriptions-item label="提交时间">
              {{ formatTime(store.currentFeedback.createdAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="更新时间">
              {{ formatTime(store.currentFeedback.updatedAt) }}
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- Delete -->
        <div class="detail-section">
          <el-button
            type="danger"
            plain
            size="small"
            :loading="deleting"
            @click="handleDelete"
          >
            删除反馈
          </el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import {
  Plus, Delete, Document, UploadFilled,
  Promotion, Bell, Notebook, Check, Close, ArrowRight, ChatDotSquare,
} from '@element-plus/icons-vue'
import { useExperienceStore } from '@/stores/experience'
import type { ExperienceFeedbackItem } from '@/api/experience'
import { listPromptsApi, listMyPrsApi, listPrsToReviewApi } from '@/api/prompt'
import type { PromptItem, PromptPrFeedItem } from '@/api/prompt'

const router = useRouter()
const route = useRoute()
const store = useExperienceStore()

// ========== Tabs ==========

type TabKey = 'mine' | 'to-review'
const activeTab = ref<TabKey>('mine')

function parseTabFromQuery(): TabKey {
  const q = route.query.tab
  if (q === 'to-review' || q === 'mine') return q
  return 'mine'
}

function handleTabChange(name: string | number) {
  const tab = String(name) as TabKey
  if (route.query.tab === tab) return
  router.replace({ query: { ...route.query, tab } })
  loadTab(tab)
}

async function loadTab(tab: TabKey) {
  if (tab === 'mine') {
    await loadMineFeed()
  } else if (tab === 'to-review') {
    await loadPrsToReview()
  }
}

// ========== Tab 1: 我的反馈（PR + ExperienceFeedback 合并的时间线）==========

/** 统一时间线的条目类型 */
type MineFeedItem =
  | {
      kind: 'pr'
      id: string
      sortAt: number
      pr: PromptPrFeedItem
    }
  | {
      kind: 'feedback'
      id: string
      sortAt: number
      feedback: ExperienceFeedbackItem
    }

const mineFeed = ref<MineFeedItem[]>([])
const mineLoading = ref(false)

async function loadMineFeed() {
  mineLoading.value = true
  try {
    // 两个来源并行拉取
    const [prsRes] = await Promise.all([
      listMyPrsApi(),
      store.fetchFeedbacks(),
    ])
    const prs = prsRes.data.data ?? []

    const merged: MineFeedItem[] = [
      ...prs.map<MineFeedItem>((pr) => ({
        kind: 'pr' as const,
        id: pr.id,
        sortAt: pr.createdAt,
        pr,
      })),
      ...store.feedbacks.map<MineFeedItem>((fb) => ({
        kind: 'feedback' as const,
        id: fb.id,
        sortAt: fb.createdAt,
        feedback: fb,
      })),
    ]
    merged.sort((a, b) => b.sortAt - a.sortAt)
    mineFeed.value = merged
  } finally {
    mineLoading.value = false
  }
}

// ========== Tab 2: 需要审核（我创建的 prompt 上的 OPEN PR）==========

const toReviewPrs = ref<PromptPrFeedItem[]>([])
const toReviewLoading = ref(false)

async function loadPrsToReview() {
  toReviewLoading.value = true
  try {
    const res = await listPrsToReviewApi()
    toReviewPrs.value = res.data.data ?? []
  } catch {
    /* handled */
  } finally {
    toReviewLoading.value = false
  }
}

function goToPrDetail(pr: PromptPrFeedItem) {
  router.push(`/prompts/${pr.promptId}/pr/${pr.id}`)
}

// ========== PR 状态展示 ==========

function prStatusLabel(status: 'OPEN' | 'MERGED' | 'REJECTED'): string {
  const map = { OPEN: '待审核', MERGED: '已合并', REJECTED: '已驳回' }
  return map[status]
}

function prStatusTagType(
  status: 'OPEN' | 'MERGED' | 'REJECTED',
): 'warning' | 'success' | 'danger' {
  const map: Record<'OPEN' | 'MERGED' | 'REJECTED', 'warning' | 'success' | 'danger'> = {
    OPEN: 'warning',
    MERGED: 'success',
    REJECTED: 'danger',
  }
  return map[status]
}

// ========== Prompt Categories ==========

const categoryOptions = [
  { value: 'DESIGN', label: '设计' },
  { value: 'FRONTEND', label: '前端' },
  { value: 'BACKEND', label: '后端' },
  { value: 'TESTING', label: '测试' },
  { value: 'INTEGRATION', label: '集成' },
  { value: 'OPTIMIZATION', label: '优化' },
]

function getCategoryLabel(category: string): string {
  return categoryOptions.find((c) => c.value === category)?.label ?? category
}

function getCategoryTag(category: string): 'success' | 'warning' | 'info' | 'danger' | '' {
  const map: Record<string, 'success' | 'warning' | 'info' | 'danger' | ''> = {
    DESIGN: 'warning',
    FRONTEND: 'success',
    BACKEND: '',
    TESTING: 'info',
    INTEGRATION: 'info',
    OPTIMIZATION: 'danger',
  }
  return map[category] ?? ''
}

// ========== Utils ==========

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN')
}

function truncate(str: string, maxLen: number): string {
  if (!str) return ''
  if (str.length <= maxLen) return str
  return str.substring(0, maxLen) + '...'
}

// Pagination 已删除（旧的经验记录 tab 没有了），分页以后按需再加回来

// ========== Submit Dialog ==========

const showSubmitDialog = ref(false)
const submitting = ref(false)

interface SubmitForm {
  problemDescription: string
  markdownContent: string
  markdownFileName: string
  linkedPromptId: string
}

const submitForm = ref<SubmitForm>({
  problemDescription: '',
  markdownContent: '',
  markdownFileName: '',
  linkedPromptId: '',
})

function openSubmitDialog() {
  resetForm()
  showSubmitDialog.value = true
}

function resetForm() {
  submitForm.value = {
    problemDescription: '',
    markdownContent: '',
    markdownFileName: '',
    linkedPromptId: '',
  }
  promptCategoryFilter.value = ''
  promptOptions.value = []
}

// ========== File Upload ==========

function handleFileChange(uploadFile: UploadFile) {
  const rawFile = uploadFile.raw
  if (!rawFile) {
    return
  }
  if (!rawFile.name.toLowerCase().endsWith('.md')) {
    ElMessage.warning('只支持 .md 文件')
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target?.result
    if (typeof result === 'string') {
      submitForm.value.markdownContent = result
      submitForm.value.markdownFileName = rawFile.name
    }
  }
  reader.onerror = () => {
    ElMessage.error('读取文件失败')
  }
  reader.readAsText(rawFile, 'utf-8')
}

function removeMarkdown() {
  submitForm.value.markdownContent = ''
  submitForm.value.markdownFileName = ''
}

// ========== Prompt Search ==========

const promptCategoryFilter = ref('')
const promptLoading = ref(false)
const promptOptions = ref<PromptItem[]>([])

async function loadPrompts(query: string) {
  promptLoading.value = true
  try {
    const res = await listPromptsApi({
      page: 1,
      pageSize: 50,
      keyword: query || undefined,
      category: promptCategoryFilter.value || undefined,
    })
    if (res.data.code === 0 && res.data.data) {
      promptOptions.value = res.data.data.items
    } else {
      promptOptions.value = []
    }
  } catch {
    promptOptions.value = []
  } finally {
    promptLoading.value = false
  }
}

function searchPrompts(query: string) {
  void loadPrompts(query)
}

function handleCategoryFilterChange() {
  void loadPrompts('')
}

function handlePromptSelectVisible(visible: boolean) {
  if (visible && promptOptions.value.length === 0) {
    void loadPrompts('')
  }
}

// ========== Submit ==========

async function handleSubmit() {
  if (!submitForm.value.problemDescription.trim()) {
    ElMessage.warning('请填写问题描述')
    return
  }
  submitting.value = true
  try {
    await store.createFeedback({
      problemDescription: submitForm.value.problemDescription.trim(),
      markdownContent: submitForm.value.markdownContent || null,
      markdownFileName: submitForm.value.markdownFileName || null,
      linkedPromptId: submitForm.value.linkedPromptId || null,
    })
    ElMessage.success('已提交')
    showSubmitDialog.value = false
    // 刷新"我的反馈"时间线，让新提交的经验立即出现
    await loadMineFeed()
  } catch (err) {
    const message = err instanceof Error ? err.message : '提交失败'
    ElMessage.error(message)
  } finally {
    submitting.value = false
  }
}

// ========== Detail Drawer ==========

const showDetailDrawer = ref(false)

async function openDetail(row: ExperienceFeedbackItem) {
  showDetailDrawer.value = true
  await store.fetchFeedbackDetail(row.id)
}

// ========== Delete ==========

const deleting = ref(false)

async function handleDelete() {
  if (!store.currentFeedback) return
  try {
    await ElMessageBox.confirm('确定删除此反馈？删除后不可恢复。', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  deleting.value = true
  try {
    await store.deleteFeedback(store.currentFeedback.id)
    ElMessage.success('已删除')
    showDetailDrawer.value = false
    await loadMineFeed()
  } finally {
    deleting.value = false
  }
}

// ========== Init ==========

onMounted(async () => {
  activeTab.value = parseTabFromQuery()
  await loadTab(activeTab.value)
})
</script>

<style scoped>
.experience-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 4px 0 0;
}

/* ========== Tabs ========== */

.main-tabs {
  margin-bottom: 8px;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-badge :deep(.el-badge__content) {
  position: relative;
  top: -1px;
  right: 0;
  transform: none;
  vertical-align: middle;
}

/* ========== PR feed cards (tab 1 + tab 2) ========== */

.pr-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 240px;
  padding-top: 4px;
}

.pr-card {
  --accent: #409eff;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  padding: 14px 18px;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}

.pr-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.14);
  transform: translateY(-1px);
}

.pr-card.status-open {
  --accent: #e6a23c;
}

.pr-card.status-merged {
  --accent: #67c23a;
  background: linear-gradient(to right, rgba(103, 194, 58, 0.04), #ffffff 60%);
}

.pr-card.status-rejected {
  --accent: #f56c6c;
  background: linear-gradient(to right, rgba(245, 108, 108, 0.04), #ffffff 60%);
}

/* 经验反馈（ExperienceFeedback）的色调 */
.pr-card.status-feedback {
  --accent: #67c23a;
  background: linear-gradient(to right, rgba(103, 194, 58, 0.04), #ffffff 60%);
}

.kind-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 500;
}

.attachment-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
  background: #f0f2f5;
  padding: 4px 10px;
  border-radius: 4px;
}

.attachment-line .el-icon {
  color: #409eff;
}

.pr-card.is-pending {
  background: linear-gradient(to right, rgba(230, 162, 60, 0.05), #ffffff 60%);
}

.pr-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  flex-wrap: wrap;
}

.pr-card-prompt {
  color: #606266;
}

.pr-card-prompt strong {
  color: #303133;
  margin: 0 2px;
}

.pr-card-time {
  margin-left: auto;
  font-size: 12px;
  color: #c0c4cc;
}

.pr-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
  line-height: 1.4;
}

.pr-card-desc {
  font-size: 13px;
  color: #606266;
  line-height: 1.55;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pr-card-review {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.pr-card-review.review-merged {
  background: #f0f9eb;
  color: #529b2e;
}

.pr-card-review.review-rejected {
  background: #fef0f0;
  color: #c45656;
}

.pr-card-review strong {
  margin-right: 2px;
}

.pr-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f2f3f5;
  font-size: 12px;
  color: #909399;
}

.pr-card-footer .submitter strong {
  color: #303133;
  margin: 0 2px;
}

.empty-hint {
  font-size: 12px;
  color: #c0c4cc;
  display: block;
  margin-top: 8px;
}

/* ========== Table ========== */

.feedback-table {
  cursor: pointer;
}

.description-text {
  font-size: 13px;
  color: #303133;
  line-height: 1.5;
}

.prompt-name {
  font-size: 13px;
  color: #303133;
  margin-right: 6px;
}

.category-tag {
  font-size: 11px;
}

.attachment-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #606266;
}

.file-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-muted {
  color: #c0c4cc;
  font-size: 13px;
}

/* ========== Pagination ========== */

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

/* ========== Submit Dialog ========== */

.upload-wrapper {
  width: 100%;
}

.markdown-upload :deep(.el-upload-dragger) {
  padding: 24px 20px;
}

.file-selected {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
}

.file-selected-name {
  flex: 1;
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-select-row {
  display: flex;
  gap: 10px;
  width: 100%;
}

.category-select {
  width: 140px;
  flex-shrink: 0;
}

.prompt-select {
  flex: 1;
}

/* ========== Detail Drawer ========== */

.detail-section {
  margin-bottom: 24px;
}

.detail-section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.raw-description {
  font-size: 14px;
  color: #606266;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
}

.linked-prompt-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.linked-prompt-name {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

.markdown-content {
  font-size: 12px;
  color: #303133;
  line-height: 1.6;
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
  max-height: 420px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
  margin: 0;
}
</style>
