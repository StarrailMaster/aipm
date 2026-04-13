import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import * as orgService from '../../services/org'
import { success, paginate, parsePagination } from '../../utils/response'
import { AppError, ErrorCodes } from '../../utils/errors'

const router: Router = Router()

// All org routes require authentication
router.use(authMiddleware)

// ========== Projects ==========

// GET /api/v1/projects
// Query params:
//   - page, pageSize：分页
//   - mine=true：只返回当前用户能看到的项目（owner 或同 squad）；ADMIN 忽略该筛选
router.get(
  '/projects',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = parsePagination(req.query as Record<string, unknown>)
      const mine = req.query.mine === 'true' || req.query.mine === '1'
      const { items, total } = await orgService.listProjects({
        ...pagination,
        mine,
        userId: req.user?.userId,
        userRole: req.user?.role,
      })
      paginate(res, items, total, pagination.page, pagination.pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/projects — ADMIN/ARCHITECT only
router.post(
  '/projects',
  requireRole('ADMIN', 'ARCHITECT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, ownerId } = req.body as {
        name?: string
        description?: string
        ownerId?: string
      }

      if (!name) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'name is required')
      }

      const project = await orgService.createProject({
        name,
        description,
        // 未指定则默认为创建人
        ownerId: ownerId ?? req.user!.userId,
      })
      success(res, project, 'Project created')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/projects/:id
router.get(
  '/projects/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const project = await orgService.getProject(req.params.id)
      success(res, project)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/projects/:id
router.put(
  '/projects/:id',
  requireRole('ADMIN', 'ARCHITECT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, ownerId } = req.body as {
        name?: string
        description?: string
        ownerId?: string
      }
      const project = await orgService.updateProject(req.params.id, {
        name,
        description,
        ownerId,
      })
      success(res, project, 'Project updated')
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/v1/projects/:id — ADMIN only
router.delete(
  '/projects/:id',
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await orgService.deleteProject(req.params.id)
      success(res, null, 'Project deleted')
    } catch (err) {
      next(err)
    }
  },
)

// ========== Users ==========

// GET /api/v1/users
router.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = parsePagination(req.query as Record<string, unknown>)
      const { keyword, role, squadId, projectId } = req.query as {
        keyword?: string
        role?: string
        squadId?: string
        projectId?: string
      }

      const { items, total } = await orgService.listUsers({
        ...pagination,
        keyword,
        role,
        squadId,
        projectId,
      })
      paginate(res, items, total, pagination.page, pagination.pageSize)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/users — ADMIN only，创建新成员
// 公开注册默认关闭（Sec-1），所以这是管理员添加新成员的唯一 UI 入口
router.post(
  '/users',
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, name, role, squadId, legacyRoles } = req.body as {
        email?: string
        password?: string
        name?: string
        role?: string
        squadId?: string | null
        legacyRoles?: string[]
      }

      if (!email || !password || !name) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'email、password、name 为必填',
        )
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, '邮箱格式不正确')
      }
      if (password.length < 6) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, '密码至少 6 位')
      }
      if (name.length > 40) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, '姓名最多 40 个字符')
      }
      const validRoles = ['ADMIN', 'ARCHITECT', 'ENGINEER', 'DESIGNER']
      if (role && !validRoles.includes(role)) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, `role 必须为 ${validRoles.join('/')}`)
      }

      const user = await orgService.createUser({
        email,
        password,
        name,
        role: role ?? 'DESIGNER',
        squadId: squadId ?? null,
        legacyRoles: legacyRoles ?? [],
      })
      success(res, user, '用户已创建')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/users/:id
router.get(
  '/users/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await orgService.getUser(req.params.id)
      success(res, user)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/users/:id — ADMIN only
router.put(
  '/users/:id',
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, role, legacyRoles, squadId } = req.body as {
        name?: string
        role?: string
        legacyRoles?: string[]
        squadId?: string | null
      }

      const user = await orgService.updateUser(req.params.id, {
        name,
        role,
        legacyRoles,
        squadId,
      })
      success(res, user, 'User updated')
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/users/:id/legacy-roles
router.put(
  '/users/:id/legacy-roles',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { legacyRoles } = req.body as { legacyRoles?: string[] }

      if (!legacyRoles || !Array.isArray(legacyRoles)) {
        throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, 'legacyRoles array is required')
      }

      const user = await orgService.updateUserLegacyRoles(req.params.id, legacyRoles)
      success(res, user, 'Legacy roles updated')
    } catch (err) {
      next(err)
    }
  },
)

export default router
