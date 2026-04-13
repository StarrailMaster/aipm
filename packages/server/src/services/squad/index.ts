import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'

function mapSquad(
  squad: {
    id: string
    name: string
    projectId: string
    project: { name: string }
    members: Array<{
      id: string
      name: string
      email: string
      role: string
      avatar: string | null
      legacyRoles: string[]
    }>
    createdAt: Date
    updatedAt: Date
  },
) {
  return {
    id: squad.id,
    name: squad.name,
    projectId: squad.projectId,
    projectName: squad.project.name,
    members: squad.members.map((m) => ({
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
    createdAt: squad.createdAt.getTime(),
    updatedAt: squad.updatedAt.getTime(),
  }
}

const squadInclude = {
  project: { select: { name: true } },
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
} as const

export async function listSquads(params: {
  page: number
  pageSize: number
  skip: number
  projectId?: string
}) {
  const where: Record<string, unknown> = {}
  if (params.projectId) {
    where.projectId = params.projectId
  }

  const [items, total] = await Promise.all([
    prisma.squad.findMany({
      where,
      skip: params.skip,
      take: params.pageSize,
      orderBy: { createdAt: 'desc' },
      include: squadInclude,
    }),
    prisma.squad.count({ where }),
  ])

  return { items: items.map(mapSquad), total }
}

export async function createSquad(data: {
  name: string
  projectId: string
  architectId: string
  engineerId: string
}) {
  // Validate project exists
  const project = await prisma.project.findFirst({
    where: { id: data.projectId, deletedAt: null },
  })
  if (!project) {
    throw new AppError(ErrorCodes.PROJECT_NOT_FOUND, 'Project not found', 404)
  }

  // Validate architect user
  const architect = await prisma.user.findFirst({
    where: { id: data.architectId, deletedAt: null },
  })
  if (!architect) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Architect user not found', 404)
  }

  // Validate engineer user
  const engineer = await prisma.user.findFirst({
    where: { id: data.engineerId, deletedAt: null },
  })
  if (!engineer) {
    throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Engineer user not found', 404)
  }

  if (data.architectId === data.engineerId) {
    throw new AppError(
      ErrorCodes.SQUAD_REQUIRES_TWO,
      'Architect and engineer must be different users',
    )
  }

  // Check if users are already in a squad
  if (architect.squadId) {
    throw new AppError(
      ErrorCodes.SQUAD_MEMBER_CONFLICT,
      `User ${architect.name} is already in a squad`,
    )
  }
  if (engineer.squadId) {
    throw new AppError(
      ErrorCodes.SQUAD_MEMBER_CONFLICT,
      `User ${engineer.name} is already in a squad`,
    )
  }

  // Create squad and assign members
  const squad = await prisma.squad.create({
    data: {
      name: data.name,
      projectId: data.projectId,
      members: {
        connect: [{ id: data.architectId }, { id: data.engineerId }],
      },
    },
    include: squadInclude,
  })

  return mapSquad(squad)
}

export async function getSquad(id: string) {
  const squad = await prisma.squad.findUnique({
    where: { id },
    include: squadInclude,
  })

  if (!squad) {
    throw new AppError(ErrorCodes.SQUAD_NOT_FOUND, 'Squad not found', 404)
  }

  return mapSquad(squad)
}

export async function updateSquad(
  id: string,
  data: {
    name?: string
    architectId?: string
    engineerId?: string
  },
) {
  const squad = await prisma.squad.findUnique({
    where: { id },
    include: { members: { select: { id: true, role: true } } },
  })

  if (!squad) {
    throw new AppError(ErrorCodes.SQUAD_NOT_FOUND, 'Squad not found', 404)
  }

  // Handle member changes
  const connectIds: string[] = []
  const disconnectIds: string[] = []

  if (data.architectId) {
    const newArchitect = await prisma.user.findFirst({
      where: { id: data.architectId, deletedAt: null },
    })
    if (!newArchitect) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Architect user not found', 404)
    }
    if (newArchitect.squadId && newArchitect.squadId !== id) {
      throw new AppError(
        ErrorCodes.SQUAD_MEMBER_CONFLICT,
        `User ${newArchitect.name} is already in another squad`,
      )
    }

    // Find current architect to disconnect
    const currentArchitect = squad.members.find(
      (m) => m.role === 'ARCHITECT' || m.role === 'ADMIN',
    )
    if (currentArchitect && currentArchitect.id !== data.architectId) {
      disconnectIds.push(currentArchitect.id)
    }
    if (!squad.members.some((m) => m.id === data.architectId)) {
      connectIds.push(data.architectId)
    }
  }

  if (data.engineerId) {
    const newEngineer = await prisma.user.findFirst({
      where: { id: data.engineerId, deletedAt: null },
    })
    if (!newEngineer) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'Engineer user not found', 404)
    }
    if (newEngineer.squadId && newEngineer.squadId !== id) {
      throw new AppError(
        ErrorCodes.SQUAD_MEMBER_CONFLICT,
        `User ${newEngineer.name} is already in another squad`,
      )
    }

    // Find current engineer to disconnect
    const currentEngineer = squad.members.find(
      (m) => m.role === 'ENGINEER' || m.role === 'DESIGNER',
    )
    if (currentEngineer && currentEngineer.id !== data.engineerId) {
      disconnectIds.push(currentEngineer.id)
    }
    if (!squad.members.some((m) => m.id === data.engineerId)) {
      connectIds.push(data.engineerId)
    }
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name

  if (connectIds.length > 0 || disconnectIds.length > 0) {
    updateData.members = {
      ...(disconnectIds.length > 0
        ? { disconnect: disconnectIds.map((mid) => ({ id: mid })) }
        : {}),
      ...(connectIds.length > 0
        ? { connect: connectIds.map((mid) => ({ id: mid })) }
        : {}),
    }
  }

  const updated = await prisma.squad.update({
    where: { id },
    data: updateData,
    include: squadInclude,
  })

  return mapSquad(updated)
}

export async function deleteSquad(id: string) {
  const squad = await prisma.squad.findUnique({
    where: { id },
    include: { members: { select: { id: true } } },
  })

  if (!squad) {
    throw new AppError(ErrorCodes.SQUAD_NOT_FOUND, 'Squad not found', 404)
  }

  // Disconnect all members first (clear their squadId)
  if (squad.members.length > 0) {
    await prisma.squad.update({
      where: { id },
      data: {
        members: {
          disconnect: squad.members.map((m) => ({ id: m.id })),
        },
      },
    })
  }

  await prisma.squad.delete({ where: { id } })
}
