import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as experienceService from '../../services/experience'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/experience/feedbacks — list feedbacks
router.get(
  '/feedbacks',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(
        req.query as Record<string, unknown>,
      )
      const createdBy = req.query.createdBy as string | undefined
      const linkedPromptId = req.query.linkedPromptId as string | undefined

      const result = await experienceService.listFeedbacks({
        page,
        pageSize,
        skip,
        createdBy,
        linkedPromptId,
      })

      paginate(res, result.items, result.total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/experience/feedbacks — create experience feedback
router.post(
  '/feedbacks',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { problemDescription, markdownContent, markdownFileName, linkedPromptId } =
        req.body as {
          problemDescription?: string
          markdownContent?: string | null
          markdownFileName?: string | null
          linkedPromptId?: string | null
        }

      if (!problemDescription || !problemDescription.trim()) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'problemDescription is required',
        )
      }

      const result = await experienceService.createFeedback(req.user!.userId, {
        problemDescription,
        markdownContent: markdownContent ?? null,
        markdownFileName: markdownFileName ?? null,
        linkedPromptId: linkedPromptId ?? null,
      })

      success(res, result, 'Experience feedback submitted')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/experience/feedbacks/:id — get experience feedback detail
router.get(
  '/feedbacks/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await experienceService.getFeedbackDetail(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/experience/feedbacks/:id — soft delete
router.delete(
  '/feedbacks/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await experienceService.deleteFeedback(req.params.id)
      success(res, null, 'Experience feedback deleted')
    } catch (err) {
      next(err)
    }
  },
)

export default router
