<template>
  <div class="pr-detail-page" v-loading="loading">
    <el-button link @click="router.back()" class="back-btn">
      <el-icon><ArrowLeft /></el-icon> 返回
    </el-button>

    <template v-if="promptStore.currentPr">
      <!-- PR Header -->
      <div class="pr-header">
        <div class="pr-header-left">
          <h2 class="pr-title">{{ promptStore.currentPr.title }}</h2>
          <div class="pr-meta">
            <el-tag
              :type="prStatusType(promptStore.currentPr.status)"
              size="default"
            >
              {{ prStatusLabel(promptStore.currentPr.status) }}
            </el-tag>
            <span class="meta-text">
              由 {{ promptStore.currentPr.submittedBy.name }} 提交于
              {{ formatTime(promptStore.currentPr.createdAt) }}
            </span>
          </div>
        </div>
        <div class="pr-header-actions" v-if="isPromptOwner && promptStore.currentPr.status === 'OPEN'">
          <el-button type="success" @click="showReviewDialog('merge')">
            <el-icon><Select /></el-icon> 合并
          </el-button>
          <el-button type="danger" @click="showReviewDialog('reject')">
            <el-icon><CloseBold /></el-icon> 拒绝
          </el-button>
        </div>
      </div>

      <!-- Description -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-title">描述</div>
        </template>
        <p class="pr-description">{{ promptStore.currentPr.description }}</p>
      </el-card>

      <!-- Diff view -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-title">内容变更</div>
        </template>
        <div class="diff-view">
          <pre class="diff-content">{{ promptStore.currentPr.diff }}</pre>
        </div>
      </el-card>

      <!-- New content preview -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-title">修改后内容预览</div>
        </template>
        <pre class="new-content-preview">{{ promptStore.currentPr.newContent }}</pre>
      </el-card>

      <!-- Review comment if exists -->
      <el-card
        v-if="promptStore.currentPr.reviewedBy"
        shadow="never"
        class="section-card"
      >
        <template #header>
          <div class="card-title">审核意见</div>
        </template>
        <div class="review-info">
          <div class="review-meta">
            <span>{{ promptStore.currentPr.reviewedBy.name }}</span>
            <el-tag
              :type="prStatusType(promptStore.currentPr.status)"
              size="small"
            >
              {{ prStatusLabel(promptStore.currentPr.status) }}
            </el-tag>
            <span class="review-time">{{ formatTime(promptStore.currentPr.updatedAt) }}</span>
          </div>
          <p class="review-comment" v-if="promptStore.currentPr.reviewComment">
            {{ promptStore.currentPr.reviewComment }}
          </p>
          <p class="review-comment" v-else style="color: #c0c4cc;">(未留下评论)</p>
        </div>
      </el-card>
    </template>

    <!-- Review Dialog -->
    <el-dialog v-model="reviewDialogVisible" :title="reviewAction === 'merge' ? '合并改进建议' : '拒绝改进建议'" width="500px">
      <p v-if="reviewAction === 'merge'">合并后，提示词内容将被更新为建议的新版本。</p>
      <p v-else>请说明拒绝的原因，帮助提交者改进。</p>
      <el-input
        v-model="reviewComment"
        type="textarea"
        :rows="4"
        placeholder="审核评论（可选）"
      />
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button
          :type="reviewAction === 'merge' ? 'success' : 'danger'"
          :loading="reviewing"
          @click="handleReview"
        >
          {{ reviewAction === 'merge' ? '确认合并' : '确认拒绝' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Select, CloseBold } from '@element-plus/icons-vue'
import { usePromptStore } from '@/stores/prompt'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const promptStore = usePromptStore()
const authStore = useAuthStore()

const prId = computed(() => route.params.prId as string)
const promptId = computed(() => route.params.id as string)
const loading = ref(false)

const isPromptOwner = computed(() => {
  return promptStore.currentPrompt?.createdBy.id === authStore.user?.id
})

const reviewDialogVisible = ref(false)
const reviewAction = ref<'merge' | 'reject'>('merge')
const reviewComment = ref('')
const reviewing = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([
      promptStore.fetchPrDetail(prId.value),
      promptStore.fetchPromptDetail(promptId.value),
    ])
  } finally {
    loading.value = false
  }
})

function showReviewDialog(action: 'merge' | 'reject') {
  reviewAction.value = action
  reviewComment.value = ''
  reviewDialogVisible.value = true
}

async function handleReview() {
  reviewing.value = true
  try {
    await promptStore.reviewPr(prId.value, {
      action: reviewAction.value,
      comment: reviewComment.value || undefined,
    })
    ElMessage.success(reviewAction.value === 'merge' ? '已合并' : '已拒绝')
    reviewDialogVisible.value = false
    // Refresh
    await promptStore.fetchPrDetail(prId.value)
    if (reviewAction.value === 'merge') {
      await promptStore.fetchPromptDetail(promptId.value)
    }
  } finally {
    reviewing.value = false
  }
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
.pr-detail-page {
  padding: 0;
}

.back-btn {
  margin-bottom: 16px;
  color: #909399;
}

.pr-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
}

.pr-header-left {
  flex: 1;
}

.pr-title {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}

.pr-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-text {
  font-size: 13px;
  color: #909399;
}

.pr-header-actions {
  display: flex;
  gap: 8px;
}

.section-card {
  margin-bottom: 16px;
}

.card-title {
  font-weight: 600;
  font-size: 14px;
}

.pr-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #606266;
}

.diff-view {
  max-height: 500px;
  overflow-y: auto;
}

.diff-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 12px;
  line-height: 1.6;
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
  margin: 0;
  padding: 12px;
  background: #fafafa;
  border-radius: 6px;
}

.new-content-preview {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
  background: #f0f9eb;
  padding: 16px;
  border-radius: 6px;
  margin: 0;
  font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', monospace;
}

.review-info {
  padding: 0;
}

.review-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.review-time {
  font-size: 12px;
  color: #c0c4cc;
  font-weight: 400;
}

.review-comment {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #606266;
}
</style>
