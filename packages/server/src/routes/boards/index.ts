import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as boardService from '../../services/board'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/boards?projectId=xxx — list boards for a project
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const projectId = req.query.projectId as string | undefined

      if (!projectId) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'projectId is required')
      }

      const result = await boardService.listBoards({
        page,
        pageSize,
        skip,
        projectId,
      })

      paginate(res, result.items, result.total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/boards — create board
// POST /api/v1/boards — ❌ 已下线（S-2 修复）
//
// 以前这个接口会创建"孤儿 board"（无关联 iteration），在"任务管理"页永远看不到，
// 但在数据库里占空间、持有 selections，是审计发现的脏数据来源。
//
// 正确路径：前端应调用 POST /api/v1/iterations，它会自动创建配对的 board。
// boardService.createBoard 仍然保留给 iteration.service 内部调用。
router.post(
  '/',
  async (_req: Request, _res: Response, next: NextFunction) => {
    next(
      new AppError(
        ErrorCodes.PERMISSION_DENIED,
        'Board 不能单独创建。请通过 POST /api/v1/iterations 创建任务，系统会自动生成配对的白板。',
        410, // Gone
      ),
    )
  },
)

// GET /api/v1/boards/:id — get board with selections
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await boardService.getBoardDetail(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/boards/:id — update board name/description
router.put(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description } = req.body as {
        name?: string
        description?: string
      }

      const result = await boardService.updateBoard(req.params.id, { name, description })
      success(res, result, 'Board updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/boards/:id — soft delete
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await boardService.deleteBoard(req.params.id)
      success(res, null, 'Board deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/boards/:id/selections — add item to board
router.post(
  '/:id/selections',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        type, promptId, sopDocumentId, content, color, size, position, note, assigneeId, layer,
        promptOverrideTitle, promptOverrideContent, promptOverrideTags,
      } = req.body as {
        type?: string
        promptId?: string
        sopDocumentId?: string
        content?: string
        color?: string
        size?: { width: number; height: number }
        position?: { x: number; y: number }
        note?: string
        assigneeId?: string
        layer?: import('@prisma/client').SopLayer
        promptOverrideTitle?: string
        promptOverrideContent?: string
        promptOverrideTags?: string[]
      }

      if (!position) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'position is required')
      }

      const itemType = type ?? 'prompt'
      // Req 1: prompt 类型可以没有 promptId（自建卡片），但此时 override 必填（service 层校验）
      if (itemType === 'sop_doc' && !sopDocumentId) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'sopDocumentId is required for sop_doc type')
      }

      const result = await boardService.addSelection(req.params.id, req.user!.userId, {
        type: itemType,
        promptId,
        sopDocumentId,
        content,
        color,
        size,
        position,
        note,
        assigneeId,
        layer,
        promptOverrideTitle,
        promptOverrideContent,
        promptOverrideTags,
      })

      success(res, result, 'Selection added')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/boards/:id/selections/:selId — update selection
router.put(
  '/:id/selections/:selId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        position, note, content, color, size, assigneeId, layer, assigneeInherit,
        promptOverrideTitle, promptOverrideContent, promptOverrideTags,
      } = req.body as {
        position?: { x: number; y: number }
        note?: string
        content?: string
        color?: string
        size?: { width: number; height: number }
        assigneeId?: string | null
        layer?: import('@prisma/client').SopLayer
        assigneeInherit?: boolean
        promptOverrideTitle?: string | null
        promptOverrideContent?: string | null
        promptOverrideTags?: string[]
      }

      const result = await boardService.updateSelection(
        req.params.id,
        req.params.selId,
        req.user!.userId,
        {
          position,
          note,
          content,
          color,
          size,
          assigneeId,
          layer,
          assigneeInherit,
          promptOverrideTitle,
          promptOverrideContent,
          promptOverrideTags,
        },
      )

      success(res, result, 'Selection updated')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/boards/:id/selections/:selId/fork-to-library — Req 1: 保存卡片内容到公共库
router.post(
  '/:id/selections/:selId/fork-to-library',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, visibility, category } = req.body as {
        name?: string
        visibility?: 'private' | 'team' | 'public'
        category?: string
      }
      const result = await boardService.forkSelectionToLibrary(
        req.params.id,
        req.params.selId,
        req.user!.userId,
        req.user!.role,
        { name, visibility, category },
      )
      success(res, result, '已保存到公共提示词库')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/boards/:id/selections/:selId/complete — 卡片指派人确认完成
router.post(
  '/:id/selections/:selId/complete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await boardService.completeSelection(
        req.params.id,
        req.params.selId,
        req.user!.userId,
        req.user!.role,
      )
      success(res, result, '已标记完成')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/boards/:id/selections/:selId/reopen — 撤回完成状态
router.post(
  '/:id/selections/:selId/reopen',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { note } = req.body as { note?: string }
      const result = await boardService.reopenSelection(
        req.params.id,
        req.params.selId,
        req.user!.userId,
        req.user!.role,
        note,
      )
      success(res, result, '已撤回完成状态')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/boards/:id/selections/:selId/activity — 查询卡片审计日志（Fix P2-8）
router.get(
  '/:id/selections/:selId/activity',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limitRaw = req.query.limit as string | undefined
      const limit = limitRaw ? parseInt(limitRaw, 10) || 50 : 50
      const result = await boardService.listSelectionActivities(
        req.params.id,
        req.params.selId,
        limit,
      )
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/boards/:id/selections/:selId — remove selection
router.delete(
  '/:id/selections/:selId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await boardService.removeSelection(req.params.id, req.params.selId)
      success(res, null, 'Selection removed')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/boards/:id/export — export board as feed package config
router.post(
  '/:id/export',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await boardService.exportBoard(req.params.id)
      success(res, result, 'Board exported')
    } catch (err) {
      next(err)
    }
  },
)

// ========================================================================
// Phase 5.3: Layer 负责人管理
// ========================================================================

// GET /api/v1/boards/:id/layer-assignments — 列出 8 个 layer 的负责人
router.get(
  '/:id/layer-assignments',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await boardService.listLayerAssignments(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/boards/:id/layer-assignments — 指派/改换/清空某 layer 负责人
//   权限：ARCHITECT / ADMIN
//   body: { layer: SopLayer, assigneeId: string | null }
router.post(
  '/:id/layer-assignments',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { layer, assigneeId } = req.body as {
        layer?: import('@prisma/client').SopLayer
        assigneeId?: string | null
      }
      if (!layer) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'layer 必填')
      }
      const result = await boardService.upsertLayerAssignment(
        req.params.id,
        layer,
        assigneeId ?? null,
        req.user!.userId,
        req.user!.role,
      )
      success(res, result, '已更新 layer 负责人')
    } catch (err) {
      next(err)
    }
  },
)

export default router
