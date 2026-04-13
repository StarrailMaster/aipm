/**
 * Fix 5: DB CHECK Constraints
 *
 * Prisma schema 无法原生表达 CHECK 约束。在 bootstrap 时幂等地执行 DDL，
 * 保证 PG 层面的数据完整性。失败不阻断启动（log 警告即可），但会在审计时
 * 报告缺失的约束。
 *
 * 参考 PRD §5 Hypothesis 注释：
 *   "status ∈ CLOSED_* 时 closedAt 必须非空（DB CHECK 约束，migration SQL 加）"
 */
import prisma from './client'

interface CheckConstraint {
  name: string
  table: string
  definition: string
  description: string
}

const CHECK_CONSTRAINTS: CheckConstraint[] = [
  {
    name: 'hypothesis_closed_at_when_closed',
    table: 'Hypothesis',
    definition: `CHECK (
      (status NOT IN ('CLOSED_WIN', 'CLOSED_LOSS', 'CLOSED_FLAT', 'ABANDONED'))
      OR ("closedAt" IS NOT NULL)
    )`,
    description: 'CLOSED_* status 必须有 closedAt',
  },
  {
    name: 'hypothesis_variant_conversion_le_sample',
    table: 'HypothesisVariant',
    definition: `CHECK (
      "conversionCount" IS NULL
      OR "sampleSize" IS NULL
      OR "conversionCount" <= "sampleSize"
    )`,
    description: 'variant 转化数不能超过样本量',
  },
  {
    name: 'hypothesis_result_delta_is_diff',
    table: 'HypothesisResult',
    definition: `CHECK (
      delta IS NULL OR baseline IS NULL OR actual IS NULL
      OR abs(delta - (actual - baseline)) < 0.0001
    )`,
    description: 'result.delta 必须等于 actual - baseline',
  },
]

/**
 * 幂等创建 CHECK 约束。
 *
 * 由于 Prisma 不知道这些约束，`db push` 每次可能不会删除它们（约束不在 schema 里），
 * 但如果发生了 schema reset，我们需要重新创建。使用 DO BLOCK + IF NOT EXISTS 语义。
 */
export async function ensureCheckConstraints(): Promise<{
  created: string[]
  existing: string[]
  failed: string[]
}> {
  const created: string[] = []
  const existing: string[] = []
  const failed: string[] = []

  for (const c of CHECK_CONSTRAINTS) {
    try {
      // 检查是否已存在（information_schema）
      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count
         FROM information_schema.constraint_column_usage
         WHERE constraint_name = $1`,
        c.name,
      )
      const exists = (rows?.[0]?.count ?? 0n) > 0n
      if (exists) {
        existing.push(c.name)
        continue
      }

      // ALTER TABLE 加约束。双引号包裹表名以保持 PascalCase。
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" ${c.definition}`,
      )
      created.push(c.name)
    } catch (err) {
      const msg = (err as Error).message
      // 重复创建的幂等错误忽略
      if (msg.includes('already exists')) {
        existing.push(c.name)
      } else {
        console.warn(
          `[constraints] Failed to create ${c.name} on ${c.table}: ${msg}`,
        )
        failed.push(c.name)
      }
    }
  }

  return { created, existing, failed }
}
