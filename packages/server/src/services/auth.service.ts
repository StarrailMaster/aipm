import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { SignOptions } from 'jsonwebtoken'
import prisma from '../prisma/client'
import { AppError, ErrorCodes } from '../utils/errors'
import type { JwtPayload } from '../middleware/auth'

const BCRYPT_ROUNDS = 12

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'default-secret'
}

function getJwtExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn']
}

function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: getJwtExpiresIn(),
  }
  return jwt.sign(payload, getJwtSecret(), options)
}

function toUserBrief(user: {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
  squadId?: string | null
  squadName?: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    legacyRoles: user.legacyRoles,
    squadId: user.squadId ?? null,
    squadName: user.squadName ?? null,
  }
}

export async function register(email: string, password: string, name: string) {
  // Check if email exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw new AppError(ErrorCodes.EMAIL_ALREADY_EXISTS, 'Email already registered', 409)
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

  // Create user (default role is DESIGNER as per Prisma schema default)
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
    },
  })

  // Generate token
  const tokenPayload: JwtPayload = {
    userId: user.id,
    role: user.role,
    squadId: user.squadId,
  }
  const token = signToken(tokenPayload)

  return {
    token,
    user: toUserBrief({ ...user, squadName: null }),
  }
}

export async function login(email: string, password: string) {
  // Find user — include squad so login response has squadName
  const user = await prisma.user.findUnique({
    where: { email },
    include: { squad: true },
  })
  if (!user || user.deletedAt) {
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password', 401)
  }

  // Verify password
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    throw new AppError(ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password', 401)
  }

  // Generate token
  const tokenPayload: JwtPayload = {
    userId: user.id,
    role: user.role,
    squadId: user.squadId,
  }
  const token = signToken(tokenPayload)

  return {
    token,
    user: toUserBrief({ ...user, squadName: user.squad?.name ?? null }),
  }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { squad: true },
  })

  if (!user || user.deletedAt) {
    throw new AppError(ErrorCodes.NOT_AUTHENTICATED, 'User not found', 404)
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    legacyRoles: user.legacyRoles,
    squadId: user.squadId,
    squadName: user.squad?.name ?? null,
    createdAt: user.createdAt.getTime(),
  }
}

export async function updateMe(
  userId: string,
  data: { name?: string; avatar?: string; legacyRoles?: string[] },
) {
  // Sec-4: name 长度约束，避免 UI 渲染对齐错乱 / DB 索引膨胀
  if (data.name !== undefined) {
    if (data.name.length === 0) {
      throw new AppError(ErrorCodes.INVALID_FORMAT, '姓名不能为空')
    }
    if (data.name.length > 40) {
      throw new AppError(ErrorCodes.INVALID_FORMAT, '姓名最多 40 个字符')
    }
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.avatar !== undefined) updateData.avatar = data.avatar
  if (data.legacyRoles !== undefined) updateData.legacyRoles = data.legacyRoles

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    include: { squad: true },
  })

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    legacyRoles: user.legacyRoles,
    squadId: user.squadId,
    squadName: user.squad?.name ?? null,
    createdAt: user.createdAt.getTime(),
  }
}
