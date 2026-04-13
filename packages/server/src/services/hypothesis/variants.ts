/**
 * Hypothesis Variants Service — G7 A/B 测试 + 显著性检验
 *
 * 决策（PRD §6.6 + Eng Review §9.7 AC-7.*）：
 *   - 每个 hypothesis 第一个 variant 必须是 CONTROL
 *   - 添加 variant 必须 name 在该 hypothesis 内唯一（数据库约束）
 *   - 更新 variant results 时，**服务端自动重算所有其他 treatment 的 pValue/CI/isSignificant**
 *   - markWinner 必须 isSignificant=true，否则需要 force=true
 *   - 只能有一个 winner
 *   - pValue / CI / conversionRate 服务端计算，不接受客户端传值
 */
import type {
  HypothesisVariant as PrismaHypothesisVariant,
  VariantStatus,
} from '@prisma/client'
import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import { ensureCanWriteHypothesis } from './permission'
import { zTestTwoProportion } from './stats'

function mapVariant(v: PrismaHypothesisVariant) {
  return {
    id: v.id,
    hypothesisId: v.hypothesisId,
    name: v.name,
    description: v.description,
    type: v.type,
    sampleSize: v.sampleSize,
    conversionCount: v.conversionCount,
    metricValue: v.metricValue,
    metricUnit: v.metricUnit,
    conversionRate: v.conversionRate,
    stdError: v.stdError,
    pValue: v.pValue,
    confidenceInterval95Low: v.confidenceInterval95Low,
    confidenceInterval95High: v.confidenceInterval95High,
    isSignificant: v.isSignificant,
    isWinner: v.isWinner,
    createdAt: v.createdAt.getTime(),
    updatedAt: v.updatedAt.getTime(),
  }
}

// ============================================================
// Create variant
// ============================================================

export async function createVariant(
  hypothesisId: string,
  data: {
    name: string
    description?: string
    type?: VariantStatus
  },
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(
    hypothesisId,
    actor.userId,
    actor.role,
    '添加变体',
  )

  const existingVariants = await prisma.hypothesisVariant.findMany({
    where: { hypothesisId },
  })

  // 第一个 variant 必须是 CONTROL
  if (existingVariants.length === 0 && data.type && data.type !== 'CONTROL') {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_VARIANT_NEED_CONTROL,
      '第一个 variant 必须是 CONTROL',
    )
  }

  const type: VariantStatus =
    data.type ?? (existingVariants.length === 0 ? 'CONTROL' : 'TREATMENT')

  // 只能有一个 CONTROL
  if (type === 'CONTROL') {
    const hasControl = existingVariants.some((v) => v.type === 'CONTROL')
    if (hasControl) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_VARIANT_NEED_CONTROL,
        '该假设已有 CONTROL variant，只能有一个对照组',
      )
    }
  }

  // 检查 name 唯一（数据库也有 unique，但 error message 更友好）
  if (existingVariants.some((v) => v.name === data.name)) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `variant 名称 "${data.name}" 已存在`,
    )
  }

  const created = await prisma.hypothesisVariant.create({
    data: {
      hypothesisId,
      name: data.name,
      description: data.description ?? null,
      type,
    },
  })
  return mapVariant(created)
}

export async function listVariants(hypothesisId: string) {
  const variants = await prisma.hypothesisVariant.findMany({
    where: { hypothesisId },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  })
  return variants.map(mapVariant)
}

// ============================================================
// Update results + auto-recalculate significance
// ============================================================

export async function updateVariantResults(
  hypothesisId: string,
  variantId: string,
  data: {
    sampleSize?: number
    conversionCount?: number
    metricValue?: number
    metricUnit?: string
  },
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(
    hypothesisId,
    actor.userId,
    actor.role,
    '录入 variant 数据',
  )

  const variant = await prisma.hypothesisVariant.findFirst({
    where: { id: variantId, hypothesisId },
  })
  if (!variant) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_VARIANT_NOT_FOUND,
      'Variant 不存在',
      404,
    )
  }

  // 校验 conversionCount <= sampleSize
  if (
    data.sampleSize !== undefined &&
    data.conversionCount !== undefined &&
    data.conversionCount > data.sampleSize
  ) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_VARIANT_INCOMPLETE_DATA,
      `转化数 (${data.conversionCount}) 不能大于样本量 (${data.sampleSize})`,
    )
  }
  if (data.sampleSize !== undefined && data.sampleSize < 0) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_VARIANT_INCOMPLETE_DATA,
      '样本量必须 >= 0',
    )
  }
  if (data.conversionCount !== undefined && data.conversionCount < 0) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_VARIANT_INCOMPLETE_DATA,
      '转化数必须 >= 0',
    )
  }

  // Step 1: 更新目标 variant 的原始数据
  const updatedTarget = await prisma.hypothesisVariant.update({
    where: { id: variantId },
    data: {
      sampleSize: data.sampleSize ?? variant.sampleSize,
      conversionCount: data.conversionCount ?? variant.conversionCount,
      metricValue: data.metricValue ?? variant.metricValue,
      metricUnit: data.metricUnit ?? variant.metricUnit,
    },
  })

  // Step 2: 重算所有 variants 的派生字段（conversionRate + significance）
  // 拉最新全量 variants
  const allVariants = await prisma.hypothesisVariant.findMany({
    where: { hypothesisId },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  })
  void updatedTarget

  const control = allVariants.find((v) => v.type === 'CONTROL')
  const treatments = allVariants.filter((v) => v.type === 'TREATMENT')

  // 先更新 control 的 conversionRate（单独算，pValue/CI 对 control 都是 null）
  if (
    control &&
    control.sampleSize !== null &&
    control.sampleSize > 0 &&
    control.conversionCount !== null
  ) {
    const rate = control.conversionCount / control.sampleSize
    await prisma.hypothesisVariant.update({
      where: { id: control.id },
      data: {
        conversionRate: rate,
        stdError: null,
        pValue: null,
        confidenceInterval95Low: null,
        confidenceInterval95High: null,
        isSignificant: null,
      },
    })
  }

  // 再对每个 treatment 跑 z-test 相对 control
  for (const t of treatments) {
    if (
      t.sampleSize === null ||
      t.sampleSize === 0 ||
      t.conversionCount === null ||
      !control ||
      control.sampleSize === null ||
      control.sampleSize === 0 ||
      control.conversionCount === null
    ) {
      // 数据不全，保留 null
      await prisma.hypothesisVariant.update({
        where: { id: t.id },
        data: {
          conversionRate:
            t.sampleSize && t.conversionCount !== null
              ? t.conversionCount / t.sampleSize
              : null,
          stdError: null,
          pValue: null,
          confidenceInterval95Low: null,
          confidenceInterval95High: null,
          isSignificant: null,
        },
      })
      continue
    }

    const zTest = zTestTwoProportion(
      { successes: control.conversionCount, n: control.sampleSize },
      { successes: t.conversionCount, n: t.sampleSize },
    )

    await prisma.hypothesisVariant.update({
      where: { id: t.id },
      data: {
        conversionRate: zTest.treatmentRate,
        stdError: zTest.stdError,
        pValue: zTest.pValue,
        confidenceInterval95Low: zTest.ciLow95,
        confidenceInterval95High: zTest.ciHigh95,
        isSignificant: zTest.significant,
      },
    })
  }

  // 返回所有 variants（刷新后的）
  const refreshed = await prisma.hypothesisVariant.findMany({
    where: { hypothesisId },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  })
  return refreshed.map(mapVariant)
}

// ============================================================
// Mark Winner
// ============================================================

export async function markVariantAsWinner(
  hypothesisId: string,
  variantId: string,
  options: { force?: boolean },
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(
    hypothesisId,
    actor.userId,
    actor.role,
    '标记胜出 variant',
  )

  const variant = await prisma.hypothesisVariant.findFirst({
    where: { id: variantId, hypothesisId },
  })
  if (!variant) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_VARIANT_NOT_FOUND,
      'Variant 不存在',
      404,
    )
  }

  if (variant.type === 'CONTROL') {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      'CONTROL variant 不能被标记为胜出（按定义是基线）',
    )
  }

  // 只能有一个 winner
  if (variant.isSignificant === false && !options.force) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_VARIANT_NOT_SIGNIFICANT,
      '该 variant 未达显著（p >= 0.05），需要 ?force=true 才能标记',
    )
  }

  // 事务：清其他 winner + set 本 variant winner
  await prisma.$transaction(async (tx) => {
    await tx.hypothesisVariant.updateMany({
      where: { hypothesisId, isWinner: true },
      data: { isWinner: false },
    })
    await tx.hypothesisVariant.update({
      where: { id: variantId },
      data: { isWinner: true },
    })
  })

  return {
    success: true,
    variantId,
    wasForced: options.force && variant.isSignificant === false,
  }
}

// ============================================================
// Delete variant (only before hypothesis close)
// ============================================================

export async function deleteVariant(
  hypothesisId: string,
  variantId: string,
  actor: { userId: string; role: string },
) {
  await ensureCanWriteHypothesis(
    hypothesisId,
    actor.userId,
    actor.role,
    '删除 variant',
  )

  const hyp = await prisma.hypothesis.findUnique({
    where: { id: hypothesisId },
    select: { status: true },
  })
  if (
    hyp &&
    (hyp.status === 'CLOSED_WIN' ||
      hyp.status === 'CLOSED_LOSS' ||
      hyp.status === 'CLOSED_FLAT')
  ) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_ALREADY_CLOSED,
      '假设已关闭，不能删除 variant',
      409,
    )
  }

  await prisma.hypothesisVariant.delete({
    where: { id: variantId },
  })
}
