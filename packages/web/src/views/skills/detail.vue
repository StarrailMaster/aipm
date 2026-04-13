<template>
  <div class="skill-detail-page" v-loading="skillStore.detailLoading">
    <template v-if="skillStore.currentSkill">
      <!-- Back -->
      <el-button link @click="router.push('/skills')" class="back-btn">
        <el-icon><ArrowLeft /></el-icon> 返回列表
      </el-button>

      <!-- Header -->
      <div class="detail-header">
        <div class="header-left">
          <h2 class="skill-name">{{ skillStore.currentSkill.name }}</h2>
          <div class="skill-meta">
            <el-tag :type="categoryTagType(skillStore.currentSkill.category)" size="small" effect="plain">
              {{ categoryLabel(skillStore.currentSkill.category) }}
            </el-tag>
            <span class="meta-text">
              由 {{ skillStore.currentSkill.createdBy.name }} 创建于
              {{ formatTime(skillStore.currentSkill.createdAt) }}
            </span>
          </div>
        </div>
        <div class="header-actions">
          <el-button
            :type="skillStore.currentSkill.isStarred ? 'warning' : 'default'"
            @click="handleToggleStar"
          >
            <el-icon>
              <StarFilled v-if="skillStore.currentSkill.isStarred" />
              <Star v-else />
            </el-icon>
            {{ skillStore.currentSkill.isStarred ? '已收藏' : '收藏' }}
            ({{ skillStore.currentSkill.starCount }})
          </el-button>
          <el-button @click="showForkDialog = true">
            <el-icon><DocumentCopy /></el-icon>
            复制 ({{ skillStore.currentSkill.forkCount }})
          </el-button>
          <el-button v-if="isOwner" type="primary" @click="showEditDialog = true">
            <el-icon><Edit /></el-icon> 编辑
          </el-button>
          <el-popconfirm
            v-if="isOwner"
            title="确认删除此 Skill？"
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
      <p v-if="skillStore.currentSkill.description" class="skill-description">
        {{ skillStore.currentSkill.description }}
      </p>

      <!-- Tags -->
      <div class="skill-tags" v-if="skillStore.currentSkill.tags.length">
        <el-tag
          v-for="tag in skillStore.currentSkill.tags"
          :key="tag"
          size="small"
          type="info"
          effect="plain"
        >
          {{ tag }}
        </el-tag>
      </div>

      <!-- Main layout -->
      <div class="detail-body">
        <div class="content-area">
          <!-- Content -->
          <el-card shadow="never" class="content-card">
            <template #header>
              <div class="card-title">Skill 内容</div>
            </template>
            <pre class="skill-content-text">{{ skillStore.currentSkill.content }}</pre>
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
                <el-tag size="small" :type="visibilityTagType(skillStore.currentSkill.visibility)">
                  {{ visibilityLabel(skillStore.currentSkill.visibility) }}
                </el-tag>
              </div>
              <div class="info-row" v-if="skillStore.currentSkill.sourceId">
                <span class="info-label">复制自</span>
                <el-link type="primary" @click="router.push(`/skills/${skillStore.currentSkill.sourceId}`)">
                  查看原版
                </el-link>
              </div>
            </div>
          </el-card>

          <el-card shadow="never" class="sidebar-card" v-if="skillStore.currentSkill.gitRepoUrl">
            <template #header>
              <div class="card-title">Git 仓库</div>
            </template>
            <a
              :href="skillStore.currentSkill.gitRepoUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="git-repo-link"
            >
              <el-icon><Link /></el-icon>
              {{ skillStore.currentSkill.gitRepoUrl }}
            </a>
          </el-card>
        </div>
      </div>
    </template>

    <!-- Fork Dialog -->
    <el-dialog v-model="showForkDialog" title="复制 Skill" width="400px">
      <p>将此 Skill 复制到你的私有空间。</p>
      <el-input v-model="forkName" placeholder="可选：输入新名称（留空则自动命名）" />
      <template #footer>
        <el-button @click="showForkDialog = false">取消</el-button>
        <el-button type="primary" :loading="forking" @click="handleFork">确认复制</el-button>
      </template>
    </el-dialog>

    <!-- Edit Dialog -->
    <el-dialog v-model="showEditDialog" title="编辑 Skill" width="600px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="editForm.category" style="width: 200px">
            <el-option label="阶段辅助" value="STAGE_HELPER" />
            <el-option label="质量检查" value="QUALITY_CHECK" />
            <el-option label="通用工具" value="GENERAL_TOOL" />
          </el-select>
        </el-form-item>
        <el-form-item label="技术标签">
          <el-select
            v-model="editForm.tags"
            multiple
            filterable
            allow-create
            placeholder="输入标签后回车"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Git 仓库">
          <el-input v-model="editForm.gitRepoUrl" placeholder="https://github.com/..." />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="editForm.content" type="textarea" :rows="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="editing" @click="handleEdit">保存</el-button>
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
  Link,
} from '@element-plus/icons-vue'
import { useSkillStore } from '@/stores/skill'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const skillStore = useSkillStore()
const authStore = useAuthStore()

const skillId = computed(() => route.params.id as string)
const isOwner = computed(
  () => skillStore.currentSkill?.createdBy.id === authStore.user?.id,
)

const showForkDialog = ref(false)
const forkName = ref('')
const forking = ref(false)

const showEditDialog = ref(false)
const editing = ref(false)
const editForm = ref({
  name: '',
  description: '',
  category: '',
  tags: [] as string[],
  content: '',
  gitRepoUrl: '',
})

onMounted(() => {
  skillStore.fetchSkillDetail(skillId.value)
})

watch(() => route.params.id, () => {
  if (route.params.id) {
    skillStore.fetchSkillDetail(route.params.id as string)
  }
})

watch(showEditDialog, (val) => {
  if (val && skillStore.currentSkill) {
    const s = skillStore.currentSkill
    editForm.value = {
      name: s.name,
      description: s.description ?? '',
      category: s.category,
      tags: [...s.tags],
      content: s.content,
      gitRepoUrl: s.gitRepoUrl ?? '',
    }
  }
})

async function handleToggleStar() {
  await skillStore.toggleStar(skillId.value)
}

async function handleFork() {
  forking.value = true
  try {
    const forked = await skillStore.forkSkill(skillId.value, forkName.value || undefined)
    ElMessage.success('复制成功')
    showForkDialog.value = false
    forkName.value = ''
    router.push(`/skills/${forked.id}`)
  } finally {
    forking.value = false
  }
}

async function handleEdit() {
  if (!editForm.value.name.trim() || !editForm.value.content.trim()) {
    ElMessage.warning('请填写名称和内容')
    return
  }
  editing.value = true
  try {
    await skillStore.updateSkill(skillId.value, {
      name: editForm.value.name,
      description: editForm.value.description || undefined,
      category: editForm.value.category,
      tags: editForm.value.tags,
      content: editForm.value.content,
      gitRepoUrl: editForm.value.gitRepoUrl || undefined,
    })
    ElMessage.success('更新成功')
    showEditDialog.value = false
  } finally {
    editing.value = false
  }
}

async function handleDelete() {
  await skillStore.deleteSkill(skillId.value)
  ElMessage.success('删除成功')
  router.push('/skills')
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

function visibilityLabel(v: string) {
  const map: Record<string, string> = { private: '私有', team: '团队', public: '公开' }
  return map[v] ?? v
}

function visibilityTagType(v: string) {
  const map: Record<string, string> = { private: 'info', team: '', public: 'success' }
  return (map[v] ?? '') as '' | 'success' | 'info' | 'warning' | 'danger'
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN')
}
</script>

<style scoped>
.skill-detail-page {
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

.skill-name {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}

.skill-meta {
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

.skill-description {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 16px;
}

.skill-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 20px;
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
  margin-bottom: 20px;
}

.card-title {
  font-weight: 600;
  font-size: 14px;
}

.skill-content-text {
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

.git-repo-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #409eff;
  text-decoration: none;
  font-size: 13px;
  word-break: break-all;
}

.git-repo-link:hover {
  text-decoration: underline;
}
</style>
