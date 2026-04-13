<template>
  <div class="templates-page">
    <div class="page-header">
      <h1 class="page-title">{{ t('nav.hypothesisTemplates') }}</h1>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        {{ t('template.create') }}
      </el-button>
    </div>

    <div class="filters">
      <el-select v-model="filterCategory" clearable :placeholder="t('template.allCategories')" style="width: 200px" @change="refresh">
        <el-option
          v-for="c in categories"
          :key="c"
          :label="t(`template.category.${c}`)"
          :value="c"
        />
      </el-select>
    </div>

    <div v-loading="store.loading" class="template-grid">
      <el-card
        v-for="tpl in store.list"
        :key="tpl.id"
        class="template-card"
        shadow="hover"
        @click="openUseDialog(tpl.id)"
      >
        <div class="template-header">
          <h3 class="template-name">{{ tpl.name }}</h3>
          <el-tag size="small" type="info">
            {{ t(`template.category.${tpl.category}`) }}
          </el-tag>
        </div>
        <div class="template-description">{{ tpl.description }}</div>
        <div class="template-footer">
          <span class="usage-count">{{ t('template.usageCount', { count: tpl.usageCount }) }}</span>
          <el-tag v-if="tpl.isSystemDefault" type="primary" size="small">
            {{ t('template.systemDefault') }}
          </el-tag>
        </div>
      </el-card>
      <el-empty v-if="!store.loading && store.list.length === 0" :description="t('common.empty')" />
    </div>

    <!-- Create template dialog -->
    <el-dialog v-model="showCreate" :title="t('template.create')" width="640px">
      <el-form :model="createForm" label-position="top">
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="createForm.name" />
        </el-form-item>
        <el-form-item :label="t('template.category.label')" required>
          <el-select v-model="createForm.category" style="width: 100%">
            <el-option
              v-for="c in categories"
              :key="c"
              :label="t(`template.category.${c}`)"
              :value="c"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.description')" required>
          <el-input v-model="createForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('template.statementTemplate')" required>
          <el-input
            v-model="createForm.statementTemplate"
            type="textarea"
            :rows="3"
            :placeholder="statementPlaceholder"
          />
        </el-form-item>
        <el-form-item :label="t('template.mechanismTemplate')" required>
          <el-input
            v-model="createForm.mechanismTemplate"
            type="textarea"
            :rows="2"
            :placeholder="mechanismPlaceholder"
          />
        </el-form-item>
        <el-form-item :label="t('template.placeholders')">
          <div v-for="(p, idx) in createForm.placeholders" :key="idx" class="placeholder-row">
            <el-input v-model="p.key" :placeholder="t('template.placeholderKey')" style="width: 30%" />
            <el-input v-model="p.label" :placeholder="t('template.placeholderLabel')" style="width: 40%" />
            <el-checkbox v-model="p.required">{{ t('common.required') }}</el-checkbox>
            <el-button text type="danger" @click="removePlaceholder(idx)">×</el-button>
          </div>
          <el-button size="small" text type="primary" @click="addPlaceholder">
            + {{ t('template.addPlaceholder') }}
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" :disabled="!canCreate" @click="handleCreate">
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Use template dialog -->
    <el-dialog v-model="showUse" :title="t('template.useTemplate')" width="560px">
      <div v-if="store.currentDetail">
        <div class="use-header">
          <h3>{{ store.currentDetail.name }}</h3>
          <p class="use-description">{{ store.currentDetail.description }}</p>
        </div>
        <el-form :model="useForm" label-position="top">
          <el-form-item :label="t('hypothesis.create.linkKr')" required>
            <el-select v-model="useForm.krId" filterable style="width: 100%">
              <el-option
                v-for="kr in availableKrs"
                :key="kr.id"
                :label="kr.name"
                :value="kr.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item
            v-for="p in store.currentDetail.placeholders"
            :key="p.key"
            :label="p.label"
            :required="p.required"
          >
            <el-input
              v-if="p.type !== 'number'"
              v-model="useForm.placeholderValues[p.key] as string"
              :placeholder="p.defaultValue?.toString() ?? ''"
            />
            <el-input-number
              v-else
              v-model="useForm.placeholderValues[p.key] as number"
              :placeholder="p.defaultValue?.toString() ?? ''"
              style="width: 100%"
            />
          </el-form-item>
        </el-form>
        <div class="preview">
          <div class="preview-label">{{ t('template.preview') }}</div>
          <div class="preview-text">{{ renderedStatement }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showUse = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="using" :disabled="!canUse" @click="handleUse">
          {{ t('template.useTemplate') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useHypothesisTemplateStore } from '@/stores/hypothesis-template'
import type {
  HypothesisTemplateCategory,
  HypothesisTemplatePlaceholder,
} from '@/api/hypothesis-template'
import request from '@/api/request'

const { t, locale } = useI18n()
const router = useRouter()
const store = useHypothesisTemplateStore()

// 这两个占位符含字面 `{{}}`，vue-i18n 会把它解析成嵌套参数并报错，
// 所以绕过 i18n，按 locale 直接取字面量。
const statementPlaceholder = computed(() =>
  locale.value === 'en'
    ? 'If we do {{feature}}, then {{metric}} will increase by {{delta}}%'
    : '如果做 {{feature}}，则 {{metric}} 会提升 {{delta}}%',
)
const mechanismPlaceholder = computed(() =>
  locale.value === 'en' ? 'Because {{reason}}…' : '因为 {{reason}}…',
)

const filterCategory = ref<HypothesisTemplateCategory | ''>('')
const categories: HypothesisTemplateCategory[] = [
  'acquisition',
  'activation',
  'retention',
  'revenue',
  'referral',
  'custom',
]

async function refresh() {
  await store.fetchList({
    category: filterCategory.value || undefined,
    sortBy: 'usage',
    order: 'desc',
  })
}

// ============ Create template ============
const showCreate = ref(false)
const creating = ref(false)
const createForm = reactive({
  name: '',
  category: 'custom' as HypothesisTemplateCategory,
  description: '',
  statementTemplate: '',
  mechanismTemplate: '',
  placeholders: [] as HypothesisTemplatePlaceholder[],
})

const canCreate = computed(
  () =>
    !!(
      createForm.name.trim() &&
      createForm.description.trim() &&
      createForm.statementTemplate.trim() &&
      createForm.mechanismTemplate.trim()
    ),
)

function openCreateDialog() {
  createForm.name = ''
  createForm.category = 'custom'
  createForm.description = ''
  createForm.statementTemplate = ''
  createForm.mechanismTemplate = ''
  createForm.placeholders = []
  showCreate.value = true
}

function addPlaceholder() {
  createForm.placeholders.push({
    key: '',
    label: '',
    required: true,
    type: 'string',
  })
}

function removePlaceholder(idx: number) {
  createForm.placeholders.splice(idx, 1)
}

async function handleCreate() {
  if (!canCreate.value) return
  creating.value = true
  try {
    const created = await store.create({
      name: createForm.name,
      category: createForm.category,
      description: createForm.description,
      statementTemplate: createForm.statementTemplate,
      mechanismTemplate: createForm.mechanismTemplate,
      placeholders: createForm.placeholders.filter((p) => p.key && p.label),
    })
    if (created) {
      ElMessage.success(t('template.created'))
      showCreate.value = false
      await refresh()
    }
  } finally {
    creating.value = false
  }
}

// ============ Use template ============
const showUse = ref(false)
const using = ref(false)
const availableKrs = ref<Array<{ id: string; name: string }>>([])
const useForm = reactive<{
  krId: string
  placeholderValues: Record<string, string | number>
}>({
  krId: '',
  placeholderValues: {},
})

const canUse = computed(() => {
  if (!store.currentDetail) return false
  if (!useForm.krId) return false
  return store.currentDetail.placeholders
    .filter((p) => p.required)
    .every((p) => {
      const v = useForm.placeholderValues[p.key]
      return v !== undefined && v !== null && v !== ''
    })
})

const renderedStatement = computed(() => {
  if (!store.currentDetail) return ''
  let text = store.currentDetail.statementTemplate
  for (const [k, v] of Object.entries(useForm.placeholderValues)) {
    text = text.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v))
  }
  return text
})

async function openUseDialog(templateId: string) {
  useForm.krId = ''
  useForm.placeholderValues = {}
  const detail = await store.fetchDetail(templateId)
  if (!detail) return
  // Pre-fill default values
  for (const p of detail.placeholders) {
    if (p.defaultValue !== undefined) {
      useForm.placeholderValues[p.key] = p.defaultValue
    }
  }
  // Load available KRs
  if (availableKrs.value.length === 0) {
    try {
      const res = await request.get('/dashboard/learning', { params: { scope: 'all' } })
      const krs = (res.data.data?.activeKRs ?? []) as Array<{ id: string; name: string }>
      availableKrs.value = krs
    } catch {
      /* ignore */
    }
  }
  showUse.value = true
}

async function handleUse() {
  if (!canUse.value || !store.currentDetail) return
  using.value = true
  try {
    const result = await store.createHypothesisFromTemplate(store.currentDetail.id, {
      krId: useForm.krId,
      placeholderValues: useForm.placeholderValues,
    })
    if (result) {
      ElMessage.success(t('template.used'))
      showUse.value = false
      router.push(`/hypotheses/${result.id}`)
    }
  } finally {
    using.value = false
  }
}

onMounted(refresh)
</script>

<style lang="scss" scoped>
@use '@/styles/breakpoints' as *;

.templates-page {
  padding: var(--aipm-spacing-lg);

  @include mobile {
    padding: var(--aipm-spacing-md);
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--aipm-spacing-lg);

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--aipm-spacing-sm);
  }
}

.page-title {
  font-size: var(--aipm-font-size-3xl);
  font-weight: var(--aipm-font-weight-bold);
  margin: 0;
}

.filters {
  margin-bottom: var(--aipm-spacing-md);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--aipm-spacing-md);

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.template-card {
  cursor: pointer;
  transition: transform 0.15s;

  &:hover {
    transform: translateY(-2px);
  }
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--aipm-spacing-sm);
}

.template-name {
  font-size: var(--aipm-font-size-lg);
  font-weight: var(--aipm-font-weight-semibold);
  margin: 0;
}

.template-description {
  font-size: var(--aipm-font-size-base);
  color: var(--aipm-text-regular);
  line-height: 1.5;
  margin-bottom: var(--aipm-spacing-sm);
}

.template-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--aipm-font-size-sm);
  color: var(--aipm-text-secondary);
}

.placeholder-row {
  display: flex;
  align-items: center;
  gap: var(--aipm-spacing-sm);
  margin-bottom: var(--aipm-spacing-xs);
}

.use-header {
  padding: var(--aipm-spacing-sm) 0 var(--aipm-spacing-md);
  border-bottom: 1px solid var(--aipm-border-lighter);
  margin-bottom: var(--aipm-spacing-md);

  h3 {
    font-size: var(--aipm-font-size-xl);
    font-weight: var(--aipm-font-weight-semibold);
    margin: 0 0 4px;
  }
}

.use-description {
  font-size: var(--aipm-font-size-base);
  color: var(--aipm-text-secondary);
  margin: 0;
}

.preview {
  margin-top: var(--aipm-spacing-md);
  padding: var(--aipm-spacing-sm);
  background: var(--aipm-bg-muted);
  border-radius: var(--aipm-radius-sm);
}

.preview-label {
  font-size: var(--aipm-font-size-xs);
  color: var(--aipm-text-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.preview-text {
  font-size: var(--aipm-font-size-base);
  color: var(--aipm-text-primary);
  line-height: 1.5;
}
</style>
