/**
 * Copilot context builder
 *
 * 负责给 Copilot prompt 组装输入数据：
 *   - 当前活跃 KR 列表（含目标 / 当前 / 基线 / 时间维度 / 剩余天数）
 *   - 最近 N 天的 hypothesis（closed 的有 result 数据，running 的只有 statement）
 *   - 本次触发的 hypothesis（close 事件）
 *
 * 决策（D27 Token 预算）：
 *   - COPILOT_MAX_CONTEXT_HYPOTHESIS: 30（systemConfig 可调）
 *   - 超过 30 按 closedAt DESC 取最近 30
 *   - COPILOT_PROMPT_MAX_CHARS: 50000 组装后 assert
 */
import type { Hypothesis as PrismaHypothesis } from '@prisma/client'
import prisma from '../../prisma/client'

const DEFAULT_CONTEXT_DAYS = 30
const DEFAULT_MAX_HYPOTHESES = 30
const MAX_PROMPT_CHARS = 50000

// ============================================================
// Types
// ============================================================

export interface KrContext {
  id: string
  name: string
  objectiveName: string
  targetValue: number
  currentValue: number
  baseline: number
  unit: string
  startDate: Date
  endDate: Date | null
  daysElapsed: number
  daysTotal: number | null
  daysLeft: number | null
  kpiProgressRatio: number
  timeElapsedRatio: number | null
  status: 'on_track' | 'behind' | 'critical'
  isStagnant: boolean
  squadId: string | null
}

export interface HypothesisContextItem {
  id: string
  krId: string
  krName: string
  squadId: string | null
  statement: string
  mechanism: string
  status: string
  closedAt: number | null
  result: {
    metricType: string
    metricName: string
    baseline: number
    actual: number
    delta: number
    conclusion: string
  } | null
}

export interface CopilotContext {
  scope: string
  generatedAt: number
  krs: KrContext[]
  hypotheses: HypothesisContextItem[]
  validHypothesisIds: Set<string>
  triggerHypothesisId: string | null
  triggerHypothesis: HypothesisContextItem | null
  /** 实际用到的时间窗 */
  windowDays: number
}

// ============================================================
// KR status helper
// ============================================================

function computeKrStatus(kr: {
  targetValue: number
  currentValue: number
  baseline: number
  startDate: Date
  endDate: Date | null
}): {
  daysElapsed: number
  daysTotal: number | null
  daysLeft: number | null
  kpiProgressRatio: number
  timeElapsedRatio: number | null
  status: 'on_track' | 'behind' | 'critical'
} {
  const now = Date.now()
  const start = kr.startDate.getTime()
  const daysElapsed = Math.max(0, Math.floor((now - start) / 86400000))

  let daysTotal: number | null = null
  let daysLeft: number | null = null
  let timeElapsedRatio: number | null = null
  if (kr.endDate) {
    daysTotal = Math.max(
      1,
      Math.ceil((kr.endDate.getTime() - start) / 86400000),
    )
    daysLeft = Math.max(0, Math.ceil((kr.endDate.getTime() - now) / 86400000))
    timeElapsedRatio = Math.min(1, daysElapsed / daysTotal)
  }

  const range = kr.targetValue - kr.baseline
  const kpiProgressRatio = range === 0 ? 0 : (kr.currentValue - kr.baseline) / range

  // 综合算法：有 endDate 用时间比率；无则用绝对百分比
  let status: 'on_track' | 'behind' | 'critical'
  if (timeElapsedRatio === null) {
    // open-ended: 用绝对
    if (kpiProgressRatio >= 0.8) status = 'on_track'
    else if (kpiProgressRatio >= 0.5) status = 'behind'
    else status = 'critical'
  } else {
    const ratio = timeElapsedRatio === 0 ? Infinity : kpiProgressRatio / timeElapsedRatio
    if (ratio >= 0.9) status = 'on_track'
    else if (ratio >= 0.6) status = 'behind'
    else status = 'critical'
  }

  return {
    daysElapsed,
    daysTotal,
    daysLeft,
    kpiProgressRatio,
    timeElapsedRatio,
    status,
  }
}

// ============================================================
// Build context
// ============================================================

export interface BuildContextOptions {
  /** "global" | "project:{id}" | "kr:{id}" */
  scope: string
  /** 覆盖 windowDays（默认 30） */
  windowDays?: number
  /** 上限 hypothesis 数（默认 30） */
  maxHypotheses?: number
  /** 本次触发的 hypothesis（close 事件时传）*/
  triggerHypothesisId?: string
  /** 是否包含软删的 hypothesis（admin debug） */
  includeDeleted?: boolean
}

export async function buildContext(
  options: BuildContextOptions,
): Promise<CopilotContext> {
  const windowDays = options.windowDays ?? DEFAULT_CONTEXT_DAYS
  const maxHypotheses = options.maxHypotheses ?? DEFAULT_MAX_HYPOTHESES
  const includeDeleted = options.includeDeleted ?? false

  const windowStart = new Date(Date.now() - windowDays * 86400000)

  // Step 1: Resolve projectId from scope
  let projectFilter: string | undefined
  if (options.scope.startsWith('project:')) {
    projectFilter = options.scope.slice('project:'.length)
  }

  // Step 2: 拉 KR 列表
  const krWhere: Record<string, unknown> = {}
  if (projectFilter) {
    krWhere.objective = { projectId: projectFilter }
  }
  const krs = await prisma.keyResult.findMany({
    where: krWhere,
    include: {
      objective: { select: { name: true, squadId: true } },
    },
  })

  // Step 3: 拉 hypothesis 列表
  const hypWhere: Record<string, unknown> = {
    OR: [
      { closedAt: { gte: windowStart } },
      { status: { in: ['BACKLOG', 'RUNNING'] } },
    ],
  }
  if (!includeDeleted) hypWhere.deletedAt = null
  if (projectFilter) {
    hypWhere.keyResult = { objective: { projectId: projectFilter } }
  }

  let rawHyps = await prisma.hypothesis.findMany({
    where: hypWhere,
    include: {
      result: true,
      keyResult: {
        select: {
          id: true,
          name: true,
          objective: { select: { squadId: true } },
        },
      },
    },
    orderBy: [{ closedAt: 'desc' }, { createdAt: 'desc' }],
  })

  // Step 4: 限制数量（超过 maxHypotheses 按 closedAt 最近 N 保留）
  if (rawHyps.length > maxHypotheses) {
    rawHyps = rawHyps.slice(0, maxHypotheses)
  }

  const hypotheses: HypothesisContextItem[] = rawHyps.map((h) => ({
    id: h.id,
    krId: h.krId,
    krName: h.keyResult.name,
    squadId: h.keyResult.objective.squadId,
    statement: h.statement,
    mechanism: h.mechanism,
    status: h.status,
    closedAt: h.closedAt?.getTime() ?? null,
    result: h.result
      ? {
          metricType: h.result.metricType,
          metricName: h.result.metricName,
          baseline: h.result.baseline,
          actual: h.result.actual,
          delta: h.result.delta,
          conclusion: h.result.conclusion,
        }
      : null,
  }))

  // Step 5: 活跃 KR + stagnant 检测
  const krIdToLastHypothesis = new Map<string, number>()
  for (const h of hypotheses) {
    if (h.status === 'RUNNING' || h.status === 'BACKLOG') {
      const prev = krIdToLastHypothesis.get(h.krId) ?? 0
      if (prev === 0) krIdToLastHypothesis.set(h.krId, Date.now())
    }
  }
  const STAGNANT_DAYS = 7

  const krContexts: KrContext[] = krs.map((kr) => {
    const computed = computeKrStatus({
      targetValue: kr.targetValue,
      currentValue: kr.currentValue,
      baseline: kr.baseline,
      startDate: kr.startDate,
      endDate: kr.endDate,
    })
    // Stagnant: 检查最近 7 天有没有 RUNNING hypothesis
    const lastRunning = krIdToLastHypothesis.get(kr.id)
    const isStagnant =
      !lastRunning ||
      Date.now() - lastRunning > STAGNANT_DAYS * 86400000
    return {
      id: kr.id,
      name: kr.name,
      objectiveName: kr.objective.name,
      targetValue: kr.targetValue,
      currentValue: kr.currentValue,
      baseline: kr.baseline,
      unit: kr.unit,
      startDate: kr.startDate,
      endDate: kr.endDate,
      ...computed,
      isStagnant,
      squadId: kr.objective.squadId,
    }
  })

  // Step 6: trigger hypothesis
  let trigger: HypothesisContextItem | null = null
  if (options.triggerHypothesisId) {
    trigger = hypotheses.find((h) => h.id === options.triggerHypothesisId) ?? null
    // 如果没在 window 内，补拉一次
    if (!trigger) {
      const h = await prisma.hypothesis.findUnique({
        where: { id: options.triggerHypothesisId },
        include: {
          result: true,
          keyResult: {
            select: {
              id: true,
              name: true,
              objective: { select: { squadId: true } },
            },
          },
        },
      })
      if (h) {
        trigger = {
          id: h.id,
          krId: h.krId,
          krName: h.keyResult.name,
          squadId: h.keyResult.objective.squadId,
          statement: h.statement,
          mechanism: h.mechanism,
          status: h.status,
          closedAt: h.closedAt?.getTime() ?? null,
          result: h.result
            ? {
                metricType: h.result.metricType,
                metricName: h.result.metricName,
                baseline: h.result.baseline,
                actual: h.result.actual,
                delta: h.result.delta,
                conclusion: h.result.conclusion,
              }
            : null,
        }
        // 加进 hypotheses 列表（如果还没）
        if (!hypotheses.some((hh) => hh.id === h.id)) {
          hypotheses.push(trigger)
        }
      }
    }
  }

  return {
    scope: options.scope,
    generatedAt: Date.now(),
    krs: krContexts,
    hypotheses,
    validHypothesisIds: new Set(hypotheses.map((h) => h.id)),
    triggerHypothesisId: options.triggerHypothesisId ?? null,
    triggerHypothesis: trigger,
    windowDays,
  }
}

// ============================================================
// Render prompt
// ============================================================

/**
 * 将 context 渲染成 Copilot prompt 字符串。
 * 长度超 MAX_PROMPT_CHARS 时截断老 hypothesis（先扔 closedAt 最老的）。
 */
export function renderCopilotPrompt(context: CopilotContext): string {
  const lines: string[] = []
  lines.push('# Learning Copilot Input\n')
  lines.push(`Scope: ${context.scope}`)
  lines.push(`Window: last ${context.windowDays} days`)
  lines.push(`Generated: ${new Date(context.generatedAt).toISOString()}\n`)

  lines.push('## Active Key Results\n')
  for (const kr of context.krs) {
    lines.push(
      `- [${kr.id}] ${kr.objectiveName} > ${kr.name}`,
    )
    lines.push(
      `  Target: ${kr.targetValue}${kr.unit}, Current: ${kr.currentValue}${kr.unit}, Baseline: ${kr.baseline}${kr.unit}`,
    )
    lines.push(
      `  Progress: ${(kr.kpiProgressRatio * 100).toFixed(1)}%, Time elapsed: ${
        kr.timeElapsedRatio === null
          ? 'open-ended'
          : `${(kr.timeElapsedRatio * 100).toFixed(1)}%`
      }, Status: ${kr.status}${kr.isStagnant ? ' (STAGNANT)' : ''}`,
    )
    if (kr.daysLeft !== null) lines.push(`  Days left: ${kr.daysLeft}`)
    lines.push('')
  }

  lines.push(
    `## Recent Hypotheses (${context.hypotheses.length} of last ${context.windowDays}d)\n`,
  )
  for (const h of context.hypotheses) {
    lines.push(`### ${h.id} (kr=${h.krId} status=${h.status})`)
    lines.push(`Statement: ${h.statement}`)
    lines.push(`Mechanism: ${h.mechanism}`)
    if (h.result) {
      lines.push(
        `Result: ${h.result.metricName} baseline=${h.result.baseline} actual=${h.result.actual} delta=${h.result.delta} ${h.result.conclusion}`,
      )
    }
    if (h.squadId) lines.push(`Squad: ${h.squadId}`)
    lines.push('')
  }

  if (context.triggerHypothesis) {
    lines.push('## Trigger (本次刚关闭的假设)\n')
    lines.push(`ID: ${context.triggerHypothesis.id}`)
    lines.push('请重点为这个假设生成 learnings[0]。')
    lines.push('')
  }

  let prompt = lines.join('\n')
  // Truncate if exceed
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = prompt.slice(0, MAX_PROMPT_CHARS) + '\n[TRUNCATED]'
  }
  return prompt
}
