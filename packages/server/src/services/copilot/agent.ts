/**
 * Copilot Agent — 主调用逻辑
 *
 * 职责：
 *   1. 检查月度 quota（D27 - COPILOT_MAX_MONTHLY_CALLS）
 *   2. buildContext → renderPrompt → callLLM → parseOutput → filterValidIds
 *   3. 写 cost_log 记账
 *   4. 写 CopilotDigest (scope=global/project:id) 供 dashboard 读
 *   5. 如果是 run-on-close 触发，写 Learning (source=AI_GENERATED) 给 hypothesis
 *
 * 错误处理：
 *   - 合法的 LLM 响应但 JSON 非法 → UnrecoverableError (non-retryable)
 *   - Zod schema 失败 → UnrecoverableError
 *   - AI API 401/4xx → UnrecoverableError
 *   - AI API 5xx/timeout → 正常 throw (BullMQ retry)
 *   - quota exceeded → UnrecoverableError + 写 alert payload
 */
import prisma from '../../prisma/client'
import { getAiClient, getDefaultModel, formatAiError } from '../ai/client'
import { buildContext, renderCopilotPrompt } from './context'
import { COPILOT_SYSTEM_PROMPT } from './prompt'
import {
  parseCopilotOutput,
  filterCopilotPayloadByValidIds,
  type CopilotPayload,
} from './schema'
import { checkMonthlyQuota, recordCostLog } from './budget'
import * as learningService from '../learning'
import { UnrecoverableError } from '../../queues'

export interface RunAgentOptions {
  scope: string
  triggerHypothesisId?: string
  triggerType: 'scheduled_daily' | 'hypothesis_close' | 'manual'
  triggeredBy?: string
}

export interface RunAgentResult {
  digest: {
    id: string
    scope: string
    payload: CopilotPayload
    createdAt: number
  } | null
  aiLearning: {
    id: string
    hypothesisId: string
    text: string
  } | null
  success: boolean
  error?: string
  durationMs: number
  tokensIn: number
  tokensOut: number
}

// ============================================================
// Main run
// ============================================================

export async function runCopilotAgent(
  options: RunAgentOptions,
): Promise<RunAgentResult> {
  const startTime = Date.now()
  let tokensIn = 0
  let tokensOut = 0

  try {
    // 1. Quota check
    const quotaOk = await checkMonthlyQuota()
    if (!quotaOk) {
      throw new UnrecoverableError(
        'Copilot 月度 quota 已超限，跳过本次调用',
      )
    }

    // 2. Build context
    const context = await buildContext({
      scope: options.scope,
      triggerHypothesisId: options.triggerHypothesisId,
    })
    const userPrompt = renderCopilotPrompt(context)

    // 3. Call LLM
    const client = await getAiClient()
    const model = await getDefaultModel()

    let completion
    try {
      // 新 OpenAI reasoning models (gpt-5.x) 要求 max_completion_tokens
      // 老 models (gpt-4.x) 用 max_tokens
      // 这里先尝试 max_completion_tokens，失败回退到 max_tokens
      completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: COPILOT_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3, // 稳定输出
        max_completion_tokens: 4000,
        response_format: { type: 'json_object' },
      } as never) // OpenAI types 尚未完全覆盖新参数
    } catch (err) {
      // 如果 model 不支持 max_completion_tokens，fallback to max_tokens
      const msg = (err as { message?: string })?.message ?? ''
      if (msg.includes('max_completion_tokens') || msg.includes('max_tokens')) {
        try {
          completion = await client.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: COPILOT_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 4000,
            response_format: { type: 'json_object' },
          })
        } catch (innerErr) {
          const errMsg2 = formatAiError(innerErr, model)
          const status2 = (innerErr as { status?: number })?.status
          if (status2 !== undefined && status2 >= 400 && status2 < 500 && status2 !== 429) {
            throw new UnrecoverableError(errMsg2)
          }
          throw new Error(errMsg2)
        }
      } else {
        const errMsg = formatAiError(err, model)
        const status = (err as { status?: number })?.status
        if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
          throw new UnrecoverableError(errMsg)
        }
        throw new Error(errMsg) // 5xx/429/timeout → retryable
      }
    }

    tokensIn = completion.usage?.prompt_tokens ?? 0
    tokensOut = completion.usage?.completion_tokens ?? 0

    const rawContent = completion.choices[0]?.message?.content
    if (!rawContent) {
      throw new UnrecoverableError('LLM returned empty content')
    }

    // 4. Parse JSON
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawContent)
    } catch (err) {
      throw new UnrecoverableError(
        `LLM 返回非法 JSON: ${(err as Error).message}, raw: ${rawContent.slice(0, 200)}`,
      )
    }

    // 5. Zod validation
    const parseResult = parseCopilotOutput(parsedJson)
    if (!parseResult.ok) {
      throw new UnrecoverableError(
        `Copilot JSON schema 校验失败: ${parseResult.error}`,
      )
    }

    // 6. Filter invalid ids (LLM hallucination defense)
    const filtered = filterCopilotPayloadByValidIds(
      parseResult.data,
      context.validHypothesisIds,
    )

    // 7. Persist digest
    const digest = await prisma.copilotDigest.create({
      data: {
        scope: options.scope,
        triggerType: options.triggerType,
        payload: filtered as unknown as object,
      },
    })

    // 8. 如果是 close 事件，写一条 AI_GENERATED learning 挂到 trigger hypothesis
    let aiLearning: RunAgentResult['aiLearning'] = null
    if (options.triggerHypothesisId) {
      const l = filtered.learnings.find(
        (ll) => ll.hypothesisId === options.triggerHypothesisId,
      )
      if (l) {
        try {
          const saved = await learningService.writeAiLearning({
            hypothesisId: options.triggerHypothesisId,
            title: `AI Learning — ${new Date().toISOString().slice(0, 10)}`,
            content: l.text,
          })
          aiLearning = {
            id: saved.id,
            hypothesisId: options.triggerHypothesisId,
            text: l.text,
          }
        } catch (err) {
          console.error(
            '[copilot-agent] writeAiLearning failed:',
            (err as Error).message,
          )
          // 不阻塞 digest 成功
        }
      }
    }

    const durationMs = Date.now() - startTime

    // 9. Cost log
    await recordCostLog({
      triggerType: options.triggerType,
      tokensIn,
      tokensOut,
      durationMs,
      success: true,
    })

    return {
      digest: {
        id: digest.id,
        scope: digest.scope,
        payload: filtered,
        createdAt: digest.createdAt.getTime(),
      },
      aiLearning,
      success: true,
      durationMs,
      tokensIn,
      tokensOut,
    }
  } catch (err) {
    const durationMs = Date.now() - startTime
    const errMsg = (err as Error).message
    const isUnrecoverable = (err as Error).name === 'UnrecoverableError'

    // 记 cost log（即使失败）
    try {
      await recordCostLog({
        triggerType: options.triggerType,
        tokensIn,
        tokensOut,
        durationMs,
        success: false,
        errorMessage: errMsg,
      })
    } catch {
      /* swallow */
    }

    if (isUnrecoverable) {
      // 不抛，让 worker 把错误记到 DLQ 并不重试
      return {
        digest: null,
        aiLearning: null,
        success: false,
        error: errMsg,
        durationMs,
        tokensIn,
        tokensOut,
      }
    }

    // 可重试 — 抛出让 BullMQ 按 backoff 重试
    throw err
  }
}
