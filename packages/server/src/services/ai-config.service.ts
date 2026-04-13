import OpenAI from 'openai'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

/**
 * AI 配置服务
 * 负责：Base URL 规范化、模型列表拉取、推荐算法、配置校验、调用回退
 */

// ========== 常量 ==========

/** 推荐模型优先级（越靠前越优先） */
export const RECOMMENDED_MODELS = [
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4.1',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
] as const

/** 会被过滤掉的非对话模型关键字（embeddings、tts、whisper、image 等） */
const NON_CHAT_MODEL_KEYWORDS = [
  'embedding',
  'embed',
  'whisper',
  'tts',
  'dall-e',
  'dalle',
  'vision-preview', // 保留主 vision 模型，过滤 preview
  'moderation',
  'similarity',
  'search',
  'ada',
  'babbage',
  'davinci-edit',
  'code-search',
]

/** 模型相关错误的 code / message 特征 */
const MODEL_ERROR_SIGNALS = [
  'model_not_found',
  'model not found',
  'unsupported_model',
  'does not exist',
  'invalid model',
  'the model',
]

// ========== 代理配置 ==========

let proxyConfigured = false
function configureProxyOnce() {
  if (proxyConfigured) return
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy
  if (proxyUrl) {
    try {
      setGlobalDispatcher(new ProxyAgent(proxyUrl))
      console.log(`[AI] Using HTTP proxy: ${proxyUrl}`)
    } catch (err) {
      console.error('[AI] Failed to configure proxy:', err)
    }
  }
  proxyConfigured = true
}

// ========== Base URL 规范化 ==========

/**
 * 规范化 OpenAI 兼容 Base URL
 * - 去首尾空格
 * - 去末尾多余 /
 * - 如果没有 /v1 或 /v\d+，自动补 /v1
 * - 如果已有 /v1 / /v2，不重复追加
 * - 空字符串返回 '' （表示使用 SDK 默认）
 */
export function normalizeBaseUrl(raw: string | null | undefined): string {
  if (!raw) return ''
  let url = String(raw).trim()
  if (!url) return ''

  // 去尾部斜杠
  url = url.replace(/\/+$/, '')

  // 检查是否已经包含 /v{N}
  const hasVersion = /\/v\d+$/.test(url) || /\/v\d+\//.test(url)
  if (!hasVersion) {
    url = url + '/v1'
  }

  return url
}

// ========== OpenAI 客户端工厂 ==========

export interface AiCredentials {
  apiKey: string
  baseUrl?: string
  organization?: string
}

/**
 * 清洗 API Key：去掉嵌入的 org ID、空白符、换行
 * 防御性：即使用户粘了一坨乱七八糟的内容，只要 sk- 开头，就能提取干净
 * 返回 { apiKey, embeddedOrg } —— 如果原始字符串里混入了 org-，会一并提取出来
 */
export function sanitizeApiKey(raw: string | null | undefined): {
  apiKey: string
  embeddedOrg: string | null
} {
  if (!raw) return { apiKey: '', embeddedOrg: null }

  // 提取 embedded org-xxxxx （如果有）
  const orgMatch = raw.match(/org-[A-Za-z0-9_-]+/)
  const embeddedOrg = orgMatch ? orgMatch[0] : null

  // 移除 org ID 和所有空白
  let cleaned = raw
  if (orgMatch) cleaned = cleaned.replace(orgMatch[0], '')
  cleaned = cleaned.replace(/\s+/g, '').trim()

  // 如果剩下的还不是 sk- 开头，尝试用正则精确匹配
  if (!cleaned.startsWith('sk-')) {
    const keyMatch = raw.match(/sk-[A-Za-z0-9_-]+/)
    if (keyMatch) cleaned = keyMatch[0]
  }

  return { apiKey: cleaned, embeddedOrg }
}

export function createClient(credentials: AiCredentials): OpenAI {
  configureProxyOnce()
  const baseURL = normalizeBaseUrl(credentials.baseUrl)
  const organization = credentials.organization?.trim() || undefined
  return new OpenAI({
    apiKey: credentials.apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(organization ? { organization } : {}),
  })
}

// ========== 模型列表获取 ==========

export interface ModelInfo {
  id: string
  recommended: boolean
  priority: number
}

export interface FetchModelsResult {
  success: true
  models: ModelInfo[]
  recommendedModel: string | null
  rawCount: number
}

export interface FetchModelsError {
  success: false
  errorCode: string
  errorMessage: string
  httpStatus?: number
}

/**
 * 拉取当前 Key + BaseURL 下真实可用的模型列表
 * 直接调用 GET /models（OpenAI 兼容接口）
 */
export async function fetchAvailableModels(
  credentials: AiCredentials,
): Promise<FetchModelsResult | FetchModelsError> {
  if (!credentials.apiKey) {
    return {
      success: false,
      errorCode: 'NO_API_KEY',
      errorMessage: 'API Key 未配置',
    }
  }

  const client = createClient(credentials)

  try {
    const list = await client.models.list()
    const rawIds: string[] = []

    // SDK 是 async iterable；也有 .data 结构
    for await (const m of list) {
      if (m?.id) rawIds.push(m.id)
    }

    if (rawIds.length === 0) {
      return {
        success: false,
        errorCode: 'EMPTY_MODELS',
        errorMessage: '接口返回空模型列表',
      }
    }

    // 过滤 + 排序 + 标记推荐
    const filtered = filterChatModels(rawIds)
    const recommendedModel = pickRecommendedModel(filtered)
    const models: ModelInfo[] = filtered.map((id) => {
      const idx = RECOMMENDED_MODELS.indexOf(id as (typeof RECOMMENDED_MODELS)[number])
      return {
        id,
        recommended: idx >= 0,
        priority: idx >= 0 ? idx : 999,
      }
    })
    // 推荐的排前面
    models.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))

    return {
      success: true,
      models,
      recommendedModel,
      rawCount: rawIds.length,
    }
  } catch (err: unknown) {
    return classifyFetchError(err)
  }
}

/** 过滤掉 embeddings / tts / whisper / image / moderation 等非对话模型 */
function filterChatModels(ids: string[]): string[] {
  return ids
    .filter((id) => {
      const lower = id.toLowerCase()
      return !NON_CHAT_MODEL_KEYWORDS.some((kw) => lower.includes(kw))
    })
    .sort()
}

/** 从可用列表中按优先级挑一个推荐模型 */
export function pickRecommendedModel(availableModels: string[]): string | null {
  if (availableModels.length === 0) return null

  // 1. 命中 RECOMMENDED_MODELS 列表的，按优先级选
  for (const candidate of RECOMMENDED_MODELS) {
    if (availableModels.includes(candidate)) return candidate
  }

  // 2. 找所有 gpt 开头的模型里最高版本号的
  const gptModels = availableModels
    .filter((id) => id.toLowerCase().startsWith('gpt-'))
    .sort()
    .reverse() // 字典序倒排，大版本靠前
  if (gptModels.length > 0) return gptModels[0]

  // 3. 兜底：第一个可用模型
  return availableModels[0]
}

/** 将 fetch /models 的错误分类 */
function classifyFetchError(err: unknown): FetchModelsError {
  const e = err as {
    status?: number
    message?: string
    code?: string
    cause?: { code?: string; message?: string }
  }

  const status = e?.status
  const rawMsg = e?.message ?? String(err) ?? '未知错误'

  // 网络/连接错误
  const causeCode = e?.cause?.code
  if (causeCode === 'ECONNREFUSED' || causeCode === 'ENOTFOUND' || causeCode === 'ETIMEDOUT') {
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      errorMessage: `无法连接到服务地址（${causeCode}）。请检查 Base URL 是否正确，或代理是否可用。`,
    }
  }

  if (status === 401) {
    return {
      success: false,
      errorCode: 'INVALID_API_KEY',
      errorMessage: `API Key 无效（401）。请确认 Key 是否正确、未过期、未被吊销。`,
      httpStatus: 401,
    }
  }
  if (status === 403) {
    return {
      success: false,
      errorCode: 'FORBIDDEN',
      errorMessage: `无权限访问（403）。该 Key 对当前 Base URL 没有访问权限。`,
      httpStatus: 403,
    }
  }
  if (status === 404) {
    return {
      success: false,
      errorCode: 'BASE_URL_NOT_FOUND',
      errorMessage: `Base URL 错误（404）。请检查地址是否正确、是否已包含 /v1 路径。`,
      httpStatus: 404,
    }
  }
  if (status === 429) {
    return {
      success: false,
      errorCode: 'RATE_LIMITED',
      errorMessage: `请求限流（429）。账户可能欠费或超出额度。`,
      httpStatus: 429,
    }
  }
  if (status && status >= 500) {
    return {
      success: false,
      errorCode: 'UPSTREAM_ERROR',
      errorMessage: `上游服务异常（${status}）：${rawMsg}`,
      httpStatus: status,
    }
  }

  return {
    success: false,
    errorCode: 'UNKNOWN',
    errorMessage: rawMsg,
    httpStatus: status,
  }
}

// ========== 配置校验 ==========

export interface ValidateConfigInput {
  apiKey: string
  baseUrl?: string
  organization?: string
  defaultModel?: string
}

export interface ValidateConfigResult {
  valid: boolean
  normalizedBaseUrl: string
  modelIsValid: boolean
  suggestedModel: string | null
  availableModels: string[]
  error?: string
  errorCode?: string
}

/**
 * 保存配置前的完整校验
 * - 规范化 BaseURL
 * - 拉取真实模型列表
 * - 校验 defaultModel 是否在列表中
 * - 如不合法，给出推荐替换
 */
export async function validateAiConfig(
  input: ValidateConfigInput,
): Promise<ValidateConfigResult> {
  const normalizedBaseUrl = normalizeBaseUrl(input.baseUrl)

  const fetchResult = await fetchAvailableModels({
    apiKey: input.apiKey,
    baseUrl: normalizedBaseUrl,
    organization: input.organization,
  })

  if (!fetchResult.success) {
    return {
      valid: false,
      normalizedBaseUrl,
      modelIsValid: false,
      suggestedModel: null,
      availableModels: [],
      error: fetchResult.errorMessage,
      errorCode: fetchResult.errorCode,
    }
  }

  const availableModels = fetchResult.models.map((m) => m.id)
  const modelIsValid = input.defaultModel
    ? availableModels.includes(input.defaultModel)
    : false

  return {
    valid: true,
    normalizedBaseUrl,
    modelIsValid,
    suggestedModel: fetchResult.recommendedModel,
    availableModels,
  }
}

// ========== 调用 AI（带自动回退） ==========

export interface CallOptions {
  apiKey: string
  baseUrl?: string
  organization?: string
  defaultModel: string
  /** 系统提示词 */
  systemPrompt: string
  /** 用户消息（可以是多轮） */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
  /** 要求模型返回 JSON 对象（使用 response_format: { type: 'json_object' }） */
  jsonMode?: boolean
}

export interface CallResult {
  content: string
  usedModel: string
  triedModels: string[]
}

/**
 * 调用 AI 完成聊天补全，失败自动回退
 * 失败判定：catch 到 error 且命中 MODEL_ERROR_SIGNALS 或 status 404/400 且 message 含 model
 * 回退顺序：defaultModel → RECOMMENDED_MODELS → 实时模型列表里剩余的模型
 */
export async function callWithFallback(opts: CallOptions): Promise<CallResult> {
  const client = createClient({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    organization: opts.organization,
  })

  // 构造候选队列
  const candidates: string[] = []
  if (opts.defaultModel) candidates.push(opts.defaultModel)
  for (const m of RECOMMENDED_MODELS) {
    if (!candidates.includes(m)) candidates.push(m)
  }

  // 先加入已知候选；如果都失败，再拉实时列表补充
  const triedModels: string[] = []
  let lastError: unknown = null

  for (const model of candidates) {
    triedModels.push(model)
    try {
      const result = await doChatCompletion(client, model, opts)
      return { content: result, usedModel: model, triedModels }
    } catch (err) {
      lastError = err
      if (!isModelRelatedError(err)) {
        // 非模型错误（如 401、网络错误）直接抛出，不再回退
        throw enrichError(err, model, triedModels)
      }
      // 模型错误 → 继续下一个候选
      console.warn(`[AI] Model "${model}" failed, trying next. Reason:`, (err as Error).message)
    }
  }

  // 所有硬编码候选都失败，尝试实时模型列表里剩下的
  const fetchResult = await fetchAvailableModels({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    organization: opts.organization,
  })
  if (fetchResult.success) {
    const remaining = fetchResult.models
      .map((m) => m.id)
      .filter((id) => !triedModels.includes(id))

    for (const model of remaining) {
      triedModels.push(model)
      try {
        const result = await doChatCompletion(client, model, opts)
        return { content: result, usedModel: model, triedModels }
      } catch (err) {
        lastError = err
        if (!isModelRelatedError(err)) {
          throw enrichError(err, model, triedModels)
        }
      }
    }
  }

  throw enrichError(lastError, triedModels[triedModels.length - 1] ?? 'unknown', triedModels)
}

/** 执行一次 chat.completions.create 调用 */
async function doChatCompletion(
  client: OpenAI,
  model: string,
  opts: CallOptions,
): Promise<string> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: opts.systemPrompt },
    ...opts.messages,
  ]

  const response = await client.chat.completions.create({
    model,
    messages,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    ...(opts.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('AI 返回空内容')
  return content
}

/** 判断错误是否是"模型名错误" */
function isModelRelatedError(err: unknown): boolean {
  const e = err as { status?: number; message?: string; code?: string }
  const msg = (e?.message ?? '').toLowerCase()
  const code = (e?.code ?? '').toLowerCase()

  // 命中模型错误信号词
  if (MODEL_ERROR_SIGNALS.some((sig) => msg.includes(sig) || code.includes(sig))) {
    return true
  }

  // 404 且 message 含 model
  if (e?.status === 404 && msg.includes('model')) return true

  // 400 且 message 含 model
  if (e?.status === 400 && msg.includes('model')) return true

  return false
}

/** 给错误附加模型/尝试记录上下文 */
function enrichError(err: unknown, lastModel: string, triedModels: string[]): Error {
  const e = err as { message?: string; status?: number }
  const baseMsg = e?.message ?? String(err) ?? '未知错误'
  const status = e?.status ? `[${e.status}]` : ''
  const enriched = new Error(
    `AI 调用失败 ${status} 最后尝试模型: ${lastModel}。已尝试 ${triedModels.length} 个模型: ${triedModels.join(
      ', ',
    )}。原始信息: ${baseMsg}`,
  )
  ;(enriched as Error & { originalError?: unknown }).originalError = err
  return enriched
}
