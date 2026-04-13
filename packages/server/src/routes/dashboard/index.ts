import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import * as dashboardService from '../../services/dashboard'
import {
  getLearningDashboard,
  getCrossProjectDashboard,
} from '../../services/dashboard/learning.service'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'
import prisma from '../../prisma/client'
import { enqueueCopilotJob, getRedis } from '../../queues'
import { getMonthlyCostSummary } from '../../services/copilot/budget'

// Fix 3: Manual digest rate limit (PRD D7: 3 triggers/hour/user)
const DIGEST_RATE_LIMIT_PER_HOUR = 3
async function checkDigestRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  try {
    const redis = getRedis()
    const now = Date.now()
    const bucket = Math.floor(now / 3_600_000) // 1-hour buckets
    const key = `digest:ratelimit:${userId}:${bucket}`
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, 3600)
    }
    const ttl = await redis.ttl(key)
    return {
      allowed: count <= DIGEST_RATE_LIMIT_PER_HOUR,
      remaining: Math.max(0, DIGEST_RATE_LIMIT_PER_HOUR - count),
      resetInSeconds: ttl > 0 ? ttl : 3600,
    }
  } catch (err) {
    // Redis 宕机时 fail-open（允许通过），避免阻断管理员
    console.warn('[digest-ratelimit] redis unavailable, failing open:', (err as Error).message)
    return { allowed: true, remaining: DIGEST_RATE_LIMIT_PER_HOUR, resetInSeconds: 3600 }
  }
}

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/dashboard?projectId=xxx&month=xxx
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.query.projectId as string | undefined
      const month = req.query.month as string | undefined

      let result
      if (projectId) {
        result = await dashboardService.getProjectDashboard(projectId, month)
      } else {
        result = await dashboardService.getCompanyDashboard(month)
      }

      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/dashboard/iterations?search=xxx — search iterations by name
router.get(
  '/iterations',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const search = req.query.search as string | undefined

      const where = {
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      }

      const [items, total] = await Promise.all([
        prisma.iteration.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        prisma.iteration.count({ where }),
      ])

      const responseItems = items.map((it) => ({
        id: it.id,
        name: it.name,
        projectId: it.projectId,
        squadId: it.squadId,
        status: it.status,
        createdAt: it.createdAt.getTime(),
      }))

      paginate(res, responseItems, total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/dashboard/my-tasks — 我的任务聚合（6 类待办）
router.get(
  '/my-tasks',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await dashboardService.getMyTasks(req.user!.userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/dashboard/efficiency?days=30 — 个人效率看板
router.get(
  '/efficiency',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const daysRaw = req.query.days as string | undefined
      const days = daysRaw ? Math.max(1, Math.min(365, parseInt(daysRaw, 10) || 30)) : 30
      const result = await dashboardService.getEfficiency(req.user!.userId, days)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/dashboard/pm-metrics?scope=...&projectId=...&squadId=...&userId=...&days=30
//
// 效能看板的权限模型：
//   - ADMIN 可以选任意 scope（all/project/squad/user），看全局 / 按项目 / 按小组 / 按个人
//   - 非 ADMIN 一律强制 scope=user + userId=自己（只看自己的数据），无论前端传了什么
//
// scope 参数（仅影响 ADMIN）：
//   all     = 不加任何 assignee / project / squad 过滤，看全局
//   project = 只看 projectId 下的数据（projectId 必填）
//   squad   = 只看 squadId 下成员的数据（squadId 必填）
//   user    = 只看 userId 的数据（userId 必填）
router.get(
  '/pm-metrics',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const daysRaw = req.query.days as string | undefined
      const days = daysRaw
        ? Math.max(1, Math.min(365, parseInt(daysRaw, 10) || 30))
        : 30

      const currentUserId = req.user!.userId
      const currentRole = req.user!.role
      const isAdmin = currentRole === 'ADMIN'

      // 参数解析
      const scopeRaw = req.query.scope as string | undefined
      const projectIdRaw = req.query.projectId as string | undefined
      const squadIdRaw = req.query.squadId as string | undefined
      const userIdRaw = req.query.userId as string | undefined

      // 权限收敛：非 ADMIN 强制只看自己
      let projectId: string | undefined
      let squadId: string | undefined
      let userId: string | undefined

      if (!isAdmin) {
        // 普通用户：忽略 scope / projectId / squadId / userId，强制看自己
        userId = currentUserId
      } else {
        // ADMIN：按 scope 决定参数
        const scope =
          scopeRaw === 'all' ||
          scopeRaw === 'project' ||
          scopeRaw === 'squad' ||
          scopeRaw === 'user'
            ? scopeRaw
            : 'all'

        if (scope === 'project') {
          projectId = projectIdRaw || undefined
        } else if (scope === 'squad') {
          squadId = squadIdRaw || undefined
        } else if (scope === 'user') {
          userId = userIdRaw || undefined
        }
        // scope === 'all' → 全部留空
      }

      const result = await dashboardService.getPmMetrics({
        projectId,
        squadId,
        userId,
        days,
      })
      // 附加当前生效的 scope 回给前端，让它知道权限降级结果
      success(res, {
        ...result,
        _scope: {
          isAdmin,
          effectiveScope: isAdmin
            ? projectId
              ? 'project'
              : squadId
                ? 'squad'
                : userId
                  ? 'user'
                  : 'all'
            : 'user',
          effectiveUserId: userId ?? null,
          effectiveProjectId: projectId ?? null,
          effectiveSquadId: squadId ?? null,
        },
      })
    } catch (err) {
      next(err)
    }
  },
)

// ============================================================
// Learning Copilot v2.0 routes
// ============================================================

// GET /api/v1/dashboard/learning — Learning Dashboard 首页数据
router.get(
  '/learning',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.query.projectId as string | undefined
      const scope = (req.query.scope as 'all' | 'mine' | undefined) ?? 'mine'

      // 拉 user squadId
      const me = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { squadId: true },
      })

      const result = await getLearningDashboard({
        userId: req.user!.userId,
        userSquadId: me?.squadId ?? null,
        userRole: req.user!.role,
        projectId,
        scope,
      })
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/dashboard/learning/digest — 手动触发 Copilot digest
// 限制：ADMIN + KR Owner 可触发（简化：先只允许 ADMIN，KR Owner 校验 v2 加）
// Fix 3: 限速 3 次/小时/用户（PRD D7）
router.post(
  '/learning/digest',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 简化权限：只允许 ADMIN
      if (req.user!.role !== 'ADMIN') {
        throw new AppError(
          ErrorCodes.PERMISSION_DENIED,
          '只有管理员可以手动触发 digest',
          403,
        )
      }

      // Fix 3: 检查速率限制
      const rate = await checkDigestRateLimit(req.user!.userId)
      if (!rate.allowed) {
        const resetMin = Math.ceil(rate.resetInSeconds / 60)
        throw new AppError(
          ErrorCodes.COPILOT_RATE_LIMITED,
          `手动触发 digest 限速：每小时最多 ${DIGEST_RATE_LIMIT_PER_HOUR} 次，请在 ${resetMin} 分钟后重试`,
          429,
        )
      }

      const { scope = 'global' } = req.body as { scope?: string }
      const jobId = await enqueueCopilotJob('run-manual-digest', {
        scope,
        triggeredBy: req.user!.userId,
      })
      if (!jobId) {
        throw new AppError(
          ErrorCodes.COPILOT_UNAVAILABLE,
          'Copilot 队列暂不可用，稍后重试',
          503,
        )
      }
      // 附加剩余次数信息
      res.setHeader('X-RateLimit-Limit', DIGEST_RATE_LIMIT_PER_HOUR.toString())
      res.setHeader('X-RateLimit-Remaining', rate.remaining.toString())
      res.setHeader('X-RateLimit-Reset', rate.resetInSeconds.toString())
      success(res, { jobId, scope, rateLimit: rate }, '已触发 digest 生成任务')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/dashboard/cross-project — G10 ADMIN only
router.get(
  '/cross-project',
  requireRole('ADMIN'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await getCrossProjectDashboard()
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/dashboard/copilot-cost — 月度 Copilot 成本摘要（admin widget）
router.get(
  '/copilot-cost',
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const month = req.query.month as string | undefined
      const result = await getMonthlyCostSummary(month)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
