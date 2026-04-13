/**
 * Copilot Budget Management — D27 决策
 *
 * - COPILOT_MAX_MONTHLY_CALLS: 月度调用上限（防止 bug 烧钱）
 * - COPILOT_MAX_CONTEXT_HYPOTHESIS: context 内 hypothesis 上限（防止 prompt 爆炸）
 * - cost_log 表记录每次调用
 *
 * 配置读取顺序：env → systemConfig → default
 */
import prisma from '../../prisma/client'

// ============================================================
// Config
// ============================================================

const DEFAULT_MAX_MONTHLY_CALLS = 500
const DEFAULT_MAX_CONTEXT_HYPOTHESIS = 30

async function getSystemConfigNumber(
  key: string,
  defaultValue: number,
): Promise<number> {
  const row = await prisma.systemConfig.findUnique({ where: { key } })
  if (!row) return defaultValue
  const n = Number(row.value)
  return Number.isFinite(n) ? n : defaultValue
}

export async function getMaxMonthlyCalls(): Promise<number> {
  const envVal = process.env.COPILOT_MAX_MONTHLY_CALLS
  if (envVal) {
    const n = Number(envVal)
    if (Number.isFinite(n)) return n
  }
  return getSystemConfigNumber(
    'copilot.maxMonthlyCalls',
    DEFAULT_MAX_MONTHLY_CALLS,
  )
}

export async function getMaxContextHypothesis(): Promise<number> {
  const envVal = process.env.COPILOT_MAX_CONTEXT_HYPOTHESIS
  if (envVal) {
    const n = Number(envVal)
    if (Number.isFinite(n)) return n
  }
  return getSystemConfigNumber(
    'copilot.maxContextHypothesis',
    DEFAULT_MAX_CONTEXT_HYPOTHESIS,
  )
}

// ============================================================
// Cost estimation (Claude Sonnet 4.5 pricing)
// ============================================================

const INPUT_COST_PER_MILLION_USD = 3.0
const OUTPUT_COST_PER_MILLION_USD = 15.0

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (
    (tokensIn * INPUT_COST_PER_MILLION_USD +
      tokensOut * OUTPUT_COST_PER_MILLION_USD) /
    1_000_000
  )
}

// ============================================================
// Quota check
// ============================================================

/**
 * 检查本月调用量是否超 quota。返回 true 表示还能调。
 */
export async function checkMonthlyQuota(): Promise<boolean> {
  const max = await getMaxMonthlyCalls()
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const count = await prisma.copilotCostLog.count({
    where: { createdAt: { gte: startOfMonth } },
  })
  return count < max
}

// ============================================================
// Record log
// ============================================================

export async function recordCostLog(data: {
  triggerType: string
  tokensIn: number
  tokensOut: number
  durationMs: number
  success: boolean
  errorMessage?: string
}): Promise<void> {
  await prisma.copilotCostLog.create({
    data: {
      triggerType: data.triggerType,
      tokensIn: data.tokensIn,
      tokensOut: data.tokensOut,
      costUsd: estimateCost(data.tokensIn, data.tokensOut),
      durationMs: data.durationMs,
      success: data.success,
      errorMessage: data.errorMessage ?? null,
    },
  })
}

// ============================================================
// Aggregation (for admin widget)
// ============================================================

export interface CostSummary {
  month: string
  totalCalls: number
  totalTokensIn: number
  totalTokensOut: number
  totalCostUsd: number
  breakdownByTrigger: Record<
    string,
    { calls: number; costUsd: number }
  >
  remainingQuota: number
}

export async function getMonthlyCostSummary(month?: string): Promise<CostSummary> {
  const now = new Date()
  const targetMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, monthNum] = targetMonth.split('-').map(Number)
  const start = new Date(year!, monthNum! - 1, 1)
  const end = new Date(year!, monthNum!, 1)

  const logs = await prisma.copilotCostLog.findMany({
    where: { createdAt: { gte: start, lt: end } },
  })

  const totalCalls = logs.length
  const totalTokensIn = logs.reduce((sum, l) => sum + l.tokensIn, 0)
  const totalTokensOut = logs.reduce((sum, l) => sum + l.tokensOut, 0)
  const totalCostUsd = logs.reduce((sum, l) => sum + l.costUsd, 0)

  const breakdownByTrigger: Record<string, { calls: number; costUsd: number }> = {}
  for (const l of logs) {
    if (!breakdownByTrigger[l.triggerType]) {
      breakdownByTrigger[l.triggerType] = { calls: 0, costUsd: 0 }
    }
    breakdownByTrigger[l.triggerType].calls += 1
    breakdownByTrigger[l.triggerType].costUsd += l.costUsd
  }

  const maxMonthly = await getMaxMonthlyCalls()
  const remainingQuota = Math.max(0, maxMonthly - totalCalls)

  return {
    month: targetMonth,
    totalCalls,
    totalTokensIn,
    totalTokensOut,
    totalCostUsd,
    breakdownByTrigger,
    remainingQuota,
  }
}
