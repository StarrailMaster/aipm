import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as skillService from '../../services/skill'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/skills — list
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const keyword = req.query.keyword as string | undefined
      const category = req.query.category as string | undefined
      const sort = req.query.sort as string | undefined

      const result = await skillService.listSkills({
        page,
        pageSize,
        skip,
        keyword,
        category,
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

// POST /api/v1/skills — create
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, category, tags, content, gitRepoUrl, visibility } = req.body as {
        name?: string
        description?: string
        category?: string
        tags?: string[]
        content?: string
        gitRepoUrl?: string
        visibility?: string
      }

      if (!name || !category || !content) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'name, category, and content are required')
      }

      const result = await skillService.createSkill(req.user!.userId, {
        name,
        description,
        category,
        tags,
        content,
        gitRepoUrl,
        visibility,
      })

      success(res, result, 'Skill created')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/skills/:id — detail
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await skillService.getSkillDetail(req.params.id, req.user!.userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/skills/:id — update
router.put(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, category, tags, content, gitRepoUrl } = req.body as {
        name?: string
        description?: string
        category?: string
        tags?: string[]
        content?: string
        gitRepoUrl?: string
      }

      const result = await skillService.updateSkill(req.params.id, req.user!.userId, {
        name,
        description,
        category,
        tags,
        content,
        gitRepoUrl,
      })

      success(res, result, 'Skill updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/skills/:id — soft delete
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await skillService.deleteSkill(req.params.id, req.user!.userId)
      success(res, null, 'Skill deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/skills/:id/star — toggle star
router.post(
  '/:id/star',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await skillService.toggleStar(req.params.id, req.user!.userId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/skills/:id/fork — fork
router.post(
  '/:id/fork',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body as { name?: string }
      const result = await skillService.forkSkill(req.params.id, req.user!.userId, name)
      success(res, result, 'Skill forked')
    } catch (err) {
      next(err)
    }
  },
)

export default router
