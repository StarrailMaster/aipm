import prisma from '../prisma/client'
import {
  normalizeBaseUrl,
  validateAiConfig,
  sanitizeApiKey,
} from './ai-config.service'

const AI_CONFIG_KEYS = [
  'ai_provider',
  'ai_api_key',
  'ai_organization',
  'ai_base_url',
  'ai_model',
  'ai_temperature',
  'ai_max_tokens',
] as const

type AiConfigKey = (typeof AI_CONFIG_KEYS)[number]

const DEFAULTS: Record<AiConfigKey, string> = {
  ai_provider: 'openai',
  ai_api_key: '',
  ai_organization: '',
  ai_base_url: '',
  ai_model: 'gpt-4o',
  ai_temperature: '0.7',
  ai_max_tokens: '4096',
}

export async function getAiConfig(): Promise<Record<string, string>> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: [...AI_CONFIG_KEYS] } },
  })

  const result: Record<string, string> = { ...DEFAULTS }
  for (const row of rows) {
    result[row.key] = row.value
  }

  // Mask the API key for response
  if (result.ai_api_key) {
    const key = result.ai_api_key
    result.ai_api_key_masked =
      key.length > 8 ? key.slice(0, 4) + '****' + key.slice(-4) : '****'
  } else {
    result.ai_api_key_masked = ''
  }
  delete result.ai_api_key

  return result
}

export interface UpdateAiConfigResult {
  config: Record<string, string>
  /** 连接校验结果（若保存时同时校验） */
  validation?: {
    ok: boolean
    modelWasReplaced: boolean
    originalModel: string
    finalModel: string
    availableModels: string[]
    errorCode?: string
    errorMessage?: string
  }
}

/**
 * 更新 AI 配置
 * - 自动 trim 所有 string 值
 * - 自动 normalize base_url
 * - 如果提供了 api_key + base_url，会在保存前拉取真实模型列表
 * - 如果 defaultModel 不在真实列表中，会自动替换为推荐模型
 */
export async function updateAiConfig(
  updates: Record<string, string>,
  options: { skipValidation?: boolean } = {},
): Promise<UpdateAiConfigResult> {
  const validKeys = new Set<string>(AI_CONFIG_KEYS)
  const cleaned: Record<string, string> = {}
  let autoExtractedOrg: string | null = null

  for (const [key, value] of Object.entries(updates)) {
    if (!validKeys.has(key)) continue
    let cleanValue = typeof value === 'string' ? value.trim() : value
    // Skip empty api_key (means user didn't change it)
    if (key === 'ai_api_key' && !cleanValue) continue

    // 规范化 api_key：剥离嵌入的 org-xxx、空白、换行
    if (key === 'ai_api_key') {
      const sanitized = sanitizeApiKey(cleanValue)
      cleanValue = sanitized.apiKey
      if (sanitized.embeddedOrg) {
        autoExtractedOrg = sanitized.embeddedOrg
      }
    }

    // Normalize base_url on write
    if (key === 'ai_base_url') {
      cleanValue = normalizeBaseUrl(cleanValue)
    }
    cleaned[key] = cleanValue
  }

  // 如果用户粘贴的 key 里自带了 org ID，且用户没单独填 ai_organization，自动填上
  if (autoExtractedOrg && !cleaned.ai_organization) {
    cleaned.ai_organization = autoExtractedOrg
  }

  // 取当前已存的值补齐，用于校验
  const existing = await getAiConfigRaw()
  const effectiveApiKey = cleaned.ai_api_key ?? existing.ai_api_key ?? ''
  const effectiveBaseUrl = cleaned.ai_base_url ?? existing.ai_base_url ?? ''
  const effectiveOrg = cleaned.ai_organization ?? existing.ai_organization ?? ''
  const effectiveModel = cleaned.ai_model ?? existing.ai_model ?? ''

  let validation: UpdateAiConfigResult['validation'] = undefined
  let modelReplaced = false
  let finalModel = effectiveModel

  // 只有当有 api_key 且未跳过时才做线上校验
  if (effectiveApiKey && !options.skipValidation) {
    const result = await validateAiConfig({
      apiKey: effectiveApiKey,
      baseUrl: effectiveBaseUrl,
      organization: effectiveOrg,
      defaultModel: effectiveModel,
    })

    if (result.valid) {
      // 模型校验
      if (!result.modelIsValid) {
        if (result.suggestedModel) {
          finalModel = result.suggestedModel
          cleaned.ai_model = finalModel
          modelReplaced = true
        }
      }
      validation = {
        ok: true,
        modelWasReplaced: modelReplaced,
        originalModel: effectiveModel,
        finalModel,
        availableModels: result.availableModels,
      }
    } else {
      validation = {
        ok: false,
        modelWasReplaced: false,
        originalModel: effectiveModel,
        finalModel: effectiveModel,
        availableModels: [],
        errorCode: result.errorCode,
        errorMessage: result.error,
      }
      // 校验失败仍保存（让用户先存下 key 再排查），但会把 validation 返回给前端
    }
  }

  // 写入数据库
  for (const [key, value] of Object.entries(cleaned)) {
    await prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }

  return {
    config: await getAiConfig(),
    validation,
  }
}

/** 内部用：拿到未脱敏的原始配置 */
async function getAiConfigRaw(): Promise<Record<string, string>> {
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: [...AI_CONFIG_KEYS] } },
  })
  const result: Record<string, string> = { ...DEFAULTS }
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}

// Internal: get raw API key for service use
export async function getAiApiKey(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'ai_api_key' },
  })
  return (row?.value ?? '').trim()
}

export async function getAiModel(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'ai_model' },
  })
  return row?.value ?? DEFAULTS.ai_model
}

export async function getAiBaseUrl(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'ai_base_url' },
  })
  return row?.value ?? ''
}

export async function getAiOrganization(): Promise<string> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: 'ai_organization' },
  })
  return (row?.value ?? '').trim()
}
