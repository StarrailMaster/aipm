import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as promptService from '../../services/prompt'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/prompts — list
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const keyword = req.query.keyword as string | undefined
      const category = req.query.category as string | undefined
      const visibility = req.query.visibility as string | undefined
      const sort = req.query.sort as string | undefined
      const tagsRaw = req.query.tags as string | undefined
      const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : undefined

      const result = await promptService.listPrompts({
        page,
        pageSize,
        skip,
        keyword,
        category,
        tags,
        visibility,
        sort,
        userId: req.user!.userId,
        userRole: req.user!.role,
      })

      paginate(res, result.items, result.total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/prompts — create
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, category, tags, content, visibility, dependsOn, requiredSopLayers } = req.body as {
        name?: string
        description?: string
        category?: string
        tags?: string[]
        content?: string
        visibility?: string
        dependsOn?: string[]
        requiredSopLayers?: string[]
      }

      if (!name || !category || !content) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'name, category, and content are required')
      }

      const result = await promptService.createPrompt(req.user!.userId, {
        name,
        description,
        category,
        tags,
        content,
        visibility,
        dependsOn,
        requiredSopLayers,
      })

      success(res, result, 'Prompt created')
    } catch (err) {
      next(err)
    }
  },
)

// ===== PR routes (must be BEFORE /:id to avoid conflict) =====

// GET /api/v1/prompts/prs/mine — PRs I submitted (for "我的反馈" tab)
router.get(
  '/prs/mine',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const statusRaw = req.query.status as string | undefined
      const status =
        statusRaw === 'OPEN' || statusRaw === 'MERGED' || statusRaw === 'REJECTED'
          ? statusRaw
          : undefined
      const result = await promptService.listMyPrs(req.user!.userId, { status })
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/prompts/prs/to-review — open PRs on my prompts (for "需要审核" tab)
router.get(
  '/prs/to-review',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await promptService.listPrsToReview(req.user!.userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/prompts/prs/:prId/review — review PR
router.put(
  '/prs/:prId/review',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { action, comment } = req.body as {
        action?: 'merge' | 'reject'
        comment?: string
      }

      if (!action || (action !== 'merge' && action !== 'reject')) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'action must be "merge" or "reject"')
      }

      const result = await promptService.reviewPr(req.params.prId, req.user!.userId, {
        action,
        comment,
      })

      success(res, result, `PR ${action}ed`)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/prompts/prs/:prId — get PR detail
router.get(
  '/prs/:prId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await promptService.getPrDetail(req.params.prId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// ===== Prompt resource routes =====

// GET /api/v1/prompts/:id — detail
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await promptService.getPromptDetail(req.params.id, req.user!.userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/prompts/:id — update
router.put(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, category, tags, content, dependsOn } = req.body as {
        name?: string
        description?: string
        category?: string
        tags?: string[]
        content?: string
        dependsOn?: string[]
      }

      const result = await promptService.updatePrompt(req.params.id, req.user!.userId, {
        name,
        description,
        category,
        tags,
        content,
        dependsOn,
      })

      success(res, result, 'Prompt updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/prompts/:id — soft delete
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await promptService.deletePrompt(req.params.id, req.user!.userId)
      success(res, null, 'Prompt deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/prompts/:id/star — toggle star
router.post(
  '/:id/star',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await promptService.toggleStar(req.params.id, req.user!.userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/prompts/:id/fork — fork
router.post(
  '/:id/fork',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body as { name?: string }
      const result = await promptService.forkPrompt(req.params.id, req.user!.userId, name)
      success(res, result, 'Prompt forked')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/prompts/:id/versions — version history
router.get(
  '/:id/versions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await promptService.getVersionHistory(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/prompts/:id/pr — submit PR
router.post(
  '/:id/pr',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, newContent } = req.body as {
        title?: string
        description?: string
        newContent?: string
      }

      if (!title || !description || !newContent) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'title, description, and newContent are required')
      }

      const result = await promptService.createPr(req.params.id, req.user!.userId, {
        title,
        description,
        newContent,
      })

      success(res, result, 'PR submitted')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/prompts/:id/prs — list PRs
router.get(
  '/:id/prs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await promptService.listPrs(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
