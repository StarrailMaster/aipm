import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'

/**
 * Feed 权限辅助：检查用户是否有权在指定 feed 上执行写操作
 *
 * 允许写的前提（任一成立）：
 *   1. userRole === 'ADMIN'
 *   2. 用户是 feed 的 assignee
 *   3. 用户是 feed 的 createdBy
 *   4. 用户所在 squad === feed 所属 iteration.squadId（同组成员）
 *
 * @throws AppError PERMISSION_DENIED 403 如果都不满足
 */
export async function ensureCanWriteFeed(
  feedPackageId: string,
  userId: string,
  userRole: string,
  action: string = '操作',
): Promise<void> {
  if (userRole === 'ADMIN') return

  const pkg = await prisma.feedPackage.findUnique({
    where: { id: feedPackageId },
    select: {
      assigneeId: true,
      createdById: true,
      iterationId: true,
      deletedAt: true,
    },
  })

  if (!pkg || pkg.deletedAt) {
    throw new AppError(ErrorCodes.FEED_NOT_FOUND, '工作台包不存在', 404)
  }

  // 1. assignee or creator — 直接放行
  if (pkg.assigneeId === userId || pkg.createdById === userId) return

  // 2. 同一 squad 成员
  const iteration = await prisma.iteration.findUnique({
    where: { id: pkg.iterationId },
    select: { squadId: true },
  })
  if (iteration) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { squadId: true },
    })
    if (user?.squadId && user.squadId === iteration.squadId) return
  }

  throw new AppError(
    ErrorCodes.PERMISSION_DENIED,
    `你不是该工作台包的负责人、创建者或所在组成员，无法${action}`,
    403,
  )
}
