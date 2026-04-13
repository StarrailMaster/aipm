import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as contributionService from '../../services/contribution'
import { success } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'
import { ContributionSourceType } from '@prisma/client'
import type { ContributionWindow } from '../../services/contribution'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// ---------- helpers ----------

const VALID_WINDOWS: ContributionWindow[] = ['week', 'month', 'all']

function parseWindow(raw: unknown): ContributionWindow {
  if (typeof raw === 'string' && VALID_WINDOWS.includes(raw as ContributionWindow)) {
    return raw as ContributionWindow
  }
  return 'all'
}

function parseSourceType(raw: unknown): ContributionSourceType | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined
  const valid = Object.values(ContributionSourceType) as string[]
  if (!valid.includes(raw)) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `sourceType must be one of: ${valid.join(', ')}`,
    )
  }
  return raw as ContributionSourceType
}

function parseLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}

// ---------- routes ----------

// GET /api/v1/contribution/leaderboard?window=week|month|all&sourceType=prompt&limit=50
router.get(
  '/leaderboard',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const window = parseWindow(req.query.window)
      const sourceType = parseSourceType(req.query.sourceType)
      const limit = parseLimit(req.query.limit, 50, 200)

      const items = await contributionService.getLeaderboard({
        window,
        sourceType,
        limit,
      })

      success(res, { items, window, sourceType: sourceType ?? null, limit })
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/contribution/me
router.get(
  '/me',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await contributionService.getMyContribution(req.user!.userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/contribution/recent?limit=30&sourceType=...
router.get(
  '/recent',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sourceType = parseSourceType(req.query.sourceType)
      const limit = parseLimit(req.query.limit, 30, 200)

      const items = await contributionService.listRecentEvents({ limit, sourceType })
      success(res, { items, limit, sourceType: sourceType ?? null })
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/contribution/user/:userId — 查看某用户的公开贡献概况
router.get(
  '/user/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params
      if (!userId) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'userId is required')
      }
      const result = await contributionService.getUserContribution(userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
