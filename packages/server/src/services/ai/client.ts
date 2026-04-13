/**
 * Shared AI client primitives
 *
 * 决策 D7 + D19: 三向拆分 services/ai + services/copilot + services/sop-split
 * 本文件只含底层 primitives（HTTP client 构造 / 错误格式化 / 配置读取）。
 * 业务 agent（SOP 拆解 / Learning Copilot）各自管好自己的 prompt + schema + context。
 *
 * 现有 ai.service.ts 的 getClient / getModelName / formatAiError 暂保留原地不动
 * 以维持向后兼容（generateAiSummary / generateFeedPackageFromContent / warehouseReview
 * 仍然依赖原位置）。新功能（Copilot）直接 import 本文件的版本。
 */
import OpenAI from 'openai'
import {
  getAiApiKey,
  getAiModel,
  getAiBaseUrl,
  getAiOrganization,
} from '../settings.service'
import { createClient } from '../ai-config.service'

export interface AiClientOptions {
  /** 覆盖系统配置的 model */
  model?: string
  /** 覆盖系统配置的 temperature */
  temperature?: number
}

/**
 * 获取配置好的 OpenAI 客户端。
 * 读取 systemConfig 的 ai_api_key / ai_base_url / ai_organization。
 * 走 undici ProxyAgent + HTTPS_PROXY（由 ai-config.service.createClient 处理）。
 */
export async function getAiClient(): Promise<OpenAI> {
  const apiKey = await getAiApiKey()
  if (!apiKey) {
    throw new Error('AI API Key 未配置，请在设置 → AI 配置中填写')
  }
  const baseUrl = await getAiBaseUrl()
  const organization = await getAiOrganization()
  return createClient({ apiKey, baseUrl, organization })
}

export async function getDefaultModel(): Promise<string> {
  return getAiModel()
}

/**
 * 把 OpenAI SDK 抛出的错误转成人类可读信息。
 */
export function formatAiError(err: unknown, model: string): string {
  const e = err as { status?: number; message?: string; code?: string }
  const status = e?.status
  const msg = e?.message ?? '未知错误'

  if (status === 401) {
    return `AI API Key 无效（401）。请检查「设置 → AI 配置」中的 Key 是否正确、是否过期。原始：${msg}`
  }
  if (status === 404 || (msg && msg.includes('model'))) {
    return `AI 模型「${model}」不存在或不可用。请在「设置 → AI 配置」修改为有效的模型名（如 gpt-4o、claude-3-5-sonnet）。原始：${msg}`
  }
  if (status === 429) {
    return `AI API 限流（429）。请稍后重试或检查账户额度。`
  }
  if (status === 400) {
    return `AI 请求参数错误：${msg}`
  }
  return `AI 调用失败（${status ?? '?'}）：${msg}`
}

/**
 * 判断 AI 错误是否值得重试：
 *   - 5xx / 网络超时 → retryable
 *   - 401 / 404 / 400 / Zod schema → non-retryable
 *   - 429 可重试（backoff）
 */
export function isRetryableAiError(err: unknown): boolean {
  const e = err as { status?: number; code?: string; name?: string }
  if (e?.name === 'UnrecoverableError') return false
  const status = e?.status
  if (status === undefined) return true // network error assume retryable
  if (status >= 500) return true
  if (status === 429) return true
  return false // 4xx 不重试
}
