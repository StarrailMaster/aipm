import type { Request, Response, NextFunction } from 'express'
import { AppError, ErrorCodes } from '../utils/errors'

// Role hierarchy: ADMIN > ARCHITECT > ENGINEER > DESIGNER
const ROLE_HIERARCHY: Record<string, number> = {
  ADMIN: 4,
  ARCHITECT: 3,
  ENGINEER: 2,
  DESIGNER: 1,
}

/**
 * Require that the authenticated user has at least one of the specified roles,
 * or a role with higher privilege in the hierarchy.
 *
 * Usage:
 *   router.get('/admin/users', requireRole('ADMIN'), handler)
 *   router.post('/prompts', requireRole('ARCHITECT', 'ENGINEER'), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(ErrorCodes.NOT_AUTHENTICATED, 'Authentication required', 401)
    }

    const userRole = req.user.role
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0

    // Find the minimum required level among allowed roles
    const minRequiredLevel = Math.min(
      ...allowedRoles.map((role) => ROLE_HIERARCHY[role] ?? Infinity),
    )

    if (userLevel >= minRequiredLevel) {
      next()
      return
    }

    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      `Insufficient permissions. Required: ${allowedRoles.join(' or ')}`,
      403,
    )
  }
}
