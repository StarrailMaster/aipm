import bcrypt from 'bcryptjs'
import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'

const BCRYPT_ROUNDS = 12

// ========== Projects ==========

export async function listProjects(params: {
  page: number
  pageSize: number
  skip: number
  /**
   * "我的项目"模式：只返回 userId 所在的项目
   * （即 user 是 owner，或 user 所在的 squad 属于该项目）
   * ADMIN 调用时即使传 true 也会返回全部。
   */
  mine?: boolean
  userId?: string
  userRole?: string
}) {
  const { mine, userId, userRole } = params

  // 基础条件：未删除
  const where: Record<string, unknown> = { deletedAt: null }

  // "mine" 过滤：ADMIN 和 DESIGNER 都跳过 mine 限制
  //   - ADMIN: 管全局，永远看所有
  //   - DESIGNER: 跨 squad 角色，可能要审核任何项目的工作台包，必须能看到所有项目
  // 其他角色（ARCHITECT / ENGINEER）：限制在 owner 或所在 squad
  if (mine && userId && userRole !== 'ADMIN' && userRole !== 'DESIGNER') {
    // 拿 user.squadId，以便把"所在 squad 关联的 project"纳入可见范围
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { squadId: true },
    })

    const orClauses: Array<Record<string, unknown>> = [{ ownerId: userId }]
    if (me?.squadId) {
      orClauses.push({ squads: { some: { id: me.squadId } } })
    }
    where.OR = orClauses
  }

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: params.skip,
      take: params.pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true } },
        squads: { select: { id: true } },
        _count: { select: { squads: true } },
      },
    }),
    prisma.project.count({ where }),
  ])

  const mapped = await Promise.all(
    items.map(async (p) => {
      const memberCount = await prisma.user.count({
        where: {
          squad: { projectId: p.id },
          deletedAt: null,
        },
      })
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        ownerId: p.ownerId,
        ownerName: p.owner.name,
        squadCount: p._count.squads,
        memberCount,
        createdAt: p.createdAt.getTime(),
        updatedAt: p.updatedAt.getTime(),
      }
    }),
  )

  return { items: mapped, total }
}

export async function createProject(data: {
  name: string
  description?: string
  ownerId: string
}) {
  const existing = await prisma.project.findFirst({
    where: { name: data.name, deletedAt: null },
  })
  if (existing) {
    throw new AppError(ErrorCodes.PROJECT_NAME_EXISTS, 'Project name already exists', 409)
  }

  // 校验 owner 存在且未被软删除
  const owner = await prisma.user.findFirst({
    where: { id: data.ownerId, deletedAt: null },
  })
  if (!owner) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Specified owner does not exist', 404)
  }

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      ownerId: data.ownerId,
    },
    include: {
      owner: { select: { id: true, name: true } },
    },
  })

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
    ownerName: project.owner.name,
    squadCount: 0,
    memberCount: 0,
    createdAt: project.createdAt.getTime(),
    updatedAt: project.updatedAt.getTime(),
  }
}

export async function getProject(id: string) {
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true } },
      squads: {
        include: {
          members: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              avatar: true,
              legacyRoles: true,
            },
          },
        },
      },
    },
  })

  if (!project) {
    throw new AppError(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found', 404)
  }

  const squads = project.squads.map((s) => ({
    id: s.id,
    name: s.name,
    projectId: s.projectId,
    projectName: project.name,
    members: s.members.map((m) => ({
      user: {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        avatar: m.avatar,
        legacyRoles: m.legacyRoles,
      },
      squadRole: m.role === 'ARCHITECT' || m.role === 'ADMIN' ? 'architect' as const : 'engineer' as const,
    })),
    createdAt: s.createdAt.getTime(),
    updatedAt: s.updatedAt.getTime(),
  }))

  const memberCount = project.squads.reduce((sum, s) => sum + s.members.length, 0)

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    ownerId: project.ownerId,
    ownerName: project.owner.name,
    squadCount: project.squads.length,
    memberCount,
    squads,
    createdAt: project.createdAt.getTime(),
    updatedAt: project.updatedAt.getTime(),
  }
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string; ownerId?: string },
) {
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
  })

  if (!project) {
    throw new AppError(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found', 404)
  }

  if (data.name) {
    const dup = await prisma.project.findFirst({
      where: { name: data.name, deletedAt: null, id: { not: id } },
    })
    if (dup) {
      throw new AppError(ErrorCodes.PROJECT_NAME_EXISTS, 'Project name already exists', 409)
    }
  }

  // 切换 owner：校验新 owner 存在且未被软删
  if (data.ownerId && data.ownerId !== project.ownerId) {
    const newOwner = await prisma.user.findFirst({
      where: { id: data.ownerId, deletedAt: null },
    })
    if (!newOwner) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Specified owner does not exist', 404)
    }
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.ownerId !== undefined) updateData.ownerId = data.ownerId

  const updated = await prisma.project.update({
    where: { id },
    data: updateData,
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { squads: true } },
    },
  })

  const memberCount = await prisma.user.count({
    where: {
      squad: { projectId: id },
      deletedAt: null,
    },
  })

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description,
    ownerId: updated.ownerId,
    ownerName: updated.owner.name,
    squadCount: updated._count.squads,
    memberCount,
    createdAt: updated.createdAt.getTime(),
    updatedAt: updated.updatedAt.getTime(),
  }
}

export async function deleteProject(id: string) {
  const project = await prisma.project.findFirst({
    where: { id, deletedAt: null },
  })

  if (!project) {
    throw new AppError(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found', 404)
  }

  await prisma.project.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ========== Users ==========

export async function listUsers(params: {
  page: number
  pageSize: number
  skip: number
  keyword?: string
  role?: string
  squadId?: string
  projectId?: string
}) {
  const where: Record<string, unknown> = { deletedAt: null }

  if (params.keyword) {
    where.OR = [
      { name: { contains: params.keyword, mode: 'insensitive' } },
      { email: { contains: params.keyword, mode: 'insensitive' } },
    ]
  }

  if (params.role) {
    where.role = params.role
  }

  if (params.squadId) {
    where.squadId = params.squadId
  }

  if (params.projectId) {
    where.squad = { projectId: params.projectId }
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: params.skip,
      take: params.pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        squad: { select: { id: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ])

  const mapped = items.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar: u.avatar,
    legacyRoles: u.legacyRoles,
    squadId: u.squadId,
    squadName: u.squad?.name ?? null,
    createdAt: u.createdAt.getTime(),
  }))

  return { items: mapped, total }
}

export async function getUser(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      squad: { select: { id: true, name: true } },
    },
  })

  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404)
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

/**
 * ADMIN 专用：创建新成员（Sec-1 替代公开注册）。
 * 与 auth.service.register 的差别：可指定 role / squadId / legacyRoles，不返回 JWT。
 */
export async function createUser(data: {
  email: string
  password: string
  name: string
  role: string
  squadId: string | null
  legacyRoles: string[]
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) {
    throw new AppError(ErrorCodes.EMAIL_ALREADY_EXISTS, '该邮箱已被注册', 409)
  }

  if (data.squadId) {
    const squad = await prisma.squad.findUnique({ where: { id: data.squadId } })
    if (!squad) {
      throw new AppError(ErrorCodes.SQUAD_NOT_FOUND, '小组不存在', 404)
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS)

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      name: data.name,
      role: data.role as 'ADMIN' | 'ARCHITECT' | 'ENGINEER' | 'DESIGNER',
      squadId: data.squadId,
      legacyRoles: data.legacyRoles,
    },
    include: { squad: { select: { id: true, name: true } } },
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

export async function updateUser(
  id: string,
  data: {
    name?: string
    role?: string
    legacyRoles?: string[]
    squadId?: string | null
  },
) {
  // Sec-4: name 长度约束
  if (data.name !== undefined) {
    if (data.name.length === 0) {
      throw new AppError(ErrorCodes.INVALID_FORMAT, '姓名不能为空')
    }
    if (data.name.length > 40) {
      throw new AppError(ErrorCodes.INVALID_FORMAT, '姓名最多 40 个字符')
    }
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
  })

  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404)
  }

  if (data.squadId !== undefined && data.squadId !== null) {
    const squad = await prisma.squad.findUnique({ where: { id: data.squadId } })
    if (!squad) {
      throw new AppError(ErrorCodes.SQUAD_NOT_FOUND, 'Squad not found', 404)
    }
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.role !== undefined) updateData.role = data.role
  if (data.legacyRoles !== undefined) updateData.legacyRoles = data.legacyRoles
  if (data.squadId !== undefined) updateData.squadId = data.squadId

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    include: {
      squad: { select: { id: true, name: true } },
    },
  })

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    avatar: updated.avatar,
    legacyRoles: updated.legacyRoles,
    squadId: updated.squadId,
    squadName: updated.squad?.name ?? null,
    createdAt: updated.createdAt.getTime(),
  }
}

export async function updateUserLegacyRoles(id: string, legacyRoles: string[]) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
  })

  if (!user) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404)
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { legacyRoles },
    include: {
      squad: { select: { id: true, name: true } },
    },
  })

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    avatar: updated.avatar,
    legacyRoles: updated.legacyRoles,
    squadId: updated.squadId,
    squadName: updated.squad?.name ?? null,
    createdAt: updated.createdAt.getTime(),
  }
}
