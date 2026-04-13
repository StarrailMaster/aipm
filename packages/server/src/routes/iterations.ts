import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import * as iterationService from '../services/iteration.service'
import { success, paginate, parsePagination } from '../utils/response'
import { AppError, ErrorCodes } from '../utils/errors'

const router: Router = Router()

router.use(authMiddleware)

// GET /api/v1/iterations — list iterations
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const projectId = req.query.projectId as string | undefined
      const squadId = req.query.squadId as string | undefined
      const status = req.query.status as string | undefined
      const search = req.query.search as string | undefined

      const result = await iterationService.listIterations({
        page, pageSize, skip, projectId, squadId, status, search,
      })

      paginate(res, result.items, result.total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/iterations — create iteration
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, squadId, name } = req.body as {
        projectId?: string
        squadId?: string
        name?: string
      }

      if (!projectId || !squadId || !name) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'projectId, squadId, name 必填')
      }

      const result = await iterationService.createIteration({ projectId, squadId, name, userId: req.user!.userId })
      success(res, result, '迭代已创建')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/iterations/:id — get iteration detail
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await iterationService.getIteration(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/iterations/:id — update iteration name
router.put(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body as { name?: string }
      const result = await iterationService.updateIteration(req.params.id, { name })
      success(res, result, '迭代已更新')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/iterations/:id/status — advance iteration status
router.post(
  '/:id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body as { status?: string }
      if (!status) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'status 必填')
      }

      const result = await iterationService.updateIterationStatus(req.params.id, status)
      success(res, result, '状态已更新')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/iterations/:id?cascade=true — delete iteration
// 默认拒绝带 feed 包的删除，需显式 cascade=true 才级联清空
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cascade = req.query.cascade === 'true' || req.query.cascade === '1'
      await iterationService.deleteIteration(req.params.id, { cascade })
      success(res, null, cascade ? '任务及关联工作台包已删除' : '任务已删除')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/iterations/:id/advance — AI 拆解 & 生成投喂包
// 语义：每次调用都会先软删除该任务下所有现有投喂包，再从第 1 轮开始重新生成。
// 不支持追加模式 —— Byron 的工作流是"每次从白板推就覆盖，不留旧的"。
router.post(
  '/:id/advance',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await iterationService.advanceIteration(
        req.params.id,
        req.user!.userId,
      )
      success(res, result, '已清空并重新拆解')
    } catch (err) {
      next(err)
    }
  },
)

export default router
