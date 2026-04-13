import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as warehouseService from '../../services/warehouse'
import { success } from '../../utils/response'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// POST /api/v1/warehouse/process/:feedbackId — trigger warehouse agent processing
router.post(
  '/process/:feedbackId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await warehouseService.processWarehouse(req.params.feedbackId)
      success(res, result, 'Warehouse agent processing complete')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/warehouse/result/:feedbackId — get warehouse result for a feedback
router.get(
  '/result/:feedbackId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await warehouseService.getWarehouseResult(req.params.feedbackId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
