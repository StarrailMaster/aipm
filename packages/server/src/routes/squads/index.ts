import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import * as squadService from '../../services/squad'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All squad routes require authentication
router.use(authMiddleware)

// GET /api/v1/squads
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = parsePagination(req.query as Record<string, unknown>)
      const { projectId } = req.query as { projectId?: string }

      const { items, total } = await squadService.listSquads({
        ...pagination,
        projectId,
      })
      paginate(res, items, total, pagination.page, pagination.pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/squads
router.post(
  '/',
  requireRole('ADMIN', 'ARCHITECT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, projectId, architectId, engineerId } = req.body as {
        name?: string
        projectId?: string
        architectId?: string
        engineerId?: string
      }

      if (!name || !projectId || !architectId || !engineerId) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'name, projectId, architectId, and engineerId are required',
        )
      }

      const squad = await squadService.createSquad({
        name,
        projectId,
        architectId,
        engineerId,
      })
      success(res, squad, 'Squad created')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/squads/:id
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const squad = await squadService.getSquad(req.params.id)
      success(res, squad)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/squads/:id
router.put(
  '/:id',
  requireRole('ADMIN', 'ARCHITECT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, architectId, engineerId } = req.body as {
        name?: string
        architectId?: string
        engineerId?: string
      }

      const squad = await squadService.updateSquad(req.params.id, {
        name,
        architectId,
        engineerId,
      })
      success(res, squad, 'Squad updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/squads/:id — ADMIN only
router.delete(
  '/:id',
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await squadService.deleteSquad(req.params.id)
      success(res, null, 'Squad deleted')
    } catch (err) {
      next(err)
    }
  },
)

export default router
