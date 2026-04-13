<template>
  <div class="sop-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h2 class="page-title">SOP 模板</h2>
        <p class="page-subtitle">共用模板：每份 SOP 是一组提示词的组合，项目套用它来推进</p>
      </div>
      <el-button type="primary" @click="showCreateDialog = true">
        <el-icon><Plus /></el-icon>
        新建 SOP 模板
      </el-button>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索 SOP 模板..."
        clearable
        :prefix-icon="Search"
        style="width: 280px"
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      />
      <el-select
        v-model="filterVisibility"
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

    <!-- Card grid -->
    <div v-loading="sopStore.loading" class="card-grid">
      <el-empty
        v-if="!sopStore.loading && sopStore.projects.length === 0"
        description="暂无 SOP 模板"
      >
        <el-button type="primary" @click="showCreateDialog = true">新建一个</el-button>
      </el-empty>

      <div
        v-for="project in sopStore.projects"
        :key="project.id"
        class="sop-card"
        @click="router.push(`/sop/${project.id}`)"
      >
        <!-- Header: icon + name + version -->
        <div class="card-header">
          <div class="card-icon">
            <el-icon :size="20"><Collection /></el-icon>
          </div>
          <div class="card-title-wrap">
            <div class="card-name">{{ project.name }}</div>
            <div class="card-sub">
              <el-tag size="small" type="info" effect="plain">{{ project.version }}</el-tag>
              <el-tag
                :type="visibilityTagType(project.visibility)"
                size="small"
                effect="plain"
              >
                {{ visibilityLabel(project.visibility) }}
              </el-tag>
            </div>
          </div>
          <el-dropdown trigger="click" @click.stop>
            <el-icon class="more-btn" @click.stop><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click.stop="handleEdit(project)">
                  <el-icon><EditPen /></el-icon>
                  编辑
                </el-dropdown-item>
                <el-dropdown-item divided @click.stop="handleDelete(project.id)">
                  <el-icon><Delete /></el-icon>
                  删除
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- Description -->
        <p class="card-desc">
          {{ project.description || '暂无描述' }}
        </p>

        <!-- Stats row -->
        <div class="card-stats">
          <div class="stat-chip">
            <el-icon :size="14"><Document /></el-icon>
            <span>{{ project.documentCount }} 份文档</span>
          </div>
        </div>

        <!-- Footer: author + updated time -->
        <div class="card-footer">
          <div class="author">
            <el-avatar :size="20" class="author-avatar">
              {{ project.createdBy.name.charAt(0) }}
            </el-avatar>
            <span class="author-name">{{ project.createdBy.name }}</span>
          </div>
          <span class="updated-at">{{ formatTime(project.updatedAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination-wrapper" v-if="sopStore.total > 0">
      <el-pagination
        v-model:current-page="sopStore.currentPage"
        v-model:page-size="sopStore.pageSize"
        :total="sopStore.total"
        :page-sizes="[12, 20, 40]"
        layout="total, sizes, prev, pager, next"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingProject ? '编辑 SOP 模板' : '新建 SOP 模板'"
      width="500px"
      @close="resetForm"
    >
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="例：SaaS 官网全栈模板" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="描述这个模板能用来做什么类型的项目"
          />
        </el-form-item>
        <el-form-item label="可见性">
          <el-select v-model="form.visibility" style="width: 100%">
            <el-option label="私有" value="private" />
            <el-option label="团队" value="team" />
            <el-option label="公开" value="public" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ editingProject ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Search, MoreFilled, EditPen, Delete, Collection, Document,
} from '@element-plus/icons-vue'
import { useSopStore } from '@/stores/sop'
import type { SopProjectItem } from '@/api/sop'

const router = useRouter()
const sopStore = useSopStore()

const searchKeyword = ref('')
const filterVisibility = ref<'' | 'private' | 'team' | 'public'>('')
const showCreateDialog = ref(false)
const submitting = ref(false)
const editingProject = ref<SopProjectItem | null>(null)

const form = ref({
  name: '',
  description: '',
  visibility: 'team' as 'private' | 'team' | 'public',
})

onMounted(() => {
  sopStore.fetchProjects()
})

function handleSearch() {
  sopStore.fetchProjects({
    page: 1,
    keyword: searchKeyword.value || undefined,
    visibility: filterVisibility.value || undefined,
  })
}

function handlePageChange(page: number) {
  sopStore.fetchProjects({
    page,
    keyword: searchKeyword.value || undefined,
    visibility: filterVisibility.value || undefined,
  })
}

function handleSizeChange(size: number) {
  sopStore.fetchProjects({
    page: 1,
    pageSize: size,
    keyword: searchKeyword.value || undefined,
    visibility: filterVisibility.value || undefined,
  })
}

function handleEdit(row: SopProjectItem) {
  editingProject.value = row
  form.value = {
    name: row.name,
    description: row.description ?? '',
    visibility: row.visibility,
  }
  showCreateDialog.value = true
}

async function handleDelete(id: string) {
  try {
    await ElMessageBox.confirm('确认删除此 SOP 模板？该操作不可恢复。', '删除 SOP 模板', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await sopStore.deleteProject(id)
    ElMessage.success('删除成功')
  } catch {
    // Error handled by interceptor
  }
}

async function handleSubmit() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入模板名称')
    return
  }

  submitting.value = true
  try {
    if (editingProject.value) {
      await sopStore.updateProject(editingProject.value.id, {
        name: form.value.name,
        description: form.value.description || undefined,
        visibility: form.value.visibility,
      })
      ElMessage.success('更新成功')
    } else {
      await sopStore.createProject({
        name: form.value.name,
        description: form.value.description || undefined,
        visibility: form.value.visibility,
      })
      ElMessage.success('创建成功')
    }
    showCreateDialog.value = false
    resetForm()
    sopStore.fetchProjects({ keyword: searchKeyword.value || undefined })
  } catch {
    // Error handled by interceptor
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  editingProject.value = null
  form.value = { name: '', description: '', visibility: 'team' }
}

function visibilityLabel(v: string) {
  const map: Record<string, string> = { private: '私有', team: '团队', public: '公开' }
  return map[v] ?? v
}

function visibilityTagType(v: string): '' | 'success' | 'info' | 'warning' | 'danger' {
  const map: Record<string, '' | 'success' | 'info' | 'warning' | 'danger'> = {
    private: 'info',
    team: '',
    public: 'success',
  }
  return map[v] ?? ''
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return d.toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.sop-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
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

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  align-items: center;
}

/* ========== Card grid ========== */

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.sop-card {
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: #fff;
  display: flex;
  flex-direction: column;
  position: relative;
}

.sop-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 18px;
  bottom: 18px;
  width: 3px;
  background: linear-gradient(180deg, #409eff, #67c23a);
  border-radius: 0 3px 3px 0;
  opacity: 0;
  transition: opacity 0.2s;
}

.sop-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.12);
  transform: translateY(-2px);
}

.sop-card:hover::before {
  opacity: 1;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.card-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ecf5ff, #f0f9eb);
  color: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-title-wrap {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.card-sub {
  display: flex;
  gap: 4px;
  align-items: center;
}

.more-btn {
  flex-shrink: 0;
  color: #c0c4cc;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 18px;
  transition: all 0.2s;
}

.more-btn:hover {
  color: #409eff;
  background: #f5f9ff;
}

.card-desc {
  color: #909399;
  font-size: 13px;
  margin: 0 0 14px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
  min-height: 40px;
}

.card-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: #f5f7fa;
  border-radius: 999px;
  font-size: 12px;
  color: #606266;
}

.stat-chip .el-icon {
  color: #409eff;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid #f2f3f5;
}

.author {
  display: flex;
  align-items: center;
  gap: 6px;
}

.author-avatar {
  background: linear-gradient(135deg, #409eff, #67c23a);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.author-name {
  font-size: 12px;
  color: #606266;
}

.updated-at {
  font-size: 12px;
  color: #c0c4cc;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
