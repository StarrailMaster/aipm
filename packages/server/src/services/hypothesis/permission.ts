/**
 * Hypothesis permission helpers
 *
 * 允许写的前提（任一成立）：
 *   1. userRole === 'ADMIN'
 *   2. 用户是 hypothesis 的 owner
 *   3. 用户所在 squad === hypothesis KR 所属 squad
 *
 * 遵循 PRD §2.3 N3：不动现有 iteration/feed/board 流程——这里单独实现权限。
 */
import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'

export async function ensureCanWriteHypothesis(
  hypothesisId: string,
  userId: string,
  userRole: string,
  action: string = '操作',
): Promise<void> {
  if (userRole === 'ADMIN') return

  const hyp = await prisma.hypothesis.findUnique({
    where: { id: hypothesisId },
    select: {
      ownerId: true,
      deletedAt: true,
      keyResult: {
        select: {
          objective: { select: { squadId: true } },
        },
      },
    },
  })

  if (!hyp || hyp.deletedAt) {
    throw new AppError(ErrorCodes.HYPOTHESIS_NOT_FOUND, '假设不存在', 404)
  }

  if (hyp.ownerId === userId) return

  // 同一 squad 成员也可写
  const objSquadId = hyp.keyResult.objective.squadId
  if (objSquadId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { squadId: true },
    })
    if (user?.squadId && user.squadId === objSquadId) return
  }

  throw new AppError(
    ErrorCodes.PERMISSION_DENIED,
    `你不是该假设的 owner，且不在所在小组内，无法${action}`,
    403,
  )
}

/**
 * 循环检测 + 深度限制（D13 决策）
 *
 * 算法：从 newParentId 向上遍历 parent 链，如果遇到 currentHypothesisId 则是循环。
 * 深度上限 20（防止无限链，也和 tree API 的截断深度一致）。
 */
export async function validateNoCycleAndDepth(
  newParentId: string,
  currentHypothesisId: string | null, // null 时表示创建新假设（没有 current）
  maxDepth = 20,
): Promise<void> {
  const visited = new Set<string>()
  if (currentHypothesisId) visited.add(currentHypothesisId)

  let cursor: string | null = newParentId
  let depth = 0

  while (cursor) {
    if (visited.has(cursor)) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_PARENT_CYCLE,
        '假设链形成循环，parentId 不能指向自身或后代',
      )
    }
    depth += 1
    if (depth > maxDepth) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_DEPTH_EXCEEDED,
        `假设链深度超过 ${maxDepth} 层，请重新组织`,
      )
    }
    visited.add(cursor)
    const parent: { parentId: string | null } | null =
      await prisma.hypothesis.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      })
    cursor = parent?.parentId ?? null
  }
}
