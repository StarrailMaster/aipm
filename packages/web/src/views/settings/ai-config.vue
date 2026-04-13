<template>
  <div class="ai-config" v-loading="loading">
    <el-form :model="form" label-width="140px" label-position="right">
      <el-form-item label="AI 服务商">
        <el-select v-model="form.ai_provider" style="width: 300px">
          <el-option label="OpenAI" value="openai" />
          <el-option label="OpenAI 兼容代理" value="openai-compatible" />
        </el-select>
        <div class="form-hint">
          使用任意 OpenAI 兼容接口（官方 / OpenRouter / 硅基流动 / Azure 等）
        </div>
      </el-form-item>

      <el-form-item label="API Key">
        <el-input
          v-model="form.ai_api_key"
          type="password"
          show-password
          :placeholder="maskedKey || '请输入 API Key（只粘贴 sk-proj-... 部分）'"
          style="width: 420px"
        />
        <div class="form-hint" v-if="maskedKey">
          当前已配置：{{ maskedKey }}（留空则不修改）
        </div>
        <div class="form-hint warn-text">
          ⚠️ 只粘贴 sk-proj-... 这一行，不要把 org-... 也粘进来。系统会自动清洗嵌入的组织 ID 和空白字符。
        </div>
      </el-form-item>

      <el-form-item label="Organization ID">
        <el-input
          v-model="form.ai_organization"
          placeholder="可选。形如 org-xxxxxxxx"
          style="width: 420px"
        />
        <div class="form-hint">
          仅 OpenAI 官方账号需要。如果你的 Key 属于某个组织（Project Key），请填写对应的 Organization ID。
        </div>
      </el-form-item>

      <el-form-item label="Base URL">
        <el-input
          v-model="form.ai_base_url"
          placeholder="留空使用 https://api.openai.com/v1"
          style="width: 420px"
        />
        <div class="form-hint">
          会自动补齐 /v1 结尾。示例：<code>https://api.openai.com</code> →
          <code>https://api.openai.com/v1</code>
        </div>
      </el-form-item>

      <!-- 检测连接按钮 + 状态区 -->
      <el-form-item label="连接检测">
        <div class="test-area">
          <el-button
            type="primary"
            plain
            :icon="Connection"
            :loading="testing"
            @click="handleTestConnection"
          >
            检测连接 & 刷新模型列表
          </el-button>

          <!-- 测试结果 -->
          <div v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'err'">
            <template v-if="testResult.ok">
              <el-icon><CircleCheckFilled /></el-icon>
              <span>
                连接成功 · 获取到 <strong>{{ testResult.modelCount }}</strong> 个模型
                <template v-if="testResult.recommendedModel">
                  · 推荐默认模型：<strong class="recommended">{{ testResult.recommendedModel }}</strong>
                </template>
              </span>
              <el-button
                v-if="testResult.recommendedModel && form.ai_model !== testResult.recommendedModel"
                size="small"
                type="success"
                text
                @click="applyRecommended"
              >
                应用推荐
              </el-button>
            </template>
            <template v-else>
              <el-icon><CircleCloseFilled /></el-icon>
              <span>
                <strong>[{{ testResult.errorCode }}]</strong>
                {{ testResult.errorMessage }}
              </span>
            </template>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="默认模型">
        <el-select
          v-model="form.ai_model"
          filterable
          allow-create
          default-first-option
          :placeholder="modelOptions.length ? '选择可用模型' : '请先点击「检测连接」获取模型列表'"
          style="width: 420px"
        >
          <el-option
            v-for="m in modelOptions"
            :key="m.id"
            :label="m.id"
            :value="m.id"
          >
            <span>{{ m.id }}</span>
            <el-tag v-if="m.recommended" size="small" type="success" effect="plain" style="margin-left: 8px">
              推荐
            </el-tag>
          </el-option>
        </el-select>
        <div v-if="currentModelInvalid" class="form-hint err-text">
          ⚠️ 当前默认模型「{{ form.ai_model }}」不在可用列表中。
          <el-button
            v-if="testResult?.ok && testResult.recommendedModel"
            size="small"
            text
            type="primary"
            @click="applyRecommended"
          >
            切换到推荐：{{ testResult.recommendedModel }}
          </el-button>
        </div>
        <div v-else class="form-hint">
          保存时后端会自动校验模型是否真实可用
        </div>
      </el-form-item>

      <el-form-item label="Temperature">
        <div style="display: flex; align-items: center; gap: 12px; width: 420px">
          <el-slider
            v-model="temperatureValue"
            :min="0"
            :max="2"
            :step="0.1"
            style="flex: 1"
          />
          <el-input-number
            v-model="temperatureValue"
            :min="0"
            :max="2"
            :step="0.1"
            :precision="1"
            :controls="false"
            style="width: 80px"
          />
        </div>
        <div class="form-hint">0 确定性最强，2 随机性最强。通常 0.3-0.7 为佳。</div>
      </el-form-item>

      <el-form-item label="最大 Token 数">
        <el-input-number
          v-model="maxTokensValue"
          :min="256"
          :max="200000"
          :step="512"
          style="width: 300px"
        />
        <div class="form-hint">超过模型实际上限会被服务端自动截断</div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        <el-button @click="fetchConfig">重置</el-button>
      </el-form-item>
    </el-form>

    <el-divider />

    <div class="config-info">
      <h4>使用说明</h4>
      <ul>
        <li>AI 配置用于<strong>任务推进</strong>时的工作台包 AI 生成和<strong>经验沉淀</strong>的反馈分析。</li>
        <li>API Key 加密存储，界面仅显示掩码。留空提交不会覆盖已有 Key。</li>
        <li>
          保存前建议先点「<strong>检测连接</strong>」，验证 Key / Base URL 能拉到模型列表，再选择默认模型。
        </li>
        <li>
          调用失败时会<strong>自动回退</strong>到其他可用模型（按推荐优先级），避免单点错误阻塞流程。
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import {
  getAiConfig,
  updateAiConfig,
  testAiConnection,
  fetchAiModels,
} from '@/api/settings'
import type {
  ModelInfo,
  TestConnectionResult,
} from '@/api/settings'

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const maskedKey = ref('')

const form = ref({
  ai_provider: 'openai',
  ai_api_key: '',
  ai_organization: '',
  ai_base_url: '',
  ai_model: '',
  ai_temperature: '0.7',
  ai_max_tokens: '4096',
})

// 模型列表（动态）
const modelOptions = ref<ModelInfo[]>([])
const testResult = ref<TestConnectionResult | null>(null)

// 滑块双向绑定
const temperatureValue = computed({
  get: () => parseFloat(form.value.ai_temperature) || 0.7,
  set: (val: number) => {
    form.value.ai_temperature = String(val)
  },
})

const maxTokensValue = computed({
  get: () => parseInt(form.value.ai_max_tokens) || 4096,
  set: (val: number) => {
    form.value.ai_max_tokens = String(val)
  },
})

const currentModelInvalid = computed(() => {
  if (!form.value.ai_model) return false
  if (modelOptions.value.length === 0) return false
  return !modelOptions.value.some((m) => m.id === form.value.ai_model)
})

// ========== 初始化 ==========

async function fetchConfig() {
  loading.value = true
  try {
    const res = await getAiConfig()
    const data = res.data.data!
    form.value.ai_provider = data.ai_provider || 'openai'
    form.value.ai_organization = data.ai_organization || ''
    form.value.ai_base_url = data.ai_base_url || ''
    form.value.ai_model = data.ai_model || ''
    form.value.ai_temperature = data.ai_temperature || '0.7'
    form.value.ai_max_tokens = data.ai_max_tokens || '4096'
    maskedKey.value = data.ai_api_key_masked || ''
    form.value.ai_api_key = ''

    // 若已配置了 key，静默刷新一次模型列表
    if (maskedKey.value) {
      await silentLoadModels()
    }
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function silentLoadModels() {
  try {
    const res = await fetchAiModels()
    if (res.data.code === 0 && res.data.data) {
      modelOptions.value = res.data.data.models
    }
  } catch {
    // 静默失败，用户点「检测连接」时会看到真实错误
  }
}

// ========== 检测连接 ==========

async function handleTestConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await testAiConnection({
      ai_api_key: form.value.ai_api_key || undefined,
      ai_base_url: form.value.ai_base_url || undefined,
      ai_organization: form.value.ai_organization || undefined,
      ai_model: form.value.ai_model || undefined,
    })
    const data = res.data.data
    if (!data) {
      ElMessage.error('检测失败：无返回')
      return
    }
    testResult.value = data
    // 如果后端从 key 里提取到了 org ID 且前端没填，回填到前端
    if (data.detectedOrganization && !form.value.ai_organization) {
      form.value.ai_organization = data.detectedOrganization
      ElMessage.info(`已从 Key 中自动提取组织 ID: ${data.detectedOrganization}`)
    }
    if (data.ok) {
      modelOptions.value = data.models
      // 回填规范化后的 Base URL
      if (data.normalizedBaseUrl && data.normalizedBaseUrl !== form.value.ai_base_url) {
        form.value.ai_base_url = data.normalizedBaseUrl
      }
      ElMessage.success(`连接成功，获取到 ${data.modelCount} 个模型`)
    } else {
      ElMessage.error(data.errorMessage)
    }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '检测失败'
    ElMessage.error(msg)
  } finally {
    testing.value = false
  }
}

function applyRecommended() {
  if (testResult.value?.ok && testResult.value.recommendedModel) {
    form.value.ai_model = testResult.value.recommendedModel
    ElMessage.success(`已切换到推荐模型：${testResult.value.recommendedModel}`)
  }
}

// ========== 保存 ==========

async function handleSave() {
  if (!form.value.ai_api_key && !maskedKey.value) {
    ElMessage.warning('请先填写 API Key')
    return
  }
  saving.value = true
  try {
    const res = await updateAiConfig({
      ai_provider: form.value.ai_provider,
      ai_api_key: form.value.ai_api_key,
      ai_organization: form.value.ai_organization,
      ai_base_url: form.value.ai_base_url,
      ai_model: form.value.ai_model,
      ai_temperature: form.value.ai_temperature,
      ai_max_tokens: form.value.ai_max_tokens,
    })
    const data = res.data.data!
    maskedKey.value = data.config.ai_api_key_masked || ''
    form.value.ai_api_key = ''
    form.value.ai_organization = data.config.ai_organization || ''
    form.value.ai_base_url = data.config.ai_base_url || ''
    form.value.ai_model = data.config.ai_model || ''

    if (data.validation) {
      if (data.validation.ok) {
        if (data.validation.modelWasReplaced) {
          ElMessage.warning(
            `配置已保存。默认模型「${data.validation.originalModel}」不在可用列表中，已自动切换为「${data.validation.finalModel}」`,
          )
        } else {
          ElMessage.success('配置已保存，连接正常')
        }
        // 同步模型列表
        modelOptions.value = data.validation.availableModels.map((id) => ({
          id,
          recommended: false,
          priority: 999,
        }))
      } else {
        ElMessage.warning(
          `配置已保存但连接校验失败：${data.validation.errorMessage}（${data.validation.errorCode}）`,
        )
      }
    } else {
      ElMessage.success('配置已保存')
    }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '保存失败'
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

onMounted(fetchConfig)
</script>

<style scoped>
.ai-config {
  max-width: 780px;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.6;
}

.form-hint code {
  background: #f5f7fa;
  padding: 1px 4px;
  border-radius: 3px;
  color: #606266;
  font-size: 11px;
}

.warn-text {
  color: #e6a23c;
}

.err-text {
  color: #f56c6c;
}

.test-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.test-result.ok {
  background: #f0f9eb;
  color: #529b2e;
  border: 1px solid #e1f3d8;
}

.test-result.err {
  background: #fef0f0;
  color: #c45656;
  border: 1px solid #fde2e2;
}

.test-result .el-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.recommended {
  color: #67c23a;
}

.config-info h4 {
  color: #303133;
  margin-bottom: 8px;
}

.config-info ul {
  color: #606266;
  font-size: 13px;
  padding-left: 20px;
  line-height: 2;
}
</style>
