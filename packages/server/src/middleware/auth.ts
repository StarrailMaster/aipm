import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError, ErrorCodes } from '../utils/errors'
import prisma from '../prisma/client'

export interface JwtPayload {
  userId: string
  role: string
  squadId: string | null
}

// Extend Express Request to carry user info
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

/**
 * Cache user-exists lookups for 30s to avoid an extra DB round-trip on every request.
 * On cache miss we verify the user row still exists — guards against stale JWTs
 * pointing at users that were deleted (e.g. after a `prisma db push --force-reset`).
 */
const userExistsCache = new Map<string, number>()
const USER_CACHE_TTL_MS = 30_000

async function verifyUserExists(userId: string): Promise<boolean> {
  const now = Date.now()
  const cached = userExistsCache.get(userId)
  if (cached && now - cached < USER_CACHE_TTL_MS) return true

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  })
  if (!user) {
    userExistsCache.delete(userId)
    return false
  }
  userExistsCache.set(userId, now)
  return true
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError(ErrorCodes.NOT_AUTHENTICATED, 'Authentication required', 401),
    )
  }

  const token = authHeader.slice(7)

  let decoded: JwtPayload
  try {
    const secret = process.env.JWT_SECRET || 'default-secret'
    decoded = jwt.verify(token, secret) as JwtPayload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(ErrorCodes.TOKEN_EXPIRED, 'Token expired', 401))
    }
    return next(new AppError(ErrorCodes.NOT_AUTHENTICATED, 'Invalid token', 401))
  }

  // Guard against stale tokens whose userId no longer exists in the DB
  try {
    const exists = await verifyUserExists(decoded.userId)
    if (!exists) {
      return next(
        new AppError(
          ErrorCodes.NOT_AUTHENTICATED,
          'User no longer exists, please sign in again',
          401,
        ),
      )
    }
  } catch (err) {
    return next(err as Error)
  }

  req.user = decoded
  next()
}
