import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as templateService from '../../services/hypothesis-template'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()
router.use(authMiddleware)

// GET /api/v1/hypothesis-templates
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize, skip } = parsePagination(
      req.query as Record<string, unknown>,
    )
    const category = req.query.category as string | undefined
    const search = req.query.search as string | undefined
    let isSystemDefault: boolean | undefined
    if (req.query.isSystemDefault === 'true') isSystemDefault = true
    if (req.query.isSystemDefault === 'false') isSystemDefault = false
    const sortBy = req.query.sortBy as 'usage' | 'createdAt' | 'updatedAt' | undefined
    const order = req.query.order as 'asc' | 'desc' | undefined

    const result = await templateService.listTemplates({
      page,
      pageSize,
      skip,
      category,
      isSystemDefault,
      search,
      sortBy,
      order,
    })
    paginate(res, result.items, result.total, page, pageSize)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/hypothesis-templates
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      nameEn,
      category,
      description,
      descriptionEn,
      statementTemplate,
      statementTemplateEn,
      mechanismTemplate,
      mechanismTemplateEn,
      suggestedMetricType,
      suggestedMetricName,
      placeholders,
    } = req.body as Record<string, unknown>
    if (
      !name ||
      !category ||
      !description ||
      !statementTemplate ||
      !mechanismTemplate ||
      !Array.isArray(placeholders)
    ) {
      throw new AppError(
        ErrorCodes.MISSING_REQUIRED_FIELD,
        'name/category/description/statementTemplate/mechanismTemplate/placeholders 必填',
      )
    }
    const result = await templateService.createTemplate(
      {
        name: String(name),
        nameEn: nameEn ? String(nameEn) : undefined,
        category: String(category),
        description: String(description),
        descriptionEn: descriptionEn ? String(descriptionEn) : undefined,
        statementTemplate: String(statementTemplate),
        statementTemplateEn: statementTemplateEn ? String(statementTemplateEn) : undefined,
        mechanismTemplate: String(mechanismTemplate),
        mechanismTemplateEn: mechanismTemplateEn ? String(mechanismTemplateEn) : undefined,
        suggestedMetricType: suggestedMetricType ? String(suggestedMetricType) : undefined,
        suggestedMetricName: suggestedMetricName ? String(suggestedMetricName) : undefined,
        placeholders: placeholders as never,
      },
      req.user!.userId,
    )
    success(res, result, '模板已创建')
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/hypothesis-templates/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await templateService.getTemplate(req.params.id)
    success(res, result)
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/hypothesis-templates/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await templateService.updateTemplate(
      req.params.id,
      req.body as Parameters<typeof templateService.updateTemplate>[1],
      { userId: req.user!.userId, role: req.user!.role },
    )
    success(res, result, '模板已更新')
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/hypothesis-templates/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await templateService.deleteTemplate(req.params.id, {
      userId: req.user!.userId,
      role: req.user!.role,
    })
    success(res, null, '模板已删除')
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/hypotheses/from-template (mounted separately — see index.ts)
// 我们把它放在 hypothesis-templates router 下，避免在 hypothesis router 和 template router 之间拆
router.post(
  '/:id/create-hypothesis',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { krId, parentId, placeholderValues } = req.body as {
        krId?: string
        parentId?: string | null
        placeholderValues?: Record<string, string | number>
      }
      if (!krId || !placeholderValues) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'krId 和 placeholderValues 必填',
        )
      }
      const result = await templateService.createHypothesisFromTemplate(
        req.params.id,
        { krId, parentId: parentId ?? null, placeholderValues },
        req.user!.userId,
      )
      success(res, result, '已从模板创建假设')
    } catch (err) {
      next(err)
    }
  },
)

export default router
