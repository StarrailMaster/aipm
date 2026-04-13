import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/errors'
import { error as errorResponse } from '../utils/response'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[ErrorHandler]', err.message, err.stack)

  if (err instanceof AppError) {
    errorResponse(res, err.code, err.message, err.statusCode)
    return
  }

  // Unknown error
  errorResponse(res, 50001, 'Internal server error', 500)
}
