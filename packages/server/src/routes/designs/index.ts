import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as designService from '../../services/design'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/designs — list designs
// 支持按 sourceType / assigneeId / createdById / mineOnly 过滤
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const iterationId = req.query.iterationId as string | undefined
      const status = req.query.status as string | undefined
      const sourceType = req.query.sourceType as string | undefined
      // mineOnly=1 → 只显示指派给我或我创建的
      const mineOnly = req.query.mineOnly === '1' || req.query.mineOnly === 'true'
      let assigneeId = req.query.assigneeId as string | undefined
      let createdById = req.query.createdById as string | undefined
      if (mineOnly) {
        assigneeId = req.user!.userId
      }

      const result = await designService.listDesigns({
        page,
        pageSize,
        skip,
        iterationId,
        status,
        sourceType,
        assigneeId,
        createdById,
      })

      paginate(res, result.items, result.total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/designs — create design draft（手动添加设计任务）
// 业务要求：手动添加必须指派给一位设计师（流程闭环）
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { iterationId, name, figmaUrl, assigneeId } = req.body as {
        iterationId?: string
        name?: string
        figmaUrl?: string
        assigneeId?: string
      }

      if (!iterationId || !name || !assigneeId) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'iterationId、name、assigneeId 都是必填（手动添加任务必须指派给一位设计师）',
        )
      }

      const result = await designService.createDesignDraft(req.user!.userId, {
        iterationId,
        name,
        figmaUrl,
        assigneeId,
      })

      success(res, result, 'Design draft created')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/designs/:id — get design detail
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await designService.getDesignDetail(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/designs/:id — update design
router.put(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, figmaUrl, assigneeId, changeLog } = req.body as {
        name?: string
        figmaUrl?: string
        assigneeId?: string
        changeLog?: string
      }

      const result = await designService.updateDesignDraft(req.params.id, {
        name,
        figmaUrl,
        assigneeId,
        changeLog,
      })

      success(res, result, 'Design draft updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/designs/:id — soft delete
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await designService.deleteDesignDraft(req.params.id)
      success(res, null, 'Design draft deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/designs/:id/status — change status
router.post(
  '/:id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, changeLog } = req.body as {
        status?: string
        changeLog?: string
      }

      if (!status) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'status is required')
      }

      const result = await designService.changeDesignStatus(req.params.id, req.user!.userId, {
        status,
        changeLog,
      })

      success(res, result, 'Status changed')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/designs/:id/lock — lock design
router.post(
  '/:id/lock',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await designService.lockDesign(req.params.id, req.user!.userId, req.user!.role)
      success(res, result, 'Design locked')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/designs/:id/unlock — unlock design
router.post(
  '/:id/unlock',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body as { reason?: string }

      if (!reason) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'reason is required to unlock a design')
      }

      const result = await designService.unlockDesign(
        req.params.id,
        req.user!.userId,
        req.user!.role,
        reason,
      )
      success(res, result, 'Design unlocked')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/designs/:id/history — get status change history
router.get(
  '/:id/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await designService.getDesignHistory(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// ========================================================================
// 手动设计任务闭环：设计师完成 → 创建人确认
// ========================================================================

// POST /api/v1/designs/:id/complete — 设计师标记手动任务完成
router.post(
  '/:id/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await designService.completeDesign(req.params.id, req.user!.userId)
      success(res, result, '已推给创建人确认')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/designs/:id/confirm — 创建人确认，流程结束
router.post(
  '/:id/confirm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await designService.confirmDesign(req.params.id, req.user!.userId)
      success(res, result, '已确认，流程结束')
    } catch (err) {
      next(err)
    }
  },
)

export default router
