import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as learningService from '../../services/learning'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'
import type { LearningSource as PrismaLearningSource } from '@prisma/client'

const router: Router = Router()
router.use(authMiddleware)

// GET /api/v1/learnings
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize, skip } = parsePagination(
      req.query as Record<string, unknown>,
    )
    const source = req.query.source as PrismaLearningSource | undefined
    const hypothesisId = req.query.hypothesisId as string | undefined
    const createdById = req.query.createdById as string | undefined
    const search = req.query.search as string | undefined

    if (source && source !== 'HUMAN' && source !== 'AI_GENERATED') {
      throw new AppError(
        ErrorCodes.INVALID_FORMAT,
        'source 必须是 HUMAN 或 AI_GENERATED',
      )
    }

    const result = await learningService.listLearnings({
      page,
      pageSize,
      skip,
      source,
      hypothesisId,
      createdById,
      search,
    })
    paginate(res, result.items, result.total, page, pageSize)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/learnings
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title,
      content,
      hypothesisId,
      linkedPromptId,
      markdownContent,
      markdownFileName,
      problemDescription,
    } = req.body as {
      title?: string
      content?: string
      hypothesisId?: string | null
      linkedPromptId?: string | null
      markdownContent?: string | null
      markdownFileName?: string | null
      problemDescription?: string | null
    }
    if (!title || !content) {
      throw new AppError(
        ErrorCodes.MISSING_REQUIRED_FIELD,
        'title 和 content 必填',
      )
    }
    const result = await learningService.createLearning(req.user!.userId, {
      title,
      content,
      hypothesisId: hypothesisId ?? null,
      linkedPromptId: linkedPromptId ?? null,
      markdownContent: markdownContent ?? null,
      markdownFileName: markdownFileName ?? null,
      problemDescription: problemDescription ?? null,
      // source 默认 HUMAN（只有 copilot 内部调用才传 AI_GENERATED）
    })
    success(res, result, '已创建')
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/learnings/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await learningService.getLearningDetail(req.params.id)
    success(res, result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/learnings/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await learningService.updateLearning(
      req.params.id,
      req.body as Parameters<typeof learningService.updateLearning>[1],
      { userId: req.user!.userId, role: req.user!.role },
    )
    success(res, result, '已更新')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/learnings/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await learningService.deleteLearning(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    })
    success(res, null, '已删除')
  } catch (err) {
    next(err)
  }
})

export default router
