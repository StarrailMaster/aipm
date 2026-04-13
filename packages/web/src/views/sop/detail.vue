<template>
  <div v-loading="sopStore.loading" class="sop-detail">
    <!-- ========== LEFT: SOP layers + selected doc editor ========== -->
    <div class="sop-left">
      <div class="page-header">
        <div class="header-left">
          <el-button :icon="ArrowLeft" @click="router.push('/knowledge?tab=sop')">返回列表</el-button>
          <h2 v-if="sopStore.currentProject" class="page-title">
            {{ sopStore.currentProject.name }}
            <el-tag size="small" style="margin-left: 8px">{{ sopStore.currentProject.version }}</el-tag>
          </h2>
        </div>
        <el-button type="primary" @click="openAddDocDialog()">
          <el-icon><Plus /></el-icon>
          添加条目
        </el-button>
      </div>

      <!-- 8-layer tabs -->
      <el-tabs v-model="activeLayer" type="border-card">
        <el-tab-pane
          v-for="layer in SOP_LAYERS"
          :key="layer.value"
          :label="`${layer.label} (${layerDocuments(layer.value).length})`"
          :name="layer.value"
        >
          <div v-if="layerDocuments(layer.value).length === 0" class="empty-layer">
            <el-empty description="暂无条目">
              <el-button type="primary" size="small" @click="openAddDocDialog(layer.value)">
                添加条目
              </el-button>
            </el-empty>
          </div>

          <div v-else class="doc-grid">
            <div
              v-for="doc in layerDocuments(layer.value)"
              :key="doc.id"
              class="doc-card"
              :class="{ active: selectedDocId === doc.id }"
              @click="selectDocument(doc)"
            >
              <div class="doc-card-header">
                <span class="doc-title">{{ doc.title }}</span>
                <el-dropdown trigger="click" @click.stop>
                  <el-icon class="doc-more-btn" @click.stop><MoreFilled /></el-icon>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="openEditDocDialog(doc)">
                        <el-icon><EditPen /></el-icon>
                        编辑信息
                      </el-dropdown-item>
                      <el-dropdown-item divided @click="handleDeleteDoc(doc.id)">
                        <el-icon><Delete /></el-icon>
                        删除条目
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <div v-if="doc.description" class="doc-desc">{{ doc.description }}</div>
              <div class="doc-meta">
                <el-tag size="small" type="info">
                  <el-icon><Box /></el-icon>
                  {{ doc.prompts.length }} 个提示词
                </el-tag>
                <el-tag v-for="tag in doc.tags" :key="tag" size="small" type="info" effect="plain" class="doc-tag">
                  {{ tag }}
                </el-tag>
                <span class="doc-version">v{{ doc.version }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- Prompt references editor (when a doc is selected) -->
      <div v-if="selectedDoc" class="editor-section">
        <div class="editor-header">
          <h3 class="editor-title">
            {{ selectedDoc.title }}
            <span class="editor-count">{{ selectedDoc.prompts.length }} 个提示词</span>
          </h3>
          <div class="editor-actions">
            <el-button size="small" @click="showVersionDialog = true">
              <el-icon><Clock /></el-icon>
              版本历史 v{{ selectedDoc.version }}
            </el-button>
          </div>
        </div>

        <el-empty
          v-if="selectedDoc.prompts.length === 0"
          description="还没有引用提示词 —— 从右侧提示词库点击卡片即可添加"
          :image-size="80"
        />

        <!-- Prompt refs list -->
        <div v-else class="prompt-ref-list">
          <div
            v-for="(refItem, idx) in selectedDoc.prompts"
            :key="refItem.id"
            class="prompt-ref-card"
          >
            <div class="prompt-ref-order">{{ idx + 1 }}</div>
            <div class="prompt-ref-main">
              <div class="prompt-ref-head">
                <span class="prompt-ref-name">{{ refItem.prompt.name }}</span>
                <el-tag size="small" :type="categoryTagType(refItem.prompt.category)">
                  {{ categoryLabel(refItem.prompt.category) }}
                </el-tag>
                <span class="prompt-ref-star">
                  <el-icon :size="12"><Star /></el-icon>
                  {{ refItem.prompt.starCount }}
                </span>
              </div>
              <div v-if="refItem.prompt.description" class="prompt-ref-desc">{{ refItem.prompt.description }}</div>
              <div v-if="refItem.note" class="prompt-ref-note">
                <el-icon :size="12"><ChatDotSquare /></el-icon>
                {{ refItem.note }}
              </div>
            </div>
            <div class="prompt-ref-actions">
              <el-tooltip content="上移" placement="top">
                <el-button
                  size="small"
                  circle
                  :icon="Top"
                  :disabled="idx === 0"
                  @click="moveRef(idx, idx - 1)"
                />
              </el-tooltip>
              <el-tooltip content="下移" placement="top">
                <el-button
                  size="small"
                  circle
                  :icon="Bottom"
                  :disabled="idx === selectedDoc.prompts.length - 1"
                  @click="moveRef(idx, idx + 1)"
                />
              </el-tooltip>
              <el-tooltip content="编辑备注" placement="top">
                <el-button
                  size="small"
                  circle
                  :icon="EditPen"
                  @click="openEditRefNoteDialog(refItem)"
                />
              </el-tooltip>
              <el-tooltip content="移除" placement="top">
                <el-button
                  size="small"
                  circle
                  type="danger"
                  :icon="Delete"
                  @click="handleRemoveRef(refItem.id)"
                />
              </el-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== RIGHT: Prompt library quick-pick sidebar ========== -->
    <aside class="sop-right">
      <div class="sidebar-header">
        <h4 class="sidebar-title">
          <el-icon><ChatLineSquare /></el-icon>
          提示词库
        </h4>
        <div v-if="selectedDoc" class="target-hint">
          点击卡片添加到
          <strong>{{ selectedDoc.title }}</strong>
        </div>
        <div v-else class="target-hint no-target">
          <el-icon><InfoFilled /></el-icon>
          先在左边选一个 SOP 条目，再点击添加
        </div>
      </div>

      <el-input
        v-model="promptSearchKeyword"
        placeholder="搜索提示词..."
        :prefix-icon="Search"
        clearable
        size="default"
        class="sidebar-search"
        @input="debouncedLoadPrompts"
      />

      <div class="category-tabs">
        <el-tag
          v-for="cat in PROMPT_CATEGORIES_WITH_ALL"
          :key="cat.value"
          :type="promptFilterCategory === cat.value ? '' : 'info'"
          :effect="promptFilterCategory === cat.value ? 'dark' : 'plain'"
          class="category-tag"
          @click="selectCategory(cat.value)"
        >
          {{ cat.label }}
        </el-tag>
      </div>

      <div v-loading="promptsLoading" class="prompt-pick-list">
        <el-empty
          v-if="!promptsLoading && promptCandidates.length === 0"
          description="未找到提示词"
          :image-size="60"
        />
        <div
          v-for="p in promptCandidates"
          :key="p.id"
          class="pick-card"
          :class="{
            used: isPromptAlreadyUsed(p.id),
            disabled: !selectedDoc,
          }"
          @click="handleQuickAdd(p)"
        >
          <div class="pick-card-header">
            <el-tag :type="categoryTagType(p.category)" size="small" effect="plain">
              {{ categoryLabel(p.category) }}
            </el-tag>
            <span v-if="isPromptAlreadyUsed(p.id)" class="used-badge">
              <el-icon :size="12"><Check /></el-icon>
              已添加
            </span>
            <el-icon v-else-if="selectedDoc" class="add-icon" :size="14"><Plus /></el-icon>
          </div>
          <div class="pick-card-name">{{ p.name }}</div>
          <div v-if="p.description" class="pick-card-desc">{{ p.description }}</div>
        </div>
      </div>
    </aside>

    <!-- ========== Dialogs ========== -->

    <!-- Add/Edit document dialog -->
    <el-dialog
      v-model="showAddDocDialog"
      :title="editingDoc ? '编辑条目' : '添加 SOP 条目'"
      width="520px"
      @close="resetDocForm"
    >
      <el-form :model="docForm" label-width="80px">
        <el-form-item label="类型" required>
          <el-select v-model="docForm.layer" style="width: 100%" :disabled="!!editingDoc">
            <el-option
              v-for="layer in SOP_LAYERS"
              :key="layer.value"
              :label="layer.label"
              :value="layer.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="docForm.title" placeholder="例如：前端项目初始化流程" />
        </el-form-item>
        <el-form-item label="简要说明">
          <el-input
            v-model="docForm.description"
            type="textarea"
            :rows="3"
            placeholder="这个 SOP 条目是做什么的（非必填）"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="docForm.tagsStr" placeholder="多个标签用逗号分隔" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDocDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSaveDoc">
          {{ editingDoc ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Edit reference note dialog -->
    <el-dialog v-model="showEditRefDialog" title="编辑引用备注" width="480px">
      <el-form label-position="top">
        <el-form-item label="备注">
          <el-input
            v-model="editRefNote"
            type="textarea"
            :rows="3"
            placeholder="为这个提示词在本 SOP 里写一句说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditRefDialog = false">取消</el-button>
        <el-button type="primary" :loading="updatingRef" @click="handleSaveRefNote">保存</el-button>
      </template>
    </el-dialog>

    <!-- Version history dialog -->
    <el-dialog v-model="showVersionDialog" title="版本历史" width="680px">
      <div v-loading="loadingVersions">
        <el-empty
          v-if="!loadingVersions && sopStore.documentVersions.length === 0"
          description="暂无历史版本"
        />
        <el-table v-else :data="sopStore.documentVersions" stripe max-height="400">
          <el-table-column prop="version" label="版本" width="80">
            <template #default="{ row }">v{{ row.version }}</template>
          </el-table-column>
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="createdBy" label="修改者" width="120">
            <template #default="{ row }">{{ row.createdBy.name }}</template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" width="170">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, ArrowLeft, MoreFilled, EditPen, Delete, Box, Top, Bottom,
  Clock, Star, ChatDotSquare, Search, ChatLineSquare, InfoFilled, Check,
} from '@element-plus/icons-vue'
import { useSopStore } from '@/stores/sop'
import type { SopDocumentItem, SopDocumentPromptRef } from '@/api/sop'
import { listPromptsApi } from '@/api/prompt'

const route = useRoute()
const router = useRouter()
const sopStore = useSopStore()

const SOP_LAYERS = [
  { value: 'PRODUCT_REQ', label: '产品需求' },
  { value: 'CONTENT', label: '内容素材' },
  { value: 'DESIGN_SYSTEM', label: '设计系统' },
  { value: 'FRONTEND_ARCH', label: '前端架构' },
  { value: 'BACKEND_ARCH', label: '后端架构' },
  { value: 'AI_PROMPTS', label: 'AI 提示词' },
  { value: 'ACCEPTANCE', label: '验收标准' },
  { value: 'APPENDIX', label: '附录' },
]

const PROMPT_CATEGORIES_WITH_ALL = [
  { value: '', label: '全部' },
  { value: 'DESIGN', label: '设计' },
  { value: 'FRONTEND', label: '前端' },
  { value: 'BACKEND', label: '后端' },
  { value: 'TESTING', label: '测试' },
  { value: 'INTEGRATION', label: '集成' },
  { value: 'OPTIMIZATION', label: '优化' },
]

const activeLayer = ref('PRODUCT_REQ')
const selectedDocId = ref<string | null>(null)
const selectedDoc = ref<SopDocumentItem | null>(null)

// ========== Add/Edit doc dialog ==========
const showAddDocDialog = ref(false)
const submitting = ref(false)
const editingDoc = ref<SopDocumentItem | null>(null)
const docForm = ref({
  layer: 'PRODUCT_REQ',
  title: '',
  description: '',
  tagsStr: '',
})

function openAddDocDialog(layer?: string) {
  editingDoc.value = null
  docForm.value = {
    layer: layer ?? activeLayer.value,
    title: '',
    description: '',
    tagsStr: '',
  }
  showAddDocDialog.value = true
}

function openEditDocDialog(doc: SopDocumentItem) {
  editingDoc.value = doc
  docForm.value = {
    layer: doc.layer,
    title: doc.title,
    description: doc.description ?? '',
    tagsStr: doc.tags.join(', '),
  }
  showAddDocDialog.value = true
}

function resetDocForm() {
  editingDoc.value = null
  docForm.value = { layer: 'PRODUCT_REQ', title: '', description: '', tagsStr: '' }
}

async function handleSaveDoc() {
  if (!docForm.value.title.trim()) {
    ElMessage.warning('请输入条目标题')
    return
  }
  const projectId = route.params.id as string
  const tags = docForm.value.tagsStr.split(',').map((t) => t.trim()).filter(Boolean)

  submitting.value = true
  try {
    if (editingDoc.value) {
      await sopStore.updateDocument(editingDoc.value.id, {
        title: docForm.value.title,
        description: docForm.value.description || undefined,
        tags,
      })
      ElMessage.success('条目已更新')
    } else {
      const doc = await sopStore.createDocument(projectId, {
        layer: docForm.value.layer,
        title: docForm.value.title,
        description: docForm.value.description || undefined,
        tags,
      })
      ElMessage.success('条目已创建')
      activeLayer.value = doc.layer
      selectDocument(doc)
    }
    showAddDocDialog.value = false
    resetDocForm()
    await sopStore.fetchProject(projectId)
  } finally {
    submitting.value = false
  }
}

async function handleDeleteDoc(id: string) {
  try {
    await ElMessageBox.confirm('确认删除这个 SOP 条目？', '删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await sopStore.deleteDocument(id)
  ElMessage.success('已删除')
  if (selectedDocId.value === id) {
    selectedDocId.value = null
    selectedDoc.value = null
  }
}

// ========== Document selection ==========

function layerDocuments(layer: string): SopDocumentItem[] {
  if (!sopStore.currentProject) return []
  return sopStore.currentProject.documents.filter((d) => d.layer === layer)
}

function selectDocument(doc: SopDocumentItem) {
  selectedDocId.value = doc.id
  selectedDoc.value = doc
}

/** 在 currentProject 里查找最新的 selectedDoc，用于 add/remove/reorder 后刷新本地视图 */
function refreshSelectedDoc() {
  if (!selectedDoc.value) return
  const updated = sopStore.currentProject?.documents.find((d) => d.id === selectedDoc.value!.id)
  if (updated) selectedDoc.value = updated
}

// ========== Prompt library sidebar (click-to-add) ==========

interface PromptCandidate {
  id: string
  name: string
  description: string | null
  category: string
  starCount?: number
}

const promptsLoading = ref(false)
const promptCandidates = ref<PromptCandidate[]>([])
const promptFilterCategory = ref('')
const promptSearchKeyword = ref('')

async function loadPromptOptions() {
  promptsLoading.value = true
  try {
    const res = await listPromptsApi({
      category: promptFilterCategory.value || undefined,
      keyword: promptSearchKeyword.value || undefined,
      pageSize: 100,
    })
    promptCandidates.value = (res.data.data?.items ?? []) as PromptCandidate[]
  } catch {
    promptCandidates.value = []
  } finally {
    promptsLoading.value = false
  }
}

let promptDebounce: ReturnType<typeof setTimeout> | null = null
function debouncedLoadPrompts() {
  if (promptDebounce) clearTimeout(promptDebounce)
  promptDebounce = setTimeout(loadPromptOptions, 300)
}

function selectCategory(value: string) {
  promptFilterCategory.value = value
  loadPromptOptions()
}

function isPromptAlreadyUsed(promptId: string): boolean {
  if (!selectedDoc.value) return false
  return selectedDoc.value.prompts.some((r) => r.prompt.id === promptId)
}

/** 点击提示词卡片 → 直接添加到当前选中的 SOP 条目 */
async function handleQuickAdd(prompt: PromptCandidate) {
  if (!selectedDoc.value) {
    ElMessage.warning('请先在左边选一个 SOP 条目')
    return
  }
  if (isPromptAlreadyUsed(prompt.id)) {
    ElMessage.info('已经添加过了')
    return
  }
  try {
    await sopStore.addPromptToDocument(selectedDoc.value.id, {
      promptId: prompt.id,
      note: null,
    })
    ElMessage.success(`已添加：${prompt.name}`)
    refreshSelectedDoc()
  } catch {
    /* handled */
  }
}

// ========== Prompt ref management ==========

async function handleRemoveRef(refId: string) {
  if (!selectedDoc.value) return
  try {
    await ElMessageBox.confirm('确认移除这个提示词引用？', '移除', {
      type: 'warning',
      confirmButtonText: '移除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  await sopStore.removePromptRef(selectedDoc.value.id, refId)
  ElMessage.success('已移除')
  refreshSelectedDoc()
}

async function moveRef(fromIdx: number, toIdx: number) {
  if (!selectedDoc.value) return
  const newOrder = [...selectedDoc.value.prompts]
  const [moved] = newOrder.splice(fromIdx, 1)
  newOrder.splice(toIdx, 0, moved)
  const orderedIds = newOrder.map((r) => r.id)
  await sopStore.reorderPrompts(selectedDoc.value.id, orderedIds)
  refreshSelectedDoc()
}

// ========== Edit ref note ==========

const showEditRefDialog = ref(false)
const editRefNote = ref('')
const editingRef = ref<SopDocumentPromptRef | null>(null)
const updatingRef = ref(false)

function openEditRefNoteDialog(refItem: SopDocumentPromptRef) {
  editingRef.value = refItem
  editRefNote.value = refItem.note ?? ''
  showEditRefDialog.value = true
}

async function handleSaveRefNote() {
  if (!selectedDoc.value || !editingRef.value) return
  updatingRef.value = true
  try {
    await sopStore.updatePromptRef(selectedDoc.value.id, editingRef.value.id, {
      note: editRefNote.value || null,
    })
    ElMessage.success('已保存')
    showEditRefDialog.value = false
    refreshSelectedDoc()
  } finally {
    updatingRef.value = false
  }
}

// ========== Helpers ==========

function categoryTagType(category: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    DESIGN: 'danger',
    FRONTEND: 'success',
    BACKEND: 'warning',
    TESTING: 'info',
    INTEGRATION: '',
    OPTIMIZATION: 'success',
  }
  return map[category] ?? 'info'
}

function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    DESIGN: '设计',
    FRONTEND: '前端',
    BACKEND: '后端',
    TESTING: '测试',
    INTEGRATION: '集成',
    OPTIMIZATION: '优化',
  }
  return map[category] ?? category
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN')
}

// ========== Version dialog ==========
const showVersionDialog = ref(false)
const loadingVersions = ref(false)

watch(showVersionDialog, async (val) => {
  if (val && selectedDoc.value) {
    loadingVersions.value = true
    sopStore.documentDiff = null
    try {
      await sopStore.fetchDocumentVersions(selectedDoc.value.id)
    } finally {
      loadingVersions.value = false
    }
  }
})

// ========== Init ==========

onMounted(async () => {
  const id = route.params.id as string
  await sopStore.fetchProject(id)
  await loadPromptOptions()
})
</script>

<style scoped>
/* ========== Layout ========== */

.sop-detail {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  min-height: calc(100vh - 140px);
}

.sop-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sop-right {
  width: 340px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  max-height: calc(100vh - 140px);
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

/* ========== Page header ========== */

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

/* ========== Doc grid ========== */

.doc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  padding: 4px;
}

.doc-card {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.doc-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.doc-card.active {
  border-color: #409eff;
  background: #ecf5ff;
}

.doc-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.doc-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-more-btn {
  color: #909399;
  cursor: pointer;
  font-size: 18px;
  padding: 2px;
}

.doc-more-btn:hover {
  color: #409eff;
}

.doc-desc {
  font-size: 12px;
  color: #606266;
  margin-bottom: 8px;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.doc-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.doc-tag {
  font-size: 10px;
}

.doc-version {
  font-size: 11px;
  color: #c0c4cc;
  margin-left: auto;
}

.empty-layer {
  padding: 40px 0;
}

/* ========== Editor section ========== */

.editor-section {
  margin-top: 20px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 20px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.editor-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-count {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
}

.editor-actions {
  display: flex;
  gap: 8px;
}

/* ========== Prompt refs list ========== */

.prompt-ref-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-ref-card {
  /* 与白板 PromptCard 统一的色彩方案 —— 这里是 SOP 引用列表，默认蓝色变种 */
  --accent: #409eff;
  --accent-bg: linear-gradient(to right, rgba(64, 158, 255, 0.04), #ffffff 70%);
  --accent-shadow: rgba(64, 158, 255, 0.15);

  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--accent-bg);
  border: 1px solid #e4e7ed;
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}

.prompt-ref-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 14px var(--accent-shadow);
  transform: translateY(-1px);
}

.prompt-ref-order {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prompt-ref-main {
  flex: 1;
  min-width: 0;
}

.prompt-ref-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.prompt-ref-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.prompt-ref-star {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: #909399;
  margin-left: auto;
}

.prompt-ref-desc {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
  margin-bottom: 4px;
}

.prompt-ref-note {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #409eff;
  background: #ecf5ff;
  padding: 3px 8px;
  border-radius: 4px;
  margin-top: 4px;
}

.prompt-ref-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* ========== Right sidebar (prompt library) ========== */

.sidebar-header {
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.target-hint {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.target-hint strong {
  color: #409eff;
  margin-left: 2px;
}

.target-hint.no-target {
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar-search {
  flex-shrink: 0;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.category-tag {
  cursor: pointer;
  font-size: 12px;
}

.prompt-pick-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px;
  min-height: 200px;
}

.pick-card {
  /* 右侧"点击即添加"的提示词卡片 —— 和白板/SOP 引用卡同一套色系 */
  --accent: #409eff;
  --accent-bg: #ffffff;
  --accent-shadow: rgba(64, 158, 255, 0.15);

  padding: 10px 12px 10px 14px;
  background: var(--accent-bg);
  border: 1px solid #e4e7ed;
  border-left: 3px solid var(--accent);
  border-radius: 10px;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
}

.pick-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 14px var(--accent-shadow);
  transform: translateY(-1px);
}

.pick-card.used {
  --accent: #67c23a;
  --accent-bg: linear-gradient(to right, rgba(103, 194, 58, 0.06), #ffffff 70%);
  --accent-shadow: rgba(103, 194, 58, 0.2);
  opacity: 0.7;
  cursor: not-allowed;
}

.pick-card.used:hover {
  transform: none;
  box-shadow: none;
}

.pick-card.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.pick-card.disabled:hover {
  transform: none;
  border-color: #e4e7ed;
  box-shadow: none;
}

.pick-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.add-icon {
  color: var(--accent);
}

.used-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: #67c23a;
  font-weight: 500;
}

.pick-card-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pick-card-desc {
  font-size: 11px;
  color: #909399;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
