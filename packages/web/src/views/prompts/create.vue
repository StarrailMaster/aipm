<template>
  <div class="prompt-create-page">
    <el-button link @click="router.back()" class="back-btn">
      <el-icon><ArrowLeft /></el-icon> 返回
    </el-button>

    <h2 class="page-title">{{ isEditMode ? '编辑提示词' : '新建提示词' }}</h2>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      class="create-form"
      v-loading="formLoading"
    >
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入提示词名称" maxlength="100" show-word-limit />
      </el-form-item>

      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="简要描述提示词用途"
          maxlength="500"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="分类" prop="category">
        <el-select v-model="form.category" placeholder="选择分类" style="width: 200px">
          <el-option label="设计" value="DESIGN" />
          <el-option label="前端" value="FRONTEND" />
          <el-option label="后端" value="BACKEND" />
          <el-option label="测试" value="TESTING" />
          <el-option label="集成" value="INTEGRATION" />
          <el-option label="优化" value="OPTIMIZATION" />
        </el-select>
      </el-form-item>

      <el-form-item label="技术标签">
        <div class="tags-input">
          <el-tag
            v-for="tag in form.tags"
            :key="tag"
            closable
            @close="removeTag(tag)"
            class="tag-item"
          >
            {{ tag }}
          </el-tag>
          <el-input
            v-if="tagInputVisible"
            ref="tagInputRef"
            v-model="tagInputValue"
            size="small"
            style="width: 100px"
            @keyup.enter="handleTagConfirm"
            @blur="handleTagConfirm"
          />
          <el-button v-else size="small" @click="showTagInput">+ 添加标签</el-button>
        </div>
      </el-form-item>

      <el-form-item label="可见性">
        <el-radio-group v-model="form.visibility">
          <el-radio value="private">私有</el-radio>
          <el-radio value="team">团队</el-radio>
          <el-radio value="public">公开</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="提示词内容" prop="content">
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="18"
          placeholder="输入提示词完整内容（支持 Markdown）"
        />
      </el-form-item>

      <el-form-item label="前置依赖">
        <el-select
          v-model="form.dependsOn"
          multiple
          filterable
          allow-create
          placeholder="输入前置提示词 ID（可选）"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="SOP 模块">
        <el-select
          v-model="form.requiredSopLayers"
          multiple
          placeholder="选择需要的 SOP 模块（可选）"
          style="width: 100%"
        >
          <el-option label="产品需求" value="PRODUCT_REQ" />
          <el-option label="内容规范" value="CONTENT" />
          <el-option label="设计系统" value="DESIGN_SYSTEM" />
          <el-option label="前端架构" value="FRONTEND_ARCH" />
          <el-option label="后端架构" value="BACKEND_ARCH" />
          <el-option label="AI 提示词" value="AI_PROMPTS" />
          <el-option label="验收标准" value="ACCEPTANCE" />
          <el-option label="附录" value="APPENDIX" />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ isEditMode ? '保存修改' : '创建提示词' }}
        </el-button>
        <el-button @click="router.back()">取消</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules, InputInstance } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { usePromptStore } from '@/stores/prompt'

const route = useRoute()
const router = useRouter()
const promptStore = usePromptStore()

const editId = computed(() => (route.query.edit as string) || '')
const isEditMode = computed(() => !!editId.value)

const formRef = ref<FormInstance>()
const formLoading = ref(false)
const submitting = ref(false)

const form = ref({
  name: '',
  description: '',
  category: '' as string,
  tags: [] as string[],
  content: '',
  visibility: 'team' as string,
  dependsOn: [] as string[],
  requiredSopLayers: [] as string[],
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  content: [{ required: true, message: '请输入提示词内容', trigger: 'blur' }],
}

// Tag input
const tagInputVisible = ref(false)
const tagInputValue = ref('')
const tagInputRef = ref<InputInstance>()

function removeTag(tag: string) {
  form.value.tags = form.value.tags.filter((t) => t !== tag)
}

function showTagInput() {
  tagInputVisible.value = true
  nextTick(() => {
    tagInputRef.value?.input?.focus()
  })
}

function handleTagConfirm() {
  if (tagInputValue.value.trim()) {
    if (!form.value.tags.includes(tagInputValue.value.trim())) {
      form.value.tags.push(tagInputValue.value.trim())
    }
  }
  tagInputVisible.value = false
  tagInputValue.value = ''
}

// Load for editing
onMounted(async () => {
  if (isEditMode.value) {
    formLoading.value = true
    try {
      await promptStore.fetchPromptDetail(editId.value)
      const p = promptStore.currentPrompt
      if (p) {
        form.value = {
          name: p.name,
          description: p.description ?? '',
          category: p.category,
          tags: [...p.tags],
          content: p.content,
          visibility: p.visibility,
          dependsOn: [...p.dependsOn],
          requiredSopLayers: [...p.requiredSopLayers],
        }
      }
    } finally {
      formLoading.value = false
    }
  }
})

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEditMode.value) {
      await promptStore.updatePrompt(editId.value, {
        name: form.value.name,
        description: form.value.description || undefined,
        category: form.value.category,
        tags: form.value.tags,
        content: form.value.content,
        dependsOn: form.value.dependsOn,
      })
      ElMessage.success('更新成功')
      router.push(`/prompts/${editId.value}`)
    } else {
      const created = await promptStore.createPrompt({
        name: form.value.name,
        description: form.value.description || undefined,
        category: form.value.category,
        tags: form.value.tags,
        content: form.value.content,
        visibility: form.value.visibility,
        dependsOn: form.value.dependsOn,
        requiredSopLayers: form.value.requiredSopLayers,
      })
      ElMessage.success('创建成功')
      router.push(`/prompts/${created.id}`)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.prompt-create-page {
  padding: 0;
  max-width: 800px;
}

.back-btn {
  margin-bottom: 16px;
  color: #909399;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 24px;
}

.create-form {
  margin-top: 8px;
}

.tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tag-item {
  margin: 0;
}
</style>
