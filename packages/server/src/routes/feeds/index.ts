import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as feedService from '../../services/feed'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/feeds — list feed packages
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const iterationId = req.query.iterationId as string | undefined
      const phase = req.query.phase as string | undefined
      const status = req.query.status as string | undefined
      const search = req.query.search as string | undefined

      const result = await feedService.listFeedPackages({
        page,
        pageSize,
        skip,
        iterationId,
        phase,
        status,
        search,
      })

      paginate(res, result.items, result.total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/feeds/graph — dependency graph for iteration (must be before /:id)
router.get(
  '/graph',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const iterationId = req.query.iterationId as string | undefined

      if (!iterationId) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'iterationId is required')
      }

      const result = await feedService.getDependencyGraph(iterationId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/feeds/by-project — 按项目获取投喂包（含任务分组）(must be before /:id)
router.get(
  '/by-project',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.query as { projectId?: string }
      if (!projectId) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'projectId 必填')
      }
      const result = await feedService.listFeedsByProject(projectId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds — create feed package
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { iterationId, name, phase, promptId, dependsOn, canParallel, designOutputRequired } =
        req.body as {
          iterationId?: string
          name?: string
          phase?: string
          promptId?: string
          dependsOn?: string[]
          canParallel?: boolean
          designOutputRequired?: boolean
        }

      if (!iterationId || !name || !phase) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'iterationId, name, and phase are required')
      }

      const result = await feedService.createFeedPackage(req.user!.userId, {
        iterationId,
        name,
        phase,
        promptId,
        dependsOn,
        canParallel,
        designOutputRequired,
      })

      success(res, result, 'Feed package created')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/feeds/:id — get feed package detail
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedService.getFeedPackageDetail(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/feeds/:id — update feed package
router.put(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        phase,
        promptId,
        dependsOn,
        canParallel,
        assigneeId,
        sortOrder,
        designOutputRequired,
      } = req.body as {
        name?: string
        phase?: string
        promptId?: string
        dependsOn?: string[]
        canParallel?: boolean
        assigneeId?: string
        sortOrder?: number
        designOutputRequired?: boolean
      }

      const result = await feedService.updateFeedPackage(req.params.id, {
        name,
        phase,
        promptId,
        dependsOn,
        canParallel,
        assigneeId,
        sortOrder,
        designOutputRequired,
      })

      success(res, result, 'Feed package updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/feeds/:id — soft delete
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await feedService.deleteFeedPackage(req.params.id)
      success(res, null, 'Feed package deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/files — add file to package
router.post(
  '/:id/files',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, content, layer } = req.body as {
        name?: string
        content?: string
        layer?: string
      }

      if (!name || content === undefined || !layer) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'name, content, and layer are required')
      }

      if (layer !== 'core' && layer !== 'context') {
        throw new AppError(ErrorCodes.INVALID_FORMAT, 'layer must be "core" or "context"')
      }

      const result = await feedService.addFile(req.params.id, { name, content, layer })
      success(res, result, 'File added')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/feeds/:id/files/:fileId — update file
router.put(
  '/:id/files/:fileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, content } = req.body as {
        name?: string
        content?: string
      }

      const result = await feedService.updateFile(req.params.id, req.params.fileId, { name, content })
      success(res, result, 'File updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/feeds/:id/files/:fileId — delete file
router.delete(
  '/:id/files/:fileId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await feedService.deleteFile(req.params.id, req.params.fileId)
      success(res, null, 'File deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/status — update status with dependency validation
router.post(
  '/:id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body as { status?: string }

      if (!status) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'status is required')
      }

      const validStatuses = ['BLOCKED', 'PENDING', 'IN_PROGRESS', 'REVIEW', 'DONE', 'REWORK']
      if (!validStatuses.includes(status)) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, `status must be one of: ${validStatuses.join(', ')}`)
      }

      const result = await feedService.updateStatus(req.params.id, status, {
        userId: req.user!.userId,
        role: req.user!.role,
      })
      success(res, result, 'Status updated')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/execute — record execution
router.post(
  '/:id/execute',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { aiTool, outputSummary, issues } = req.body as {
        aiTool?: string
        outputSummary?: string
        issues?: string
      }

      if (!aiTool || !outputSummary) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'aiTool and outputSummary are required')
      }

      const result = await feedService.recordExecution(
        req.params.id,
        { userId: req.user!.userId, role: req.user!.role },
        { aiTool, outputSummary, issues },
      )

      success(res, result, 'Execution recorded')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/feeds/:id/assemble — assemble full feed package content
router.get(
  '/:id/assemble',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedService.assembleFeedPackage(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/complete — 一键把包推到 DONE（自动 claim + 跳过中间状态）
// 代替客户端循环调 status PENDING→IN_PROGRESS→REVIEW→DONE 的多次调用
router.post(
  '/:id/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedService.completeFeed(req.params.id, {
        userId: req.user!.userId,
        role: req.user!.role,
      })
      success(res, result, result.alreadyDone ? '已是已完成状态' : '已标记完成')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/claim — 领取工作台包，assigneeId = self
router.post(
  '/:id/claim',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedService.claimFeed(req.params.id, {
        userId: req.user!.userId,
        role: req.user!.role,
      })
      success(res, result, '已领取')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/release — 释放领取（仅当前负责人或管理员）
router.post(
  '/:id/release',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedService.releaseFeed(req.params.id, {
        userId: req.user!.userId,
        role: req.user!.role,
      })
      success(res, result, '已释放')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/rate — 点赞/点踩
router.post(
  '/:id/rate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.body as { type?: 'up' | 'down' }
      if (!type || !['up', 'down'].includes(type)) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'type 必须为 up 或 down')
      }
      const result = await feedService.rateFeedPackage(req.params.id, type)
      success(res, result, '已评价')
    } catch (err) {
      next(err)
    }
  },
)

// ========================================================================
// 设计审核流转（工作台 → 设计师 → 推进）
// ========================================================================

// POST /api/v1/feeds/:id/push-to-design — 实施工程师把工作台包推给设计审核
router.post(
  '/:id/push-to-design',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { figmaUrl, designerId } = req.body as {
        figmaUrl?: string
        designerId?: string
      }
      if (!figmaUrl || !designerId) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'figmaUrl 和 designerId 必填',
        )
      }
      const result = await feedService.pushToDesign(
        req.params.id,
        req.user!.userId,
        req.user!.role,
        { figmaUrl, designerId },
      )
      success(res, result, '已推给设计审核')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/design-approve — 设计师审核通过
router.post(
  '/:id/design-approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedService.approveDesign(
        req.params.id,
        req.user!.userId,
        req.user!.role,
      )
      success(res, result, '已审核通过')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feeds/:id/design-reject — 设计师驳回
router.post(
  '/:id/design-reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body as { reason?: string }
      if (!reason || reason.trim().length === 0) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '请填写驳回原因')
      }
      const result = await feedService.rejectDesign(
        req.params.id,
        req.user!.userId,
        req.user!.role,
        { reason },
      )
      success(res, result, '已驳回')
    } catch (err) {
      next(err)
    }
  },
)

export default router
