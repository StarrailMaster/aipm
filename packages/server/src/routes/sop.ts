import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import * as sopService from '../services/sop.service'
import { success, paginate, parsePagination } from '../utils/response'
import { AppError, ErrorCodes } from '../utils/errors'
import type { SopLayer } from '@prisma/client'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/sop — list SOP projects (shared templates)
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, skip } = parsePagination(req.query as Record<string, unknown>)
      const keyword = req.query.keyword as string | undefined
      const visibilityRaw = req.query.visibility as string | undefined
      const visibility =
        visibilityRaw === 'private' || visibilityRaw === 'team' || visibilityRaw === 'public'
          ? visibilityRaw
          : undefined

      const result = await sopService.listSopProjects({
        page,
        pageSize,
        skip,
        keyword,
        visibility,
        userId: req.user!.userId,
        userRole: req.user!.role,
      })

      paginate(res, result.items, result.total, result.page, result.pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/sop — create SOP project (Req 7: no longer tied to a project)
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, visibility } = req.body as {
        name?: string
        description?: string
        visibility?: 'private' | 'team' | 'public'
      }

      if (!name) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'name is required')
      }

      const result = await sopService.createSopProject({
        name,
        description,
        visibility,
        userId: req.user!.userId,
      })

      success(res, result, 'SOP project created')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/sop/:id — get SOP project detail with documents and prompt refs
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sopService.getSopProject(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/sop/:id — update SOP project
router.put(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, visibility, version } = req.body as {
        name?: string
        description?: string
        visibility?: 'private' | 'team' | 'public'
        version?: string
      }

      const result = await sopService.updateSopProject(
        req.params.id,
        { name, description, visibility, version },
        req.user!.userId,
        req.user!.role,
      )

      success(res, result, 'SOP project updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/sop/:id — soft delete
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sopService.deleteSopProject(req.params.id, req.user!.userId, req.user!.role)
      success(res, null, 'SOP project deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/sop/:id/documents — create document (optionally with initial prompt refs)
router.post(
  '/:id/documents',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { layer, title, description, tags, promptIds } = req.body as {
        layer?: SopLayer
        title?: string
        description?: string
        tags?: string[]
        promptIds?: string[]
      }

      if (!layer || !title) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'layer and title are required')
      }

      const validLayers: SopLayer[] = [
        'PRODUCT_REQ', 'CONTENT', 'DESIGN_SYSTEM', 'FRONTEND_ARCH',
        'BACKEND_ARCH', 'AI_PROMPTS', 'ACCEPTANCE', 'APPENDIX',
      ]
      if (!validLayers.includes(layer)) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, `Invalid layer: ${layer}`)
      }

      const result = await sopService.createSopDocument({
        sopProjectId: req.params.id,
        layer,
        title,
        description,
        tags,
        promptIds,
        userId: req.user!.userId,
      })

      success(res, result, 'Document created')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/sop/documents/:docId — update document metadata (title/description/tags)
router.put(
  '/documents/:docId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, tags } = req.body as {
        title?: string
        description?: string
        tags?: string[]
      }

      const result = await sopService.updateSopDocument(
        req.params.docId,
        { title, description, tags },
        req.user!.userId,
        req.user!.role,
      )

      success(res, result, 'Document updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/sop/documents/:docId — soft delete document
router.delete(
  '/documents/:docId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sopService.deleteSopDocument(
        req.params.docId,
        req.user!.userId,
        req.user!.role,
      )
      success(res, null, 'Document deleted')
    } catch (err) {
      next(err)
    }
  },
)

// ========================================================================
// Prompt Reference Management (Req 7: SOP as prompt composition)
// ========================================================================

// POST /api/v1/sop/documents/:docId/prompts — add a prompt reference
router.post(
  '/documents/:docId/prompts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { promptId, note } = req.body as {
        promptId?: string
        note?: string
      }
      if (!promptId) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'promptId is required')
      }
      const result = await sopService.addPromptToDocument(
        req.params.docId,
        promptId,
        note ?? null,
        req.user!.userId,
        req.user!.role,
      )
      success(res, result, 'Prompt added to document')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/sop/documents/:docId/prompts/:refId — update a reference (sortOrder/note)
router.put(
  '/documents/:docId/prompts/:refId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sortOrder, note } = req.body as {
        sortOrder?: number
        note?: string | null
      }
      const result = await sopService.updatePromptRef(
        req.params.docId,
        req.params.refId,
        { sortOrder, note },
        req.user!.userId,
        req.user!.role,
      )
      success(res, result, 'Reference updated')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/sop/documents/:docId/prompts/reorder — batch reorder
router.post(
  '/documents/:docId/prompts/reorder',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderedRefIds } = req.body as { orderedRefIds?: string[] }
      if (!Array.isArray(orderedRefIds)) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'orderedRefIds array is required')
      }
      await sopService.reorderPromptRefs(
        req.params.docId,
        orderedRefIds,
        req.user!.userId,
        req.user!.role,
      )
      success(res, null, 'Order updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/sop/documents/:docId/prompts/:refId — remove a reference
router.delete(
  '/documents/:docId/prompts/:refId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sopService.removePromptRef(
        req.params.docId,
        req.params.refId,
        req.user!.userId,
        req.user!.role,
      )
      success(res, null, 'Reference removed')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/sop/documents/:docId/versions — version history
router.get(
  '/documents/:docId/versions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sopService.getDocumentVersions(req.params.docId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/sop/documents/:docId/diff — diff between versions
router.get(
  '/documents/:docId/diff',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const oldVersion = Number(req.query.oldVersion)
      const newVersion = Number(req.query.newVersion)

      if (!oldVersion || !newVersion) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'oldVersion and newVersion query params are required',
        )
      }

      const result = await sopService.getDocumentDiff(
        req.params.docId,
        oldVersion,
        newVersion,
      )

      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
