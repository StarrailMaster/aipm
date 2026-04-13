<template>
  <div class="resource-selector">
    <!-- Tab switch -->
    <div class="selector-tabs">
      <div
        class="tab-item"
        :class="{ active: activeTab === 'prompts' }"
        @click="activeTab = 'prompts'"
      >
        提示词库
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'sop' }"
        @click="activeTab = 'sop'"
      >
        SOP 库
      </div>
    </div>

    <!-- ========== 提示词库 Tab ========== -->
    <template v-if="activeTab === 'prompts'">
      <el-input
        v-model="promptKeyword"
        placeholder="搜索提示词..."
        :prefix-icon="Search"
        clearable
        size="default"
        class="selector-search"
        @input="debouncedFetchPrompts"
      />

      <div class="category-tabs">
        <el-tag
          v-for="cat in promptCategories"
          :key="cat.value"
          :type="activePromptCategory === cat.value ? '' : 'info'"
          :effect="activePromptCategory === cat.value ? 'dark' : 'plain'"
          class="category-tag"
          @click="selectPromptCategory(cat.value)"
        >
          {{ cat.label }}
        </el-tag>
      </div>

      <div v-loading="promptLoading" class="item-list">
        <div
          v-for="prompt in prompts"
          :key="prompt.id"
          class="item-card"
          @click="$emit('select-prompt', prompt)"
        >
          <div class="item-header">
            <el-tag :type="promptCategoryTagType(prompt.category)" size="small" effect="plain">
              {{ promptCategoryLabel(prompt.category) }}
            </el-tag>
            <span class="item-star">
              <el-icon :size="12"><Star /></el-icon>
              {{ prompt.starCount }}
            </span>
          </div>
          <div class="item-name">{{ prompt.name }}</div>
          <div v-if="prompt.description" class="item-desc">{{ prompt.description }}</div>
        </div>

        <el-empty
          v-if="!promptLoading && prompts.length === 0"
          description="未找到提示词"
          :image-size="80"
        />
      </div>

      <div v-if="promptTotal > promptPageSize" class="selector-pagination">
        <el-pagination
          v-model:current-page="promptPage"
          :page-size="promptPageSize"
          :total="promptTotal"
          layout="prev, pager, next"
          small
          @current-change="fetchPrompts"
        />
      </div>
    </template>

    <!-- ========== SOP 库 Tab ========== -->
    <template v-if="activeTab === 'sop'">
      <!-- SOP project selector or doc list -->
      <template v-if="!selectedSopProject">
        <el-input
          v-model="sopKeyword"
          placeholder="搜索 SOP 项目..."
          :prefix-icon="Search"
          clearable
          size="default"
          class="selector-search"
          @input="debouncedFetchSopProjects"
        />

        <div v-loading="sopLoading" class="item-list">
          <div
            v-for="project in sopProjects"
            :key="project.id"
            class="item-card sop-project-card"
            @click="selectSopProject(project)"
          >
            <div class="item-header">
              <el-tag type="warning" size="small" effect="plain">SOP</el-tag>
              <span class="item-star">{{ project.documentCount }} 个文档</span>
            </div>
            <div class="item-name">{{ project.name }}</div>
            <div v-if="project.description" class="item-desc">{{ project.description }}</div>
          </div>

          <el-empty
            v-if="!sopLoading && sopProjects.length === 0"
            description="未找到 SOP 项目"
            :image-size="80"
          />
        </div>
      </template>

      <!-- SOP document list (inside a project) -->
      <template v-else>
        <div class="sop-back-header">
          <el-button text :icon="ArrowLeft" @click="selectedSopProject = null">返回</el-button>
          <span class="sop-project-name">{{ selectedSopProject.name }}</span>
        </div>

        <!-- Layer filter -->
        <div class="category-tabs">
          <el-tag
            v-for="layer in sopLayers"
            :key="layer.value"
            :type="activeSopLayer === layer.value ? '' : 'info'"
            :effect="activeSopLayer === layer.value ? 'dark' : 'plain'"
            class="category-tag"
            @click="activeSopLayer = layer.value"
          >
            {{ layer.label }}
          </el-tag>
        </div>

        <div v-loading="sopDocLoading" class="item-list">
          <div
            v-for="doc in filteredSopDocs"
            :key="doc.id"
            class="item-card sop-doc-card-item"
            @click="$emit('select-sop-doc', doc)"
          >
            <div class="item-header">
              <el-tag :type="layerTagType(doc.layer)" size="small" effect="plain">
                {{ layerLabel(doc.layer) }}
              </el-tag>
            </div>
            <div class="item-name">{{ doc.title }}</div>
            <div class="item-desc">{{ doc.tags?.join(', ') }}</div>
          </div>

          <el-empty
            v-if="!sopDocLoading && filteredSopDocs.length === 0"
            description="无文档"
            :image-size="80"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, Star, ArrowLeft } from '@element-plus/icons-vue'
import { listPromptsApi } from '@/api/prompt'
import { listSopProjectsApi, getSopProjectApi } from '@/api/sop'
import type { PromptItem } from '@/api/prompt'
import type { SopProjectItem, SopDocumentItem } from '@/api/sop'

defineEmits<{
  (e: 'select-prompt', prompt: PromptItem): void
  (e: 'select-sop-doc', doc: SopDocumentItem): void
}>()

const activeTab = ref<'prompts' | 'sop'>('prompts')

// ========== Prompts ==========
const promptKeyword = ref('')
const activePromptCategory = ref('')
const promptPage = ref(1)
const promptPageSize = 20
const promptTotal = ref(0)
const promptLoading = ref(false)
const prompts = ref<PromptItem[]>([])

const promptCategories = [
  { label: '全部', value: '' },
  { label: '设计', value: 'DESIGN' },
  { label: '前端', value: 'FRONTEND' },
  { label: '后端', value: 'BACKEND' },
  { label: '测试', value: 'TESTING' },
  { label: '集成', value: 'INTEGRATION' },
  { label: '优化', value: 'OPTIMIZATION' },
]

function promptCategoryTagType(cat: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
    DESIGN: 'primary',
    FRONTEND: 'success',
    BACKEND: 'warning',
    TESTING: 'danger',
    INTEGRATION: 'info',
    OPTIMIZATION: 'primary',
  }
  return map[cat] ?? 'info'
}

function promptCategoryLabel(cat: string): string {
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

async function fetchPrompts() {
  promptLoading.value = true
  try {
    const res = await listPromptsApi({
      page: promptPage.value,
      pageSize: promptPageSize,
      keyword: promptKeyword.value || undefined,
      category: activePromptCategory.value || undefined,
    })
    const data = res.data.data!
    prompts.value = data.items
    promptTotal.value = data.total
  } finally {
    promptLoading.value = false
  }
}

function selectPromptCategory(value: string) {
  activePromptCategory.value = value
  promptPage.value = 1
  fetchPrompts()
}

let promptDebounce: ReturnType<typeof setTimeout> | null = null
function debouncedFetchPrompts() {
  if (promptDebounce) clearTimeout(promptDebounce)
  promptDebounce = setTimeout(() => {
    promptPage.value = 1
    fetchPrompts()
  }, 300)
}

// ========== SOP ==========
const sopKeyword = ref('')
const sopLoading = ref(false)
const sopProjects = ref<SopProjectItem[]>([])

const selectedSopProject = ref<SopProjectItem | null>(null)
const sopDocLoading = ref(false)
const sopDocs = ref<SopDocumentItem[]>([])
const activeSopLayer = ref('')

const sopLayers = [
  { label: '全部', value: '' },
  { label: '产品需求', value: 'PRODUCT_REQ' },
  { label: '内容素材', value: 'CONTENT' },
  { label: '设计系统', value: 'DESIGN_SYSTEM' },
  { label: '前端架构', value: 'FRONTEND_ARCH' },
  { label: '后端架构', value: 'BACKEND_ARCH' },
  { label: 'AI 提示词', value: 'AI_PROMPTS' },
  { label: '验收标准', value: 'ACCEPTANCE' },
  { label: '附录', value: 'APPENDIX' },
]

const LAYER_LABELS: Record<string, string> = {
  PRODUCT_REQ: '产品需求',
  CONTENT: '内容素材',
  DESIGN_SYSTEM: '设计系统',
  FRONTEND_ARCH: '前端架构',
  BACKEND_ARCH: '后端架构',
  AI_PROMPTS: 'AI 提示词',
  ACCEPTANCE: '验收标准',
  APPENDIX: '附录',
}

const LAYER_TAG_TYPES: Record<string, 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  PRODUCT_REQ: 'danger',
  CONTENT: 'info',
  DESIGN_SYSTEM: 'primary',
  FRONTEND_ARCH: 'success',
  BACKEND_ARCH: 'warning',
  AI_PROMPTS: 'primary',
  ACCEPTANCE: 'danger',
  APPENDIX: 'info',
}

function layerLabel(layer: string) {
  return LAYER_LABELS[layer] ?? layer
}

function layerTagType(layer: string) {
  return LAYER_TAG_TYPES[layer] ?? 'info'
}

const filteredSopDocs = computed(() => {
  if (!activeSopLayer.value) return sopDocs.value
  return sopDocs.value.filter((d) => d.layer === activeSopLayer.value)
})

async function fetchSopProjects() {
  sopLoading.value = true
  try {
    const res = await listSopProjectsApi({
      page: 1,
      pageSize: 50,
      keyword: sopKeyword.value || undefined,
    })
    sopProjects.value = res.data.data!.items
  } finally {
    sopLoading.value = false
  }
}

async function selectSopProject(project: SopProjectItem) {
  selectedSopProject.value = project
  sopDocLoading.value = true
  activeSopLayer.value = ''
  try {
    const res = await getSopProjectApi(project.id)
    sopDocs.value = res.data.data!.documents
  } finally {
    sopDocLoading.value = false
  }
}

let sopDebounce: ReturnType<typeof setTimeout> | null = null
function debouncedFetchSopProjects() {
  if (sopDebounce) clearTimeout(sopDebounce)
  sopDebounce = setTimeout(() => {
    fetchSopProjects()
  }, 300)
}

// ========== Init ==========
onMounted(() => {
  fetchPrompts()
  fetchSopProjects()
})
</script>

<style scoped>
.resource-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.selector-tabs {
  display: flex;
  border-bottom: 2px solid #e4e7ed;
  margin-bottom: 12px;
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  font-weight: 500;
  color: #909399;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}

.tab-item:hover {
  color: #409eff;
}

.tab-item.active {
  color: #409eff;
  border-bottom-color: #409eff;
}

.selector-search {
  margin-bottom: 12px;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.category-tag {
  cursor: pointer;
  font-size: 12px;
}

.item-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-card {
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.item-card:hover {
  border-color: #409eff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.1);
}

.sop-project-card:hover {
  border-color: #e6a23c;
  box-shadow: 0 2px 8px rgba(230, 162, 60, 0.1);
}

.sop-doc-card-item:hover {
  border-color: #e6a23c;
  box-shadow: 0 2px 8px rgba(230, 162, 60, 0.1);
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.item-star {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: #909399;
}

.item-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selector-pagination {
  padding-top: 12px;
  display: flex;
  justify-content: center;
}

.sop-back-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.sop-project-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
