import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import * as feedbackService from '../../services/feedback'
import * as warehouseService from '../../services/warehouse'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/feedback — list feedbacks
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const status = req.query.status as string | undefined
      const promptId = req.query.promptId as string | undefined
      const submittedBy = req.query.submittedBy as string | undefined

      const result = await feedbackService.listFeedbacks({
        page,
        pageSize,
        skip,
        status,
        promptId,
        submittedBy,
      })

      paginate(res, result.items, result.total, page, pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feedback — submit feedback
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rawDescription, attachments, iterationId, feedPackageId } = req.body as {
        rawDescription?: string
        attachments?: string[]
        iterationId?: string
        feedPackageId?: string
      }

      if (!rawDescription) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'rawDescription is required')
      }

      const result = await feedbackService.submitFeedback(req.user!.userId, {
        rawDescription,
        attachments,
        iterationId,
        feedPackageId,
      })

      success(res, result, 'Feedback submitted')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/feedback/:id — get feedback detail
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedbackService.getFeedbackDetail(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/feedback/:id — soft delete
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await feedbackService.deleteFeedback(req.params.id)
      success(res, null, 'Feedback deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feedback/:id/ai-summary — trigger AI summary (mock)
router.post(
  '/:id/ai-summary',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await feedbackService.triggerAiSummary(req.params.id)
      success(res, result, 'AI summary generated')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feedback/:id/confirm — confirm AI summary (with optional overrides)
router.post(
  '/:id/confirm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { problemCategory, relatedPromptId, problemSummary, suggestedConstraint } = req.body as {
        problemCategory?: string
        relatedPromptId?: string
        problemSummary?: string
        suggestedConstraint?: string
      }

      const result = await feedbackService.confirmAiSummary(req.params.id, {
        problemCategory,
        relatedPromptId,
        problemSummary,
        suggestedConstraint,
      })

      // Auto-trigger warehouse agent after confirmation
      try {
        await warehouseService.processWarehouse(req.params.id)
      } catch {
        // Warehouse agent failure is non-blocking
      }

      // Re-fetch after warehouse processing
      const updated = await feedbackService.getFeedbackDetail(req.params.id)
      success(res, updated, 'AI summary confirmed')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/feedback/:id/review — architect review (merge/reject)
router.post(
  '/:id/review',
  requireRole('ARCHITECT', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { action, comment } = req.body as {
        action?: string
        comment?: string
      }

      if (!action || (action !== 'merge' && action !== 'reject')) {
        throw new AppError(
          ErrorCodes.INVALID_FORMAT,
          'action must be "merge" or "reject"',
        )
      }

      const result = await feedbackService.reviewFeedback(
        req.params.id,
        req.user!.userId,
        action,
        comment,
      )

      success(res, result, action === 'merge' ? 'Feedback merged' : 'Feedback rejected')
    } catch (err) {
      next(err)
    }
  },
)

export default router
