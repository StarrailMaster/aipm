import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import * as okrService from '../../services/okr'
import { success } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All routes require auth
router.use(authMiddleware)

// GET /api/v1/okr?projectId=xxx — List objectives with key results
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const projectId = req.query.projectId as string | undefined

      if (!projectId) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'projectId is required')
      }

      const result = await okrService.listObjectives(projectId)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/okr/objectives — Create objective
router.post(
  '/objectives',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, name, description, squadId } = req.body as {
        projectId?: string
        name?: string
        description?: string
        squadId?: string
      }

      if (!projectId || !name) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'projectId and name are required')
      }

      const result = await okrService.createObjective(req.user!.userId, {
        projectId,
        name,
        description,
        squadId,
      })

      success(res, result, 'Objective created')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/okr/objectives/:id — Update objective
router.put(
  '/objectives/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, squadId } = req.body as {
        name?: string
        description?: string
        squadId?: string
      }

      const result = await okrService.updateObjective(req.params.id, {
        name,
        description,
        squadId,
      })

      success(res, result, 'Objective updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/okr/objectives/:id — Soft delete
router.delete(
  '/objectives/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await okrService.deleteObjective(req.params.id)
      success(res, null, 'Objective deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/okr/key-results — Create key result
router.post(
  '/key-results',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { objectiveId, name, targetValue, unit } = req.body as {
        objectiveId?: string
        name?: string
        targetValue?: number
        unit?: string
      }

      if (!objectiveId || !name || targetValue === undefined || !unit) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'objectiveId, name, targetValue, and unit are required',
        )
      }

      const result = await okrService.createKeyResult({
        objectiveId,
        name,
        targetValue,
        unit,
      })

      success(res, result, 'Key result created')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/okr/key-results/:id — Phase E.1: KR detail with hypotheses
router.get(
  '/key-results/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await okrService.getKeyResultDetail(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/okr/key-results/:id — Update key result
router.put(
  '/key-results/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, targetValue, unit } = req.body as {
        name?: string
        targetValue?: number
        unit?: string
      }

      const result = await okrService.updateKeyResult(req.params.id, {
        name,
        targetValue,
        unit,
      })

      success(res, result, 'Key result updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/okr/key-results/:id — Delete key result
router.delete(
  '/key-results/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await okrService.deleteKeyResult(req.params.id)
      success(res, null, 'Key result deleted')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/okr/key-results/:id/record — Record iteration data
router.post(
  '/key-results/:id/record',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { changes, dataFeedback } = req.body as {
        changes?: string
        dataFeedback?: number
      }

      if (!changes || dataFeedback === undefined) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'changes and dataFeedback are required',
        )
      }

      const result = await okrService.recordIteration(req.user!.userId, {
        keyResultId: req.params.id,
        changes,
        dataFeedback,
      })

      success(res, result, 'Iteration recorded')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/okr/key-results/:id/iterations — Get iteration history
router.get(
  '/key-results/:id/iterations',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await okrService.getIterationHistory(req.params.id)
      success(res, result)
    } catch (err) {
      next(err)
    }
  },
)

export default router
