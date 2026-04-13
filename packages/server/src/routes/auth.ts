import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { authMiddleware } from '../middleware/auth'
import * as authService from '../services/auth.service'
import { success } from '../utils/response'
import { AppError, ErrorCodes } from '../utils/errors'

const router: Router = Router()

// POST /api/v1/auth/register
//
// Sec-1 安全修复：默认关闭公开注册。新成员必须由管理员在"用户管理"页创建，
// 或通过设置 REGISTER_OPEN=true 暂时放开（不推荐）。
//
// 对 400 人内部工具来说，开放注册等于把扫到域名的外部人变成 DESIGNER 角色
// 直接进入审核队列，属于严重安全洞。
router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.REGISTER_OPEN !== 'true') {
        throw new AppError(
          ErrorCodes.PERMISSION_DENIED,
          '公开注册已关闭。请联系管理员开通账号。',
          403,
        )
      }

      const { email, password, name } = req.body as {
        email?: string
        password?: string
        name?: string
      }

      if (!email || !password || !name) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'email, password, and name are required',
        )
      }

      // Basic email format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, 'Invalid email format')
      }

      if (password.length < 6) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, 'Password must be at least 6 characters')
      }

      // Sec-4: name 长度上限，避免 DB 膨胀 / UI 渲染对齐错乱
      if (name.length > 40) {
        throw new AppError(ErrorCodes.INVALID_FORMAT, '姓名最多 40 个字符')
      }

      const result = await authService.register(email, password, name)
      success(res, result, 'Registration successful')
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/v1/auth/login
router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as {
        email?: string
        password?: string
      }

      if (!email || !password) {
        throw new AppError(
          ErrorCodes.MISSING_REQUIRED_FIELD,
          'email and password are required',
        )
      }

      const result = await authService.login(email, password)
      success(res, result, 'Login successful')
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/v1/auth/me
router.get(
  '/me',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId
      const user = await authService.getMe(userId)
      success(res, user)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/v1/auth/me
router.put(
  '/me',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId
      const { name, avatar, legacyRoles } = req.body as {
        name?: string
        avatar?: string
        legacyRoles?: string[]
      }
      const user = await authService.updateMe(userId, { name, avatar, legacyRoles })
      success(res, user, 'Profile updated')
    } catch (err) {
      next(err)
    }
  },
)

export default router
