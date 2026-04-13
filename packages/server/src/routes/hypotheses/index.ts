import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as hypothesisService from '../../services/hypothesis'
import { closeHypothesis } from '../../services/hypothesis/close'
import * as variantsService from '../../services/hypothesis/variants'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'
import type {
  HypothesisStatus as PrismaHypothesisStatus,
  ResultConclusion as PrismaResultConclusion,
  VariantStatus as PrismaVariantStatus,
} from '@prisma/client'

const router: Router = Router()
router.use(authMiddleware)

const VALID_STATUSES: PrismaHypothesisStatus[] = [
  'BACKLOG',
  'RUNNING',
  'CLOSED_WIN',
  'CLOSED_LOSS',
  'CLOSED_FLAT',
  'ABANDONED',
]

// GET /api/v1/hypotheses
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize, skip } = parsePagination(
      req.query as Record<string, unknown>,
    )
    const krId = req.query.krId as string | undefined
    const ownerId = req.query.ownerId as string | undefined
    const mine = req.query.mine === 'true' || req.query.mine === '1'
    const sortBy = (req.query.sortBy as
      | 'createdAt'
      | 'closedAt'
      | 'iceScore'
      | 'riceScore'
      | 'updatedAt'
      | undefined) ?? 'createdAt'
    const order =
      (req.query.order as 'asc' | 'desc' | undefined) ?? 'desc'

    let status: PrismaHypothesisStatus | PrismaHypothesisStatus[] | undefined
    if (req.query.status) {
      const raw = String(req.query.status)
      const parts = raw.split(',').map((s) => s.trim()) as PrismaHypothesisStatus[]
      for (const p of parts) {
        if (!VALID_STATUSES.includes(p)) {
          throw new AppError(
            ErrorCodes.INVALID_FORMAT,
            `status 非法: ${p}`,
          )
        }
      }
      status = parts.length === 1 ? parts[0] : parts
    }

    const result = await hypothesisService.listHypotheses({
      page,
      pageSize,
      skip,
      krId,
      status,
      ownerId,
      mine,
      userId: req.user!.userId,
      sortBy,
      order,
    })
    paginate(res, result.items, result.total, page, pageSize)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/hypotheses
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      krId,
      parentId,
      statement,
      mechanism,
      expectedImpact,
      expectedImpactValue,
      expectedImpactUnit,
      templateId,
      iceImpact,
      iceConfidence,
      iceEase,
      riceReach,
      riceImpact,
      riceConfidence,
      riceEffort,
    } = req.body as {
      krId?: string
      parentId?: string | null
      statement?: string
      mechanism?: string
      expectedImpact?: string
      expectedImpactValue?: number
      expectedImpactUnit?: string
      templateId?: string | null
      iceImpact?: number
      iceConfidence?: number
      iceEase?: number
      riceReach?: number
      riceImpact?: number
      riceConfidence?: number
      riceEffort?: number
    }

    if (!krId || !statement || !mechanism || !expectedImpact) {
      throw new AppError(
        ErrorCodes.MISSING_REQUIRED_FIELD,
        'krId, statement, mechanism, expectedImpact 必填',
      )
    }
    if (statement.length > 2000) {
      throw new AppError(ErrorCodes.INVALID_FORMAT, 'statement 不能超过 2000 字符')
    }
    if (mechanism.length > 2000) {
      throw new AppError(ErrorCodes.INVALID_FORMAT, 'mechanism 不能超过 2000 字符')
    }

    const result = await hypothesisService.createHypothesis(
      {
        krId,
        parentId: parentId ?? null,
        statement,
        mechanism,
        expectedImpact,
        expectedImpactValue,
        expectedImpactUnit,
        templateId: templateId ?? null,
        iceImpact,
        iceConfidence,
        iceEase,
        riceReach,
        riceImpact,
        riceConfidence,
        riceEffort,
      },
      req.user!.userId,
    )
    success(res, result, 'Hypothesis created')
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/hypotheses/:id/iterations — Phase B.1
router.post(
  '/:id/iterations',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, squadId, name } = req.body as {
        projectId?: string
        squadId?: string
        name?: string
      }
      const result = await hypothesisService.createIterationForHypothesis(
        req.params.id,
        { projectId, squadId, name },
        req.user!.userId,
      )
      success(res, result, '执行任务已创建')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/hypotheses/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await hypothesisService.getHypothesisDetail(req.params.id)
    success(res, result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/hypotheses/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      statement,
      mechanism,
      expectedImpact,
      expectedImpactValue,
      expectedImpactUnit,
      status,
    } = req.body as {
      statement?: string
      mechanism?: string
      expectedImpact?: string
      expectedImpactValue?: number
      expectedImpactUnit?: string
      status?: 'BACKLOG' | 'RUNNING' | 'ABANDONED'
    }

    const result = await hypothesisService.updateHypothesis(
      req.params.id,
      {
        statement,
        mechanism,
        expectedImpact,
        expectedImpactValue,
        expectedImpactUnit,
        status,
      },
      { userId: req.user!.userId, role: req.user!.role },
    )
    success(res, result, '已更新')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/hypotheses/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await hypothesisService.deleteHypothesis(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    })
    success(res, null, '已删除')
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/hypotheses/:id/scoring/ice — G9
router.put(
  '/:id/scoring/ice',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { iceImpact, iceConfidence, iceEase } = req.body as {
        iceImpact?: number
        iceConfidence?: number
        iceEase?: number
      }
      if (
        iceImpact === undefined ||
        iceConfidence === undefined ||
        iceEase === undefined
      ) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'iceImpact, iceConfidence, iceEase 必填',
        )
      }
      const result = await hypothesisService.updateIceScoring(
        req.params.id,
        { iceImpact, iceConfidence, iceEase },
        { userId: req.user!.userId, role: req.user!.role },
      )
      success(res, result, 'ICE 打分已更新')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/hypotheses/:id/scoring/rice — G9
router.put(
  '/:id/scoring/rice',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { riceReach, riceImpact, riceConfidence, riceEffort } =
        req.body as {
          riceReach?: number
          riceImpact?: number
          riceConfidence?: number
          riceEffort?: number
        }
      if (
        riceReach === undefined ||
        riceImpact === undefined ||
        riceConfidence === undefined ||
        riceEffort === undefined
      ) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'riceReach, riceImpact, riceConfidence, riceEffort 必填',
        )
      }
      const result = await hypothesisService.updateRiceScoring(
        req.params.id,
        { riceReach, riceImpact, riceConfidence, riceEffort },
        { userId: req.user!.userId, role: req.user!.role },
      )
      success(res, result, 'RICE 打分已更新')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/hypotheses/:id/tree — G11 parent chain tree
router.get(
  '/:id/tree',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await hypothesisService.getHypothesisTree(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// ============================================================
// Close hypothesis (核心动作)
// ============================================================

// POST /api/v1/hypotheses/:id/close
router.post('/:id/close', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      metricType,
      metricName,
      baseline,
      actual,
      unit,
      conclusion,
      humanNote,
    } = req.body as {
      metricType?: string
      metricName?: string
      baseline?: number
      actual?: number
      unit?: string
      conclusion?: PrismaResultConclusion
      humanNote?: string
    }
    if (
      !metricType ||
      !metricName ||
      baseline === undefined ||
      actual === undefined ||
      !conclusion
    ) {
      throw new AppError(
        ErrorCodes.MISSING_REQUIRED_FIELD,
        'metricType, metricName, baseline, actual, conclusion 必填',
      )
    }
    if (typeof baseline !== 'number' || typeof actual !== 'number') {
      throw new AppError(
        ErrorCodes.INVALID_FORMAT,
        'baseline 和 actual 必须是数字',
      )
    }
    const result = await closeHypothesis(
      req.params.id,
      { metricType, metricName, baseline, actual, unit, conclusion, humanNote },
      { userId: req.user!.userId, role: req.user!.role },
    )
    success(res, result, '已关闭')
  } catch (err) {
    next(err)
  }
})

// ============================================================
// Variants (G7 A/B testing)
// ============================================================

// GET /api/v1/hypotheses/:id/variants
router.get(
  '/:id/variants',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await variantsService.listVariants(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/hypotheses/:id/variants
router.post(
  '/:id/variants',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, type } = req.body as {
        name?: string
        description?: string
        type?: PrismaVariantStatus
      }
      if (!name) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'name 必填')
      }
      const result = await variantsService.createVariant(
        req.params.id,
        { name, description, type },
        { userId: req.user!.userId, role: req.user!.role },
      )
      success(res, result, '变体已创建')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/hypotheses/:id/variants/:variantId/results
router.put(
  '/:id/variants/:variantId/results',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sampleSize, conversionCount, metricValue, metricUnit } = req.body as {
        sampleSize?: number
        conversionCount?: number
        metricValue?: number
        metricUnit?: string
      }
      const variants = await variantsService.updateVariantResults(
        req.params.id,
        req.params.variantId,
        { sampleSize, conversionCount, metricValue, metricUnit },
        { userId: req.user!.userId, role: req.user!.role },
      )
      success(res, { variants }, '数据已更新 + 显著性已重算')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/hypotheses/:id/variants/:variantId/mark-winner?force=true
router.post(
  '/:id/variants/:variantId/mark-winner',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const force = req.query.force === 'true' || req.query.force === '1'
      const result = await variantsService.markVariantAsWinner(
        req.params.id,
        req.params.variantId,
        { force },
        { userId: req.user!.userId, role: req.user!.role },
      )
      success(res, result, '已标记胜出')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/hypotheses/:id/variants/:variantId
router.delete(
  '/:id/variants/:variantId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await variantsService.deleteVariant(req.params.id, req.params.variantId, {
        userId: req.user!.userId,
        role: req.user!.role,
      })
      success(res, null, '已删除')
    } catch (err) {
      next(err)
    }
  },
)

export default router
