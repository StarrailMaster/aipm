import prisma from '../prisma/client'
import { AppError, ErrorCodes } from '../utils/errors'
import type { SopLayer } from '@prisma/client'
import { PointCategory, ContributionSourceType } from '@prisma/client'
import { awardPoints } from './contribution'

// ========== Error codes for SOP: 30xxx ==========
const SOP_NOT_FOUND = 30001
const SOP_DOCUMENT_NOT_FOUND = 30002
const SOP_VERSION_NOT_FOUND = 30003
const SOP_PROMPT_REF_NOT_FOUND = 30004

function toUserBrief(user: {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    legacyRoles: user.legacyRoles,
  }
}

/** 由 SopDocument 引用的 Prompt 列表拼接出"有效 content"（用于 advance agent 调用等场景）*/
function assembleDocumentContent(
  prompts: Array<{
    sortOrder: number
    note: string | null
    prompt: { name: string; content: string }
  }>,
): string {
  if (prompts.length === 0) return ''
  const sorted = [...prompts].sort((a, b) => a.sortOrder - b.sortOrder)
  const parts: string[] = []
  for (const ref of sorted) {
    parts.push(`## ${ref.prompt.name}`)
    if (ref.note) parts.push(`> 备注：${ref.note}`)
    parts.push('')
    parts.push(ref.prompt.content)
    parts.push('')
  }
  return parts.join('\n').trim()
}

// ========================================================================
// SOP Project
// ========================================================================

export async function listSopProjects(params: {
  page: number
  pageSize: number
  skip: number
  keyword?: string
  visibility?: 'private' | 'team' | 'public'
  userId?: string
  userRole?: string
}) {
  const { page, pageSize, skip, keyword, visibility, userId, userRole } = params

  const where: Record<string, unknown> = { deletedAt: null }
  const andClauses: Array<Record<string, unknown>> = []

  if (keyword) {
    andClauses.push({
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ],
    })
  }
  if (visibility) {
    andClauses.push({ visibility })
  }
  // 可见性强制：非 ADMIN 只能看 team/public 或自己的 private
  if (userRole !== 'ADMIN' && userId) {
    andClauses.push({
      OR: [
        { visibility: { in: ['team', 'public'] } },
        { visibility: 'private', createdById: userId },
      ],
    })
  }
  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  const [items, total] = await Promise.all([
    prisma.sopProject.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
        },
        _count: { select: { documents: true } },
      },
    }),
    prisma.sopProject.count({ where }),
  ])

  const mapped = items.map((item) => ({
    id: item.id,
    name: item.name,
    version: item.version,
    description: item.description,
    visibility: item.visibility,
    documentCount: item._count.documents,
    createdBy: toUserBrief(item.createdBy),
    createdAt: item.createdAt.getTime(),
    updatedAt: item.updatedAt.getTime(),
  }))

  return { items: mapped, total, page, pageSize }
}

export async function createSopProject(data: {
  name: string
  description?: string
  visibility?: 'private' | 'team' | 'public'
  userId: string
}) {
  const project = await prisma.sopProject.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      visibility: data.visibility ?? 'team',
      createdById: data.userId,
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
      },
    },
  })

  // Contribution points: +15 base for creating a SOP project template
  await awardPoints({
    userId: data.userId,
    eventKey: `create:sop_project:${project.id}`,
    eventType: 'create',
    category: PointCategory.base,
    sourceType: ContributionSourceType.sop_project,
    sourceId: project.id,
    points: 15,
    reason: `创建 SOP 模板「${project.name}」`,
  })

  return {
    id: project.id,
    name: project.name,
    version: project.version,
    description: project.description,
    visibility: project.visibility,
    createdBy: toUserBrief(project.createdBy),
    createdAt: project.createdAt.getTime(),
    updatedAt: project.updatedAt.getTime(),
  }
}

export async function getSopProject(id: string) {
  const project = await prisma.sopProject.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
      },
      documents: {
        where: { deletedAt: null },
        orderBy: [{ layer: 'asc' }, { sortOrder: 'asc' }],
        include: {
          createdBy: {
            select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
          },
          prompts: {
            orderBy: { sortOrder: 'asc' },
            include: {
              prompt: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  category: true,
                  tags: true,
                  content: true,
                  starCount: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!project || project.deletedAt) {
    throw new AppError(SOP_NOT_FOUND, 'SOP project not found', 404)
  }

  return {
    id: project.id,
    name: project.name,
    version: project.version,
    description: project.description,
    visibility: project.visibility,
    createdBy: toUserBrief(project.createdBy),
    createdAt: project.createdAt.getTime(),
    updatedAt: project.updatedAt.getTime(),
    documents: project.documents.map((doc) => ({
      id: doc.id,
      sopProjectId: doc.sopProjectId,
      layer: doc.layer,
      title: doc.title,
      description: doc.description,
      version: doc.version,
      tags: doc.tags,
      sortOrder: doc.sortOrder,
      createdBy: toUserBrief(doc.createdBy),
      prompts: doc.prompts.map((ref) => ({
        id: ref.id,
        sortOrder: ref.sortOrder,
        note: ref.note,
        prompt: {
          id: ref.prompt.id,
          name: ref.prompt.name,
          description: ref.prompt.description,
          category: ref.prompt.category,
          tags: ref.prompt.tags,
          content: ref.prompt.content,
          starCount: ref.prompt.starCount,
        },
      })),
      createdAt: doc.createdAt.getTime(),
      updatedAt: doc.updatedAt.getTime(),
    })),
  }
}

export async function updateSopProject(
  id: string,
  data: { name?: string; description?: string; visibility?: 'private' | 'team' | 'public'; version?: string },
  userId: string,
  userRole: string,
) {
  const existing = await prisma.sopProject.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(SOP_NOT_FOUND, 'SOP project not found', 404)
  }

  if (existing.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅创建者可修改此 SOP 项目', 403)
  }

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.visibility !== undefined) updateData.visibility = data.visibility
  if (data.version !== undefined) updateData.version = data.version

  const project = await prisma.sopProject.update({
    where: { id },
    data: updateData,
    include: {
      createdBy: {
        select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
      },
    },
  })

  return {
    id: project.id,
    name: project.name,
    version: project.version,
    description: project.description,
    visibility: project.visibility,
    createdBy: toUserBrief(project.createdBy),
    createdAt: project.createdAt.getTime(),
    updatedAt: project.updatedAt.getTime(),
  }
}

export async function deleteSopProject(id: string, userId: string, userRole: string) {
  const existing = await prisma.sopProject.findUnique({ where: { id } })
  if (!existing || existing.deletedAt) {
    throw new AppError(SOP_NOT_FOUND, 'SOP project not found', 404)
  }

  if (existing.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅创建者可删除此 SOP 项目', 403)
  }

  await prisma.sopProject.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ========================================================================
// SOP Documents
// ========================================================================

export async function createSopDocument(data: {
  sopProjectId: string
  layer: SopLayer
  title: string
  description?: string
  tags?: string[]
  /** 可选：创建时一并绑定一组提示词 */
  promptIds?: string[]
  userId: string
}) {
  const project = await prisma.sopProject.findUnique({ where: { id: data.sopProjectId } })
  if (!project || project.deletedAt) {
    throw new AppError(SOP_NOT_FOUND, 'SOP project not found', 404)
  }

  // Get next sort order within same layer
  const lastDoc = await prisma.sopDocument.findFirst({
    where: { sopProjectId: data.sopProjectId, layer: data.layer, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = lastDoc ? lastDoc.sortOrder + 1 : 0

  const doc = await prisma.sopDocument.create({
    data: {
      sopProjectId: data.sopProjectId,
      layer: data.layer,
      title: data.title,
      description: data.description ?? null,
      tags: data.tags ?? [],
      sortOrder,
      createdById: data.userId,
      prompts: data.promptIds && data.promptIds.length > 0
        ? {
            create: data.promptIds.map((pid, idx) => ({
              promptId: pid,
              sortOrder: idx,
            })),
          }
        : undefined,
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
      },
      prompts: {
        orderBy: { sortOrder: 'asc' },
        include: {
          prompt: {
            select: { id: true, name: true, description: true, category: true, tags: true, content: true, starCount: true },
          },
        },
      },
    },
  })

  // Contribution points: +5 base for creating a SOP document
  await awardPoints({
    userId: data.userId,
    eventKey: `create:sop_doc:${doc.id}`,
    eventType: 'create',
    category: PointCategory.base,
    sourceType: ContributionSourceType.sop_document,
    sourceId: doc.id,
    points: 5,
    reason: `为 SOP 模板「${project.name}」创建文档「${doc.title}」`,
  })

  return {
    id: doc.id,
    sopProjectId: doc.sopProjectId,
    layer: doc.layer,
    title: doc.title,
    description: doc.description,
    version: doc.version,
    tags: doc.tags,
    sortOrder: doc.sortOrder,
    createdBy: toUserBrief(doc.createdBy),
    prompts: doc.prompts.map((ref) => ({
      id: ref.id,
      sortOrder: ref.sortOrder,
      note: ref.note,
      prompt: {
        id: ref.prompt.id,
        name: ref.prompt.name,
        description: ref.prompt.description,
        category: ref.prompt.category,
        tags: ref.prompt.tags,
        content: ref.prompt.content,
        starCount: ref.prompt.starCount,
      },
    })),
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
  }
}

export async function updateSopDocument(
  docId: string,
  data: { title?: string; description?: string; tags?: string[] },
  userId: string,
  userRole: string,
) {
  const existing = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }

  const project = await prisma.sopProject.findUnique({ where: { id: existing.sopProjectId } })
  if (project && project.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅 SOP 项目创建者可修改文档', 403)
  }

  const updateData: Record<string, unknown> = {}
  if (data.title !== undefined) updateData.title = data.title
  if (data.description !== undefined) updateData.description = data.description
  if (data.tags !== undefined) updateData.tags = data.tags
  if (Object.keys(updateData).length > 0) {
    updateData.version = existing.version + 1
  }

  const doc = await prisma.sopDocument.update({
    where: { id: docId },
    data: updateData,
    include: {
      createdBy: {
        select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
      },
      prompts: {
        orderBy: { sortOrder: 'asc' },
        include: {
          prompt: {
            select: { id: true, name: true, description: true, category: true, tags: true, content: true, starCount: true },
          },
        },
      },
    },
  })

  return {
    id: doc.id,
    sopProjectId: doc.sopProjectId,
    layer: doc.layer,
    title: doc.title,
    description: doc.description,
    version: doc.version,
    tags: doc.tags,
    sortOrder: doc.sortOrder,
    createdBy: toUserBrief(doc.createdBy),
    prompts: doc.prompts.map((ref) => ({
      id: ref.id,
      sortOrder: ref.sortOrder,
      note: ref.note,
      prompt: {
        id: ref.prompt.id,
        name: ref.prompt.name,
        description: ref.prompt.description,
        category: ref.prompt.category,
        tags: ref.prompt.tags,
        content: ref.prompt.content,
        starCount: ref.prompt.starCount,
      },
    })),
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
  }
}

export async function deleteSopDocument(docId: string, userId: string, userRole: string) {
  const existing = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!existing || existing.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }

  const project = await prisma.sopProject.findUnique({ where: { id: existing.sopProjectId } })
  if (project && project.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅 SOP 项目创建者可删除文档', 403)
  }

  await prisma.sopDocument.update({
    where: { id: docId },
    data: { deletedAt: new Date() },
  })
}

// ========================================================================
// SOP Document Prompt References (Req 7: SOP = Prompt 组合)
// ========================================================================

/** 添加一个 Prompt 引用到 SopDocument（末尾追加） */
export async function addPromptToDocument(
  docId: string,
  promptId: string,
  note: string | null,
  userId: string,
  userRole: string,
) {
  const doc = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }

  const project = await prisma.sopProject.findUnique({ where: { id: doc.sopProjectId } })
  if (project && project.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅 SOP 项目创建者可添加提示词引用', 403)
  }

  // 验证 prompt 存在
  const prompt = await prisma.prompt.findUnique({ where: { id: promptId } })
  if (!prompt || prompt.deletedAt) {
    throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '指定的提示词不存在', 404)
  }

  // 计算末尾 sortOrder
  const lastRef = await prisma.sopDocumentPrompt.findFirst({
    where: { sopDocumentId: docId },
    orderBy: { sortOrder: 'desc' },
  })
  const sortOrder = lastRef ? lastRef.sortOrder + 1 : 0

  const ref = await prisma.sopDocumentPrompt.create({
    data: {
      sopDocumentId: docId,
      promptId,
      note,
      sortOrder,
    },
    include: {
      prompt: {
        select: { id: true, name: true, description: true, category: true, tags: true, content: true, starCount: true },
      },
    },
  })

  return {
    id: ref.id,
    sortOrder: ref.sortOrder,
    note: ref.note,
    prompt: {
      id: ref.prompt.id,
      name: ref.prompt.name,
      description: ref.prompt.description,
      category: ref.prompt.category,
      tags: ref.prompt.tags,
      content: ref.prompt.content,
      starCount: ref.prompt.starCount,
    },
  }
}

/** 更新 Prompt 引用的排序或备注 */
export async function updatePromptRef(
  docId: string,
  refId: string,
  data: { sortOrder?: number; note?: string | null },
  userId: string,
  userRole: string,
) {
  const ref = await prisma.sopDocumentPrompt.findUnique({ where: { id: refId } })
  if (!ref || ref.sopDocumentId !== docId) {
    throw new AppError(SOP_PROMPT_REF_NOT_FOUND, 'Prompt reference not found', 404)
  }

  const doc = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }
  const project = await prisma.sopProject.findUnique({ where: { id: doc.sopProjectId } })
  if (project && project.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅 SOP 项目创建者可修改', 403)
  }

  const updateData: Record<string, unknown> = {}
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder
  if (data.note !== undefined) updateData.note = data.note

  const updated = await prisma.sopDocumentPrompt.update({
    where: { id: refId },
    data: updateData,
    include: {
      prompt: {
        select: { id: true, name: true, description: true, category: true, tags: true, content: true, starCount: true },
      },
    },
  })

  return {
    id: updated.id,
    sortOrder: updated.sortOrder,
    note: updated.note,
    prompt: {
      id: updated.prompt.id,
      name: updated.prompt.name,
      description: updated.prompt.description,
      category: updated.prompt.category,
      tags: updated.prompt.tags,
      content: updated.prompt.content,
      starCount: updated.prompt.starCount,
    },
  }
}

/** 批量重排（拖拽后的新顺序）*/
export async function reorderPromptRefs(
  docId: string,
  orderedRefIds: string[],
  userId: string,
  userRole: string,
) {
  const doc = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }
  const project = await prisma.sopProject.findUnique({ where: { id: doc.sopProjectId } })
  if (project && project.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅 SOP 项目创建者可排序', 403)
  }

  // 验证所有 refId 属于这个 doc
  const refs = await prisma.sopDocumentPrompt.findMany({
    where: { sopDocumentId: docId },
    select: { id: true },
  })
  const validIds = new Set(refs.map((r) => r.id))
  for (const id of orderedRefIds) {
    if (!validIds.has(id)) {
      throw new AppError(SOP_PROMPT_REF_NOT_FOUND, `Reference ${id} not found in document`, 404)
    }
  }

  // 批量更新 sortOrder
  await prisma.$transaction(
    orderedRefIds.map((refId, idx) =>
      prisma.sopDocumentPrompt.update({
        where: { id: refId },
        data: { sortOrder: idx },
      }),
    ),
  )
}

/** 删除一条 Prompt 引用 */
export async function removePromptRef(
  docId: string,
  refId: string,
  userId: string,
  userRole: string,
) {
  const ref = await prisma.sopDocumentPrompt.findUnique({ where: { id: refId } })
  if (!ref || ref.sopDocumentId !== docId) {
    throw new AppError(SOP_PROMPT_REF_NOT_FOUND, 'Prompt reference not found', 404)
  }

  const doc = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }
  const project = await prisma.sopProject.findUnique({ where: { id: doc.sopProjectId } })
  if (project && project.createdById !== userId && userRole !== 'ADMIN') {
    throw new AppError(ErrorCodes.PERMISSION_DENIED, '仅 SOP 项目创建者可移除', 403)
  }

  await prisma.sopDocumentPrompt.delete({ where: { id: refId } })
}

// ========================================================================
// Document Versions
// ========================================================================

export async function getDocumentVersions(docId: string) {
  const doc = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }

  const versions = await prisma.sopDocumentVersion.findMany({
    where: { documentId: docId },
    orderBy: { version: 'desc' },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
      },
    },
  })

  return versions.map((v) => ({
    id: v.id,
    documentId: v.documentId,
    version: v.version,
    title: v.title,
    content: v.content, // legacy snapshot
    tags: v.tags,
    createdBy: toUserBrief(v.createdBy),
    createdAt: v.createdAt.getTime(),
  }))
}

export async function getDocumentDiff(docId: string, oldVersion: number, newVersion: number) {
  const doc = await prisma.sopDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.deletedAt) {
    throw new AppError(SOP_DOCUMENT_NOT_FOUND, 'Document not found', 404)
  }

  const [oldVer, newVer] = await Promise.all([
    prisma.sopDocumentVersion.findFirst({ where: { documentId: docId, version: oldVersion } }),
    prisma.sopDocumentVersion.findFirst({ where: { documentId: docId, version: newVersion } }),
  ])

  if (!oldVer) {
    throw new AppError(SOP_VERSION_NOT_FOUND, `Version ${oldVersion} not found`, 404)
  }
  if (!newVer) {
    throw new AppError(SOP_VERSION_NOT_FOUND, `Version ${newVersion} not found`, 404)
  }

  const oldLines = oldVer.content.split('\n')
  const newLines = newVer.content.split('\n')
  const diffLines: string[] = []

  diffLines.push(`--- v${oldVersion}`)
  diffLines.push(`+++ v${newVersion}`)

  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined
    const newLine = i < newLines.length ? newLines[i] : undefined

    if (oldLine === newLine) {
      diffLines.push(` ${oldLine}`)
    } else {
      if (oldLine !== undefined) {
        diffLines.push(`-${oldLine}`)
      }
      if (newLine !== undefined) {
        diffLines.push(`+${newLine}`)
      }
    }
  }

  return {
    oldVersion,
    newVersion,
    diff: diffLines.join('\n'),
  }
}

// ========================================================================
// 导出给其他 service 用的 helper
// ========================================================================

/**
 * 根据 SopDocument 的 Prompt 引用列表拼接出"有效 content"
 * 用于 iteration.service.advanceIteration 生成 FeedFile 和 ai.service.SOP Agent
 */
export async function getSopDocumentEffectiveContent(docId: string): Promise<string> {
  const doc = await prisma.sopDocument.findUnique({
    where: { id: docId },
    include: {
      prompts: {
        orderBy: { sortOrder: 'asc' },
        include: {
          prompt: { select: { name: true, content: true } },
        },
      },
    },
  })
  if (!doc) return ''
  return assembleDocumentContent(doc.prompts)
}
