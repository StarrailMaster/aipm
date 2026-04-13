/**
 * Hypothesis Close Service — 核心业务动作
 *
 * 业务动作：
 *   1. 权限校验
 *   2. 状态校验（已 CLOSED_* 幂等返回）
 *   3. 事务内：
 *      - 创建 HypothesisResult（delta 服务端计算）
 *      - 更新 hypothesis.status / closedAt
 *      - 根据 conclusion 映射 status：WIN→CLOSED_WIN / LOSS→CLOSED_LOSS / FLAT→CLOSED_FLAT / INCONCLUSIVE→CLOSED_FLAT
 *      - 更新 KR.currentValue（自动聚合）
 *   4. 事务提交后：
 *      - Enqueue Copilot run-on-close 任务（BullMQ + Redis fallback CG1）
 *      - autoAdvanceIterationStatus (如果有 iteration 关联)
 *
 * 约束（PRD §9.2 AC-2.*）：
 *   - baseline / actual 必填数字
 *   - delta 服务端 actual - baseline
 *   - conclusion 必须是 enum
 *   - metricType 必须在白名单
 *   - 已 CLOSED_* 再 close：幂等返回
 */
import type {
  ResultConclusion as PrismaResultConclusion,
  HypothesisStatus as PrismaHypothesisStatus,
} from '@prisma/client'
import { PointCategory, ContributionSourceType } from '@prisma/client'
import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import { ensureCanWriteHypothesis } from './permission'
import { isValidMetricType, validateMetricValue } from './metric-types'
import { enqueueCopilotJob } from '../../queues'
import { awardPoints } from '../contribution'

export type CloseHypothesisInput = {
  metricType: string
  metricName: string
  baseline: number
  actual: number
  unit?: string
  conclusion: PrismaResultConclusion
  humanNote?: string
}

function conclusionToStatus(c: PrismaResultConclusion): PrismaHypothesisStatus {
  switch (c) {
    case 'WIN':
      return 'CLOSED_WIN'
    case 'LOSS':
      return 'CLOSED_LOSS'
    case 'FLAT':
    case 'INCONCLUSIVE':
      return 'CLOSED_FLAT'
    default:
      return 'CLOSED_FLAT'
  }
}

export type CopilotStatus = 'pending' | 'success' | 'failed' | 'unavailable'

export interface CloseHypothesisResponse {
  hypothesis: {
    id: string
    status: PrismaHypothesisStatus
    closedAt: number
  }
  result: {
    id: string
    metricType: string
    metricName: string
    baseline: number
    actual: number
    delta: number
    unit: string | null
    conclusion: PrismaResultConclusion
    humanNote: string | null
    createdAt: number
  }
  copilotStatus: CopilotStatus
  copilotError?: string
}

export async function closeHypothesis(
  hypothesisId: string,
  input: CloseHypothesisInput,
  actor: { userId: string; role: string },
): Promise<CloseHypothesisResponse> {
  await ensureCanWriteHypothesis(
    hypothesisId,
    actor.userId,
    actor.role,
    '关闭假设',
  )

  // 校验 metricType
  if (!isValidMetricType(input.metricType)) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_INVALID_METRIC_TYPE,
      `metricType "${input.metricType}" 不在白名单`,
    )
  }
  // 校验数值合法
  const baselineErr = validateMetricValue(input.metricType, input.baseline)
  if (baselineErr) {
    throw new AppError(ErrorCodes.INVALID_FORMAT, `baseline: ${baselineErr}`)
  }
  const actualErr = validateMetricValue(input.metricType, input.actual)
  if (actualErr) {
    throw new AppError(ErrorCodes.INVALID_FORMAT, `actual: ${actualErr}`)
  }

  // 校验 conclusion 合法
  const validConclusions: PrismaResultConclusion[] = ['WIN', 'LOSS', 'FLAT', 'INCONCLUSIVE']
  if (!validConclusions.includes(input.conclusion)) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `conclusion 必须是 ${validConclusions.join('/')}`,
    )
  }

  // 拉当前状态（用于幂等判断 + status 转换前置校验）
  const existing = await prisma.hypothesis.findFirst({
    where: { id: hypothesisId, deletedAt: null },
    include: { result: true },
  })
  if (!existing) {
    throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '假设不存在', 404)
  }

  // 幂等：已是 CLOSED_* 状态，返回现有数据（不重复入队 Copilot）
  if (
    existing.status === 'CLOSED_WIN' ||
    existing.status === 'CLOSED_LOSS' ||
    existing.status === 'CLOSED_FLAT'
  ) {
    if (!existing.result) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        '数据不一致：假设已关闭但无 result 记录',
        500,
      )
    }
    return {
      hypothesis: {
        id: existing.id,
        status: existing.status,
        closedAt: existing.closedAt?.getTime() ?? Date.now(),
      },
      result: {
        id: existing.result.id,
        metricType: existing.result.metricType,
        metricName: existing.result.metricName,
        baseline: existing.result.baseline,
        actual: existing.result.actual,
        delta: existing.result.delta,
        unit: existing.result.unit,
        conclusion: existing.result.conclusion,
        humanNote: existing.result.humanNote,
        createdAt: existing.result.createdAt.getTime(),
      },
      copilotStatus: 'success', // 已存在就认为历史已处理
    }
  }

  // 事务内：create result + update hypothesis + update KR
  const delta = input.actual - input.baseline
  const nextStatus = conclusionToStatus(input.conclusion)

  const { updatedHyp, createdResult } = await prisma.$transaction(async (tx) => {
    // 创建 result
    const createdResult = await tx.hypothesisResult.create({
      data: {
        hypothesisId,
        metricType: input.metricType,
        metricName: input.metricName,
        baseline: input.baseline,
        actual: input.actual,
        delta, // 服务端算
        unit: input.unit ?? null,
        conclusion: input.conclusion,
        humanNote: input.humanNote ?? null,
      },
    })

    // 更新 hypothesis
    const updatedHyp = await tx.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        status: nextStatus,
        closedAt: new Date(),
      },
    })

    // Phase C.3: 驱动 KR currentValue 并写一条 KrIteration 审计记录
    // 规则：
    //   - conclusion = WIN 且 delta > 0：增量推进 currentValue
    //   - conclusion = LOSS / FLAT：不动 currentValue，只记一条 iteration 审计
    //   - conclusion = INCONCLUSIVE：同 FLAT
    if (input.conclusion === 'WIN' && delta > 0) {
      await tx.keyResult.update({
        where: { id: existing.krId },
        data: {
          currentValue: {
            increment: delta,
          },
        },
      })
    }

    // 写 KrIteration 审计条目：记录本次 hypothesis 关闭对 KR 的影响
    // roundNumber 自增（去 KR 现有最大 + 1）
    const lastRound = await tx.krIteration.findFirst({
      where: { keyResultId: existing.krId },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    })
    await tx.krIteration.create({
      data: {
        keyResultId: existing.krId,
        roundNumber: (lastRound?.roundNumber ?? 0) + 1,
        changes: `假设验证: ${input.metricName} ${input.baseline}${input.unit ?? ''} → ${input.actual}${input.unit ?? ''} (${input.conclusion})`,
        dataFeedback: input.actual,
        isAchieved: input.conclusion === 'WIN',
        recordedById: actor.userId,
      },
    })

    return { updatedHyp, createdResult }
  })

  // 事务外：enqueue Copilot
  let copilotStatus: CopilotStatus = 'pending'
  let copilotError: string | undefined
  try {
    const jobId = await enqueueCopilotJob('run-on-close', {
      hypothesisId,
      triggeredBy: actor.userId,
    })
    if (jobId === null) {
      copilotStatus = 'unavailable'
      copilotError = 'Redis/BullMQ 不可达，学习笔记暂无法生成'
    }
  } catch (err) {
    copilotStatus = 'unavailable'
    copilotError = (err as Error).message
  }

  // Phase F: 贡献点 — 胜出假设奖励
  if (input.conclusion === 'WIN') {
    const stmt = existing.statement?.slice(0, 30) ?? '假设'
    await awardPoints({
      userId: existing.ownerId,
      eventKey: `hypothesis_won:hypothesis:${hypothesisId}`,
      eventType: 'hypothesis_won',
      category: PointCategory.base,
      sourceType: ContributionSourceType.hypothesis,
      sourceId: hypothesisId,
      points: 20,
      reason: `假设「${stmt}」胜出 +20`,
    })
    await awardPoints({
      userId: existing.ownerId,
      eventKey: `hypothesis_won_value:hypothesis:${hypothesisId}`,
      eventType: 'hypothesis_won',
      category: PointCategory.value,
      sourceType: ContributionSourceType.hypothesis,
      sourceId: hypothesisId,
      points: 10,
      reason: `假设「${stmt}」胜出 价值 +10`,
    })
  }

  return {
    hypothesis: {
      id: updatedHyp.id,
      status: updatedHyp.status,
      closedAt: updatedHyp.closedAt?.getTime() ?? Date.now(),
    },
    result: {
      id: createdResult.id,
      metricType: createdResult.metricType,
      metricName: createdResult.metricName,
      baseline: createdResult.baseline,
      actual: createdResult.actual,
      delta: createdResult.delta,
      unit: createdResult.unit,
      conclusion: createdResult.conclusion,
      humanNote: createdResult.humanNote,
      createdAt: createdResult.createdAt.getTime(),
    },
    copilotStatus,
    copilotError,
  }
}
