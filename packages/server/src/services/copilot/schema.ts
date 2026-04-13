/**
 * Zod schema for Copilot LLM output validation.
 *
 * 所有 LLM 返回的 JSON 必须通过本 schema 校验，
 * 否则视为非法输出（写 warn log + 降级）。
 */
import { z } from 'zod'

// ============================================================
// Enum values
// ============================================================

const CopilotConfidenceEnum = z.enum(['high', 'medium', 'low'])

const CopilotAlertTypeEnum = z.enum([
  'stagnant_kr',
  'behind_schedule',
  'dead_direction',
  'winning_streak',
  'quota_exceeded',
])

const CopilotAlertSeverityEnum = z.enum(['info', 'warning', 'critical'])

// ============================================================
// Sub-schemas
// ============================================================

export const CopilotLearningSchema = z.object({
  hypothesisId: z.string().min(1),
  text: z.string().min(10).max(500),
  squadId: z.string().nullable().optional().default(null),
})

export const CopilotPatternSchema = z.object({
  title: z.string().min(1).max(50),
  description: z.string().min(1).max(1000),
  evidenceHypothesisIds: z.array(z.string()).min(3), // 至少 3 条证据
  recommendation: z.string().min(1).max(300),
  confidence: CopilotConfidenceEnum,
  relatedSquadIds: z.array(z.string()).default([]),
})

export const CopilotNextHypothesisSuggestionSchema = z.object({
  krId: z.string().min(1),
  statement: z.string().min(10).max(500),
  mechanism: z.string().min(10).max(500),
  expectedImpact: z.string().min(1).max(200),
  expectedImpactValue: z.number().nullable().optional().default(null),
  expectedImpactUnit: z.string().nullable().optional().default(null),
  targetSquadId: z.string().nullable().optional().default(null),
})

export const CopilotAlertSchema = z.object({
  type: CopilotAlertTypeEnum,
  krId: z.string().optional(),
  krName: z.string().optional(),
  message: z.string().min(1).max(500),
  severity: CopilotAlertSeverityEnum,
  evidenceHypothesisIds: z.array(z.string()).optional(),
  squadId: z.string().nullable().optional().default(null),
})

// ============================================================
// Top-level payload
// ============================================================

export const CopilotPayloadSchema = z.object({
  learnings: z.array(CopilotLearningSchema).default([]),
  patterns: z.array(CopilotPatternSchema).default([]),
  nextHypothesisSuggestions: z
    .array(CopilotNextHypothesisSuggestionSchema)
    .max(5, 'nextHypothesisSuggestions 最多 5 条')
    .default([]),
  alerts: z.array(CopilotAlertSchema).default([]),
})

export type CopilotPayload = z.infer<typeof CopilotPayloadSchema>
export type CopilotLearning = z.infer<typeof CopilotLearningSchema>
export type CopilotPattern = z.infer<typeof CopilotPatternSchema>
export type CopilotNextHypothesisSuggestion = z.infer<
  typeof CopilotNextHypothesisSuggestionSchema
>
export type CopilotAlert = z.infer<typeof CopilotAlertSchema>

/**
 * Safe parse wrapper — 返回 { ok, data, error }
 * 调用方在失败时 log warn + 返回 null payload，不抛异常破坏主流程。
 */
export function parseCopilotOutput(
  raw: unknown,
):
  | { ok: true; data: CopilotPayload }
  | { ok: false; error: string; rawJson: string } {
  const result = CopilotPayloadSchema.safeParse(raw)
  if (result.success) {
    return { ok: true, data: result.data }
  }
  return {
    ok: false,
    error: result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; '),
    rawJson: JSON.stringify(raw).slice(0, 500),
  }
}

/**
 * Post-process: 过滤 Copilot 返回里引用了不存在 hypothesisId 的 evidence。
 * 防止 LLM 幻觉编造 id。
 */
export function filterCopilotPayloadByValidIds(
  payload: CopilotPayload,
  validHypothesisIds: Set<string>,
): CopilotPayload {
  return {
    learnings: payload.learnings.filter((l) =>
      validHypothesisIds.has(l.hypothesisId),
    ),
    patterns: payload.patterns
      .map((p) => ({
        ...p,
        evidenceHypothesisIds: p.evidenceHypothesisIds.filter((id) =>
          validHypothesisIds.has(id),
        ),
      }))
      .filter((p) => p.evidenceHypothesisIds.length >= 3), // 过滤后不够证据的 pattern 整体丢掉
    nextHypothesisSuggestions: payload.nextHypothesisSuggestions,
    alerts: payload.alerts.map((a) => ({
      ...a,
      evidenceHypothesisIds: a.evidenceHypothesisIds?.filter((id) =>
        validHypothesisIds.has(id),
      ),
    })),
  }
}
