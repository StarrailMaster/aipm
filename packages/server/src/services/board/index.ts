import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import { Prisma, type SopLayer } from '@prisma/client'

/** Phase 5.3: 白板 layer tab 顺序（对应 8 个 SopLayer） */
export const LAYER_ORDER: SopLayer[] = [
  'PRODUCT_REQ',
  'CONTENT',
  'DESIGN_SYSTEM',
  'FRONTEND_ARCH',
  'BACKEND_ARCH',
  'AI_PROMPTS',
  'ACCEPTANCE',
  'APPENDIX',
]

// ========== Helpers ==========

interface UserBriefRow {
  id: string
  name: string
  email: string
  role: string
  avatar: string | null
  legacyRoles: string[]
}

async function getUserBrief(userId: string): Promise<UserBriefRow> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  if (!user) {
    return { id: userId, name: 'Unknown', email: '', role: 'DESIGNER', avatar: null, legacyRoles: [] }
  }
  return user
}

/**
 * Req 1: 计算 prompt 卡片的"有效"字段（override 优先，否则用公共库的 Prompt 值）
 * 对 sop_doc/text/sticky 类型，所有 effective 字段返回 null。
 */
function computeEffective(
  sel: {
    type: string
    promptOverrideTitle: string | null
    promptOverrideContent: string | null
    promptOverrideTags: string[]
  },
  prompt: { name: string; content: string; tags: string[] } | null,
): {
  effectiveTitle: string | null
  effectiveContent: string | null
  effectiveTags: string[]
  hasOverride: boolean
} {
  if (sel.type !== 'prompt') {
    return { effectiveTitle: null, effectiveContent: null, effectiveTags: [], hasOverride: false }
  }
  const hasOverride =
    !!sel.promptOverrideTitle ||
    !!sel.promptOverrideContent ||
    (sel.promptOverrideTags?.length ?? 0) > 0
  return {
    effectiveTitle: sel.promptOverrideTitle ?? prompt?.name ?? null,
    effectiveContent: sel.promptOverrideContent ?? prompt?.content ?? null,
    effectiveTags:
      sel.promptOverrideTags && sel.promptOverrideTags.length > 0
        ? sel.promptOverrideTags
        : prompt?.tags ?? [],
    hasOverride,
  }
}

interface BoardResponse {
  id: string
  projectId: string
  name: string
  description: string | null
  createdBy: UserBriefRow
  selectionCount: number
  createdAt: number
  updatedAt: number
}

interface SopDocBrief {
  id: string
  title: string
  layer: string
  sopProjectId: string
  sopProjectName: string | null
}

interface SelectionResponse {
  id: string
  boardId: string
  userId: string
  type: string
  promptId: string | null
  sopDocumentId: string | null
  content: string | null
  color: string | null
  size: { width: number; height: number } | null
  position: { x: number; y: number }
  note: string | null
  prompt: {
    id: string
    name: string
    category: string
    starCount: number
    description: string | null
    content: string
    tags: string[]
  } | null
  sopDocument: SopDocBrief | null
  createdBy: UserBriefRow
  // ===== 指派 + 完成状态（白板协作准备阶段必需） =====
  assigneeId: string | null
  assignee: UserBriefRow | null
  completedAt: number | null
  // ===== Phase 5.3: layer tab 分类 + 继承语义 =====
  layer: SopLayer | null
  assigneeInherit: boolean
  // ===== Req 1: 本地 override + 计算后的"有效值" =====
  promptOverrideTitle: string | null
  promptOverrideContent: string | null
  promptOverrideTags: string[]
  /** 有效标题：override 优先，否则 prompt.name */
  effectiveTitle: string | null
  /** 有效内容：override 优先，否则 prompt.content */
  effectiveContent: string | null
  /** 有效标签：override 优先（空数组表示沿用），否则 prompt.tags */
  effectiveTags: string[]
  /** 用户是否有任何本地覆盖（用于 UI 显示"已修改"标记） */
  hasOverride: boolean
  createdAt: number
  updatedAt: number
}

export interface LayerAssignmentRow {
  layer: SopLayer
  assigneeId: string | null
  assignee: UserBriefRow | null
  assignedById: string | null
  updatedAt: number
}

interface BoardDetailResponse extends BoardResponse {
  selections: SelectionResponse[]
  /** 按 LAYER_ORDER 顺序排列的 8 个 layer 负责人条目（未指派的 assigneeId=null） */
  layerAssignments: LayerAssignmentRow[]
}

// ========== List Boards ==========

export async function listBoards(query: {
  page: number
  pageSize: number
  skip: number
  projectId: string
}): Promise<{ items: BoardResponse[]; total: number }> {
  const where = {
    projectId: query.projectId,
    deletedAt: null,
  }

  const [boards, total] = await Promise.all([
    prisma.board.findMany({
      where,
      include: { _count: { select: { selections: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: query.skip,
      take: query.pageSize,
    }),
    prisma.board.count({ where }),
  ])

  const items: BoardResponse[] = await Promise.all(
    boards.map(async (board) => {
      const createdBy = await getUserBrief(board.createdById)
      return {
        id: board.id,
        projectId: board.projectId,
        name: board.name,
        description: board.description,
        createdBy,
        selectionCount: board._count.selections,
        createdAt: board.createdAt.getTime(),
        updatedAt: board.updatedAt.getTime(),
      }
    }),
  )

  return { items, total }
}

// ========== Create Board ==========

export async function createBoard(
  userId: string,
  data: { projectId: string; name: string; description?: string },
): Promise<BoardResponse> {
  const board = await prisma.board.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      description: data.description,
      createdById: userId,
    },
    include: { _count: { select: { selections: true } } },
  })

  const createdBy = await getUserBrief(userId)

  return {
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    description: board.description,
    createdBy,
    selectionCount: board._count.selections,
    createdAt: board.createdAt.getTime(),
    updatedAt: board.updatedAt.getTime(),
  }
}

// ========== Get Board Detail ==========

export async function getBoardDetail(boardId: string): Promise<BoardDetailResponse> {
  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    include: {
      selections: { orderBy: { createdAt: 'asc' } },
      layerAssignments: true,
      _count: { select: { selections: true } },
    },
  })

  if (!board) {
    throw new AppError(ErrorCodes.BOARD_NOT_FOUND, 'Board not found', 404)
  }

  const createdBy = await getUserBrief(board.createdById)

  // Batch-fetch prompts (Req 1: 加 content + tags 用于 effective 计算)
  const promptSels = board.selections.filter((s) => s.type === 'prompt' && s.promptId)
  const promptIds = [...new Set(promptSels.map((s) => s.promptId!))]
  const prompts = promptIds.length > 0
    ? await prisma.prompt.findMany({
        where: { id: { in: promptIds } },
        select: {
          id: true, name: true, category: true, starCount: true, description: true,
          content: true, tags: true,
        },
      })
    : []
  const promptMap = new Map(prompts.map((p) => [p.id, p]))

  // Batch-fetch SOP documents
  const sopSels = board.selections.filter((s) => s.type === 'sop_doc' && s.sopDocumentId)
  const sopDocIds = [...new Set(sopSels.map((s) => s.sopDocumentId!))]
  const sopDocs = sopDocIds.length > 0
    ? await prisma.sopDocument.findMany({
        where: { id: { in: sopDocIds } },
        select: { id: true, title: true, layer: true, sopProjectId: true },
      })
    : []
  // Fetch SOP project names
  const sopProjectIds = [...new Set(sopDocs.map((d) => d.sopProjectId))]
  const sopProjects = sopProjectIds.length > 0
    ? await prisma.sopProject.findMany({
        where: { id: { in: sopProjectIds } },
        select: { id: true, name: true },
      })
    : []
  const sopProjectMap = new Map(sopProjects.map((p) => [p.id, p.name]))
  const sopDocMap = new Map(sopDocs.map((d) => [d.id, {
    id: d.id,
    title: d.title,
    layer: d.layer,
    sopProjectId: d.sopProjectId,
    sopProjectName: sopProjectMap.get(d.sopProjectId) ?? null,
  }]))

  // Batch-fetch users (创建者 + 指派人 + layer 负责人)
  const userIdSet = new Set<string>()
  for (const s of board.selections) {
    userIdSet.add(s.userId)
    if (s.assigneeId) userIdSet.add(s.assigneeId)
  }
  for (const la of board.layerAssignments) {
    if (la.assigneeId) userIdSet.add(la.assigneeId)
    if (la.assignedById) userIdSet.add(la.assignedById)
  }
  const userIds = [...userIdSet]
  const userBriefs = await Promise.all(userIds.map((uid) => getUserBrief(uid)))
  const userMap = new Map(userBriefs.map((u) => [u.id, u]))

  const selections: SelectionResponse[] = board.selections.map((sel) => {
    const promptData = sel.promptId ? promptMap.get(sel.promptId) ?? null : null
    const eff = computeEffective(sel, promptData)
    return {
      id: sel.id,
      boardId: sel.boardId,
      userId: sel.userId,
      type: sel.type,
      promptId: sel.promptId,
      sopDocumentId: sel.sopDocumentId,
      content: sel.content,
      color: sel.color,
      size: sel.size as { width: number; height: number } | null,
      position: sel.position as { x: number; y: number },
      note: sel.note,
      prompt: promptData,
      sopDocument: sel.sopDocumentId ? (sopDocMap.get(sel.sopDocumentId) ?? null) : null,
      createdBy: userMap.get(sel.userId) ?? {
        id: sel.userId,
        name: 'Unknown',
        email: '',
        role: 'DESIGNER',
        avatar: null,
        legacyRoles: [],
      },
      assigneeId: sel.assigneeId,
      assignee: sel.assigneeId ? userMap.get(sel.assigneeId) ?? null : null,
      completedAt: sel.completedAt ? sel.completedAt.getTime() : null,
      layer: sel.layer,
      assigneeInherit: sel.assigneeInherit,
      promptOverrideTitle: sel.promptOverrideTitle,
      promptOverrideContent: sel.promptOverrideContent,
      promptOverrideTags: sel.promptOverrideTags,
      ...eff,
      createdAt: sel.createdAt.getTime(),
      updatedAt: sel.updatedAt.getTime(),
    }
  })

  // 按 LAYER_ORDER 组装 layerAssignments（未指派的 layer 也返回一条 assigneeId=null 的记录）
  const laMap = new Map(board.layerAssignments.map((la) => [la.layer, la]))
  const layerAssignments: LayerAssignmentRow[] = LAYER_ORDER.map((layer) => {
    const row = laMap.get(layer)
    return {
      layer,
      assigneeId: row?.assigneeId ?? null,
      assignee: row?.assigneeId ? userMap.get(row.assigneeId) ?? null : null,
      assignedById: row?.assignedById ?? null,
      updatedAt: row?.updatedAt.getTime() ?? 0,
    }
  })

  return {
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    description: board.description,
    createdBy,
    selectionCount: board._count.selections,
    selections,
    layerAssignments,
    createdAt: board.createdAt.getTime(),
    updatedAt: board.updatedAt.getTime(),
  }
}

// ========== Update Board ==========

export async function updateBoard(
  boardId: string,
  data: { name?: string; description?: string },
): Promise<BoardResponse> {
  const existing = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
  })

  if (!existing) {
    throw new AppError(ErrorCodes.BOARD_NOT_FOUND, 'Board not found', 404)
  }

  const board = await prisma.board.update({
    where: { id: boardId },
    data: {
      name: data.name ?? existing.name,
      description: data.description !== undefined ? data.description : existing.description,
    },
    include: { _count: { select: { selections: true } } },
  })

  const createdBy = await getUserBrief(board.createdById)

  return {
    id: board.id,
    projectId: board.projectId,
    name: board.name,
    description: board.description,
    createdBy,
    selectionCount: board._count.selections,
    createdAt: board.createdAt.getTime(),
    updatedAt: board.updatedAt.getTime(),
  }
}

// ========== Delete Board (soft) ==========

export async function deleteBoard(boardId: string): Promise<void> {
  const existing = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
  })

  if (!existing) {
    throw new AppError(ErrorCodes.BOARD_NOT_FOUND, 'Board not found', 404)
  }

  await prisma.board.update({
    where: { id: boardId },
    data: { deletedAt: new Date() },
  })
}

// ========== Add Selection ==========

export async function addSelection(
  boardId: string,
  userId: string,
  data: {
    type?: string
    promptId?: string
    sopDocumentId?: string
    content?: string
    color?: string
    size?: { width: number; height: number }
    position: { x: number; y: number }
    note?: string
    /** 可选：手动指派人。如果提供，assigneeInherit=false（手动覆盖） */
    assigneeId?: string
    /**
     * 卡片归属的 layer（对应白板的 tab）。
     * - 如果 type=sop_doc 且提供 sopDocumentId：自动从 sopDocument.layer 推断
     * - 其他类型：调用方必须传 layer（对应当前激活的 tab）
     */
    layer?: SopLayer
    // ===== Req 1: 本地提示词 override =====
    /** 本地覆盖的标题（仅对 prompt 类型有意义） */
    promptOverrideTitle?: string
    /** 本地覆盖的内容 */
    promptOverrideContent?: string
    /** 本地覆盖的标签 */
    promptOverrideTags?: string[]
  },
): Promise<SelectionResponse> {
  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
  })

  if (!board) {
    throw new AppError(ErrorCodes.BOARD_NOT_FOUND, 'Board not found', 404)
  }

  const type = data.type ?? 'prompt'

  // ===== Req 1: 本地自建 prompt 卡片验证（promptId=null 时 override 字段必填） =====
  if (type === 'prompt' && !data.promptId) {
    if (!data.promptOverrideTitle || !data.promptOverrideContent) {
      throw new AppError(
        ErrorCodes.MISSING_REQUIRED_FIELD,
        '自建提示词卡片必须填写标题和内容',
      )
    }
  }

  // ===== Sec-3: 外键校验 — 拒绝绑定不存在/软删除的 prompt/sop 文档 =====
  if (type === 'sop_doc' && data.sopDocumentId) {
    const doc = await prisma.sopDocument.findFirst({
      where: { id: data.sopDocumentId, deletedAt: null },
      select: { id: true },
    })
    if (!doc) {
      throw new AppError(
        ErrorCodes.INVALID_FORMAT,
        `SOP 文档不存在或已被删除（id: ${data.sopDocumentId}）`,
        404,
      )
    }
  }
  if (type === 'prompt' && data.promptId) {
    const p = await prisma.prompt.findFirst({
      where: { id: data.promptId, deletedAt: null },
      select: { id: true },
    })
    if (!p) {
      throw new AppError(
        ErrorCodes.INVALID_FORMAT,
        `提示词不存在或已被删除（id: ${data.promptId}）`,
        404,
      )
    }
  }

  // ===== Phase 5.3: 确定 layer =====
  let finalLayer: SopLayer | null = data.layer ?? null
  if (type === 'sop_doc' && data.sopDocumentId) {
    const doc = await prisma.sopDocument.findUnique({
      where: { id: data.sopDocumentId },
      select: { layer: true },
    })
    if (doc) {
      finalLayer = doc.layer // SOP 文档的 layer 优先，用户无法手动改
    }
  }

  // ===== Phase 5.3: 确定 assigneeId + 继承模式 =====
  let finalAssigneeId: string | null = null
  let assigneeInherit = true
  if (data.assigneeId) {
    // 手动指派 → 手动覆盖模式
    finalAssigneeId = data.assigneeId
    assigneeInherit = false
  } else if (finalLayer) {
    // 自动继承当前 layer 的负责人
    const layerAssignment = await prisma.boardLayerAssignment.findUnique({
      where: { boardId_layer: { boardId, layer: finalLayer } },
    })
    finalAssigneeId = layerAssignment?.assigneeId ?? null
    assigneeInherit = true
  }

  const selection = await prisma.boardSelection.create({
    data: {
      boardId,
      userId,
      type,
      promptId: data.promptId ?? null,
      sopDocumentId: data.sopDocumentId ?? null,
      content: data.content ?? null,
      color: data.color ?? null,
      size: (data.size ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      position: data.position,
      note: data.note,
      assigneeId: finalAssigneeId,
      assigneeInherit,
      layer: finalLayer,
      // Req 1: override 字段
      promptOverrideTitle: data.promptOverrideTitle ?? null,
      promptOverrideContent: data.promptOverrideContent ?? null,
      promptOverrideTags: data.promptOverrideTags ?? [],
    },
  })

  // Fetch related data (Req 1: include content + tags for effective calc)
  let prompt = null
  if (type === 'prompt' && data.promptId) {
    prompt = await prisma.prompt.findUnique({
      where: { id: data.promptId },
      select: {
        id: true, name: true, category: true, starCount: true, description: true,
        content: true, tags: true,
      },
    })
  }

  let sopDocument: SopDocBrief | null = null
  if (type === 'sop_doc' && data.sopDocumentId) {
    const doc = await prisma.sopDocument.findUnique({
      where: { id: data.sopDocumentId },
      select: { id: true, title: true, layer: true, sopProjectId: true },
    })
    if (doc) {
      const project = await prisma.sopProject.findUnique({
        where: { id: doc.sopProjectId },
        select: { name: true },
      })
      sopDocument = {
        id: doc.id,
        title: doc.title,
        layer: doc.layer,
        sopProjectId: doc.sopProjectId,
        sopProjectName: project?.name ?? null,
      }
    }
  }

  const createdBy = await getUserBrief(userId)
  const assignee = selection.assigneeId ? await getUserBrief(selection.assigneeId) : null
  const eff = computeEffective(selection, prompt ?? null)

  return {
    id: selection.id,
    boardId: selection.boardId,
    userId: selection.userId,
    type: selection.type,
    promptId: selection.promptId,
    sopDocumentId: selection.sopDocumentId,
    content: selection.content,
    color: selection.color,
    size: selection.size as { width: number; height: number } | null,
    position: selection.position as { x: number; y: number },
    note: selection.note,
    prompt: prompt ?? null,
    sopDocument,
    createdBy,
    assigneeId: selection.assigneeId,
    assignee,
    completedAt: selection.completedAt ? selection.completedAt.getTime() : null,
    layer: selection.layer,
    assigneeInherit: selection.assigneeInherit,
    promptOverrideTitle: selection.promptOverrideTitle,
    promptOverrideContent: selection.promptOverrideContent,
    promptOverrideTags: selection.promptOverrideTags,
    ...eff,
    createdAt: selection.createdAt.getTime(),
    updatedAt: selection.updatedAt.getTime(),
  }
}

// ========== Update Selection ==========

export async function updateSelection(
  boardId: string,
  selectionId: string,
  actingUserId: string, // 执行动作的用户，用于 activity 审计
  data: {
    position?: { x: number; y: number }
    note?: string
    content?: string
    color?: string
    size?: { width: number; height: number }
    /** 指派人。string = 手动指派（自动 assigneeInherit=false）。null = 清空手动指派并恢复继承 */
    assigneeId?: string | null
    /**
     * 切换卡片归属的 layer（例：拖拽跨 tab）。
     * - sop_doc 类型的卡片禁止手动改 layer（SOP 本身的 layer 是事实）
     * - 如果切到新 layer 且 assigneeInherit=true，会用新 layer 的负责人更新 assigneeId
     */
    layer?: SopLayer
    /**
     * 显式切换继承模式。true = 恢复继承（用新/当前 layer 负责人覆盖 assigneeId）。
     * false = 进入手动模式（保留当前 assigneeId）。
     * 如果同时传 assigneeId，以 assigneeId 的语义为准。
     */
    assigneeInherit?: boolean
    // ===== Req 1: 本地 override 字段 =====
    /** null 表示清除 override（恢复公共库），undefined 表示不改 */
    promptOverrideTitle?: string | null
    promptOverrideContent?: string | null
    promptOverrideTags?: string[]
  },
): Promise<SelectionResponse> {
  const selection = await prisma.boardSelection.findFirst({
    where: { id: selectionId, boardId },
  })

  if (!selection) {
    throw new AppError(ErrorCodes.BOARD_SELECTION_NOT_FOUND, 'Board selection not found', 404)
  }

  const updateData: Record<string, unknown> = {}
  if (data.position !== undefined) updateData.position = data.position
  if (data.note !== undefined) updateData.note = data.note
  if (data.content !== undefined) updateData.content = data.content
  if (data.color !== undefined) updateData.color = data.color
  if (data.size !== undefined) updateData.size = data.size

  // ===== Req 1: override 字段处理 =====
  if (data.promptOverrideTitle !== undefined) {
    updateData.promptOverrideTitle = data.promptOverrideTitle
  }
  if (data.promptOverrideContent !== undefined) {
    updateData.promptOverrideContent = data.promptOverrideContent
  }
  if (data.promptOverrideTags !== undefined) {
    updateData.promptOverrideTags = data.promptOverrideTags
  }

  // ===== Phase 5.3: layer 变更处理 =====
  let targetLayer: SopLayer | null = selection.layer
  if (data.layer !== undefined && data.layer !== selection.layer) {
    if (selection.type === 'sop_doc') {
      throw new AppError(
        ErrorCodes.INVALID_FORMAT,
        'SOP 文档卡片的 layer 不可手动修改（由 SOP 文档本身决定）',
      )
    }
    updateData.layer = data.layer
    targetLayer = data.layer
  }

  // ===== Phase 5.3: 指派 + 继承模式变更处理 =====
  // 几种场景：
  //   (a) 显式 assigneeId=string → 手动覆盖，inherit=false
  //   (b) 显式 assigneeId=null → 清空手动指派；默认恢复继承（重拉 layer 负责人）
  //   (c) 只传 assigneeInherit=true → 恢复继承
  //   (d) 只传 layer 变更且当前是 inherit 模式 → 重新继承新 layer 的负责人
  let assigneeAction: 'assign' | 'unassign' | 'reassign' | null = null
  let computedAssigneeId: string | null = selection.assigneeId
  let computedInherit: boolean = selection.assigneeInherit

  if (data.assigneeId !== undefined) {
    if (data.assigneeId === null) {
      // 清空手动指派 → 恢复继承
      computedInherit = true
      // 从 targetLayer 读负责人作为继承值
      if (targetLayer) {
        const la = await prisma.boardLayerAssignment.findUnique({
          where: { boardId_layer: { boardId, layer: targetLayer } },
        })
        computedAssigneeId = la?.assigneeId ?? null
      } else {
        computedAssigneeId = null
      }
    } else {
      // 手动指派
      computedAssigneeId = data.assigneeId
      computedInherit = false
    }
  } else if (data.assigneeInherit === true) {
    // 显式恢复继承
    computedInherit = true
    if (targetLayer) {
      const la = await prisma.boardLayerAssignment.findUnique({
        where: { boardId_layer: { boardId, layer: targetLayer } },
      })
      computedAssigneeId = la?.assigneeId ?? null
    } else {
      computedAssigneeId = null
    }
  } else if (data.layer !== undefined && data.layer !== selection.layer && selection.assigneeInherit) {
    // 只换 layer，且当前是 inherit 模式 → 继承新 layer 的负责人
    const la = await prisma.boardLayerAssignment.findUnique({
      where: { boardId_layer: { boardId, layer: targetLayer! } },
    })
    computedAssigneeId = la?.assigneeId ?? null
  }

  // Compute activity action + set fields if changed
  if (computedAssigneeId !== selection.assigneeId) {
    updateData.assigneeId = computedAssigneeId
    updateData.completedAt = null // 换指派人 = 重置完成状态
    if (!selection.assigneeId && computedAssigneeId) {
      assigneeAction = 'assign'
    } else if (selection.assigneeId && !computedAssigneeId) {
      assigneeAction = 'unassign'
    } else {
      assigneeAction = 'reassign'
    }
  }
  if (computedInherit !== selection.assigneeInherit) {
    updateData.assigneeInherit = computedInherit
  }

  const updated = await prisma.boardSelection.update({
    where: { id: selectionId },
    data: updateData,
  })

  if (assigneeAction) {
    await prisma.boardSelectionActivity.create({
      data: {
        selectionId: updated.id,
        action: assigneeAction,
        byId: actingUserId,
        fromUserId: selection.assigneeId ?? null,
        toUserId: computedAssigneeId ?? null,
      },
    })
  }

  // Fetch related data (Req 1: include content + tags for effective calc)
  let prompt = null
  if (updated.type === 'prompt' && updated.promptId) {
    prompt = await prisma.prompt.findUnique({
      where: { id: updated.promptId },
      select: {
        id: true, name: true, category: true, starCount: true, description: true,
        content: true, tags: true,
      },
    })
  }

  let sopDocument: SopDocBrief | null = null
  if (updated.type === 'sop_doc' && updated.sopDocumentId) {
    const doc = await prisma.sopDocument.findUnique({
      where: { id: updated.sopDocumentId },
      select: { id: true, title: true, layer: true, sopProjectId: true },
    })
    if (doc) {
      const project = await prisma.sopProject.findUnique({
        where: { id: doc.sopProjectId },
        select: { name: true },
      })
      sopDocument = {
        id: doc.id,
        title: doc.title,
        layer: doc.layer,
        sopProjectId: doc.sopProjectId,
        sopProjectName: project?.name ?? null,
      }
    }
  }

  const createdBy = await getUserBrief(updated.userId)
  const assignee = updated.assigneeId ? await getUserBrief(updated.assigneeId) : null
  const eff = computeEffective(updated, prompt ?? null)

  return {
    id: updated.id,
    boardId: updated.boardId,
    userId: updated.userId,
    type: updated.type,
    promptId: updated.promptId,
    sopDocumentId: updated.sopDocumentId,
    content: updated.content,
    color: updated.color,
    size: updated.size as { width: number; height: number } | null,
    position: updated.position as { x: number; y: number },
    note: updated.note,
    prompt: prompt ?? null,
    sopDocument,
    createdBy,
    assigneeId: updated.assigneeId,
    assignee,
    completedAt: updated.completedAt ? updated.completedAt.getTime() : null,
    layer: updated.layer,
    assigneeInherit: updated.assigneeInherit,
    promptOverrideTitle: updated.promptOverrideTitle,
    promptOverrideContent: updated.promptOverrideContent,
    promptOverrideTags: updated.promptOverrideTags,
    ...eff,
    createdAt: updated.createdAt.getTime(),
    updatedAt: updated.updatedAt.getTime(),
  }
}

// ========== Complete / Reopen Selection ==========
//
// 白板协作准备阶段：每张被指派的卡片必须由负责人"确认完成"。
// 所有指派卡片都完成 = 白板可推进到工作台（由 iteration.service.advanceIteration 检查）
//
// 权限：只有卡片的指派人或管理员能操作
// ==============================================================

/**
 * 标记卡片完成（由指派人点击确认）
 */
export async function completeSelection(
  boardId: string,
  selectionId: string,
  userId: string,
  userRole: string,
): Promise<SelectionResponse> {
  const selection = await prisma.boardSelection.findFirst({
    where: { id: selectionId, boardId },
  })

  if (!selection) {
    throw new AppError(ErrorCodes.BOARD_SELECTION_NOT_FOUND, '卡片不存在', 404)
  }

  if (!selection.assigneeId) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      '这张卡片没有指派人，不需要标记完成',
    )
  }

  // 权限：必须是指派人本人或管理员
  if (selection.assigneeId !== userId && userRole !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有卡片的指派人才能标记完成',
      403,
    )
  }

  if (selection.completedAt) {
    // 已完成的幂等：不报错，直接返回当前状态
    return buildFullSelectionResponse(selection)
  }

  const updated = await prisma.boardSelection.update({
    where: { id: selectionId },
    data: { completedAt: new Date() },
  })

  // Fix P2-8: 记录完成动作到审计日志
  await prisma.boardSelectionActivity.create({
    data: {
      selectionId: updated.id,
      action: 'complete',
      byId: userId,
    },
  })

  return buildFullSelectionResponse(updated)
}

/**
 * 撤回完成（让卡片回到未完成状态）
 */
export async function reopenSelection(
  boardId: string,
  selectionId: string,
  userId: string,
  userRole: string,
  note?: string,
): Promise<SelectionResponse> {
  const selection = await prisma.boardSelection.findFirst({
    where: { id: selectionId, boardId },
  })

  if (!selection) {
    throw new AppError(ErrorCodes.BOARD_SELECTION_NOT_FOUND, '卡片不存在', 404)
  }

  // 权限：必须是指派人本人或管理员
  if (selection.assigneeId !== userId && userRole !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有卡片的指派人才能撤回完成状态',
      403,
    )
  }

  if (!selection.completedAt) {
    return buildFullSelectionResponse(selection)
  }

  const updated = await prisma.boardSelection.update({
    where: { id: selectionId },
    data: { completedAt: null },
  })

  // Fix P2-8: 记录撤回动作到审计日志
  await prisma.boardSelectionActivity.create({
    data: {
      selectionId: updated.id,
      action: 'reopen',
      byId: userId,
      note: note ?? null,
    },
  })

  return buildFullSelectionResponse(updated)
}

// ========================================================================
// Fix P2-8: 查询白板卡片审计日志
// ========================================================================
export interface SelectionActivityRow {
  id: string
  action: string
  byId: string
  byName: string | null
  fromUserId: string | null
  fromUserName: string | null
  toUserId: string | null
  toUserName: string | null
  note: string | null
  createdAt: number
}

export async function listSelectionActivities(
  boardId: string,
  selectionId: string,
  limit: number = 50,
): Promise<SelectionActivityRow[]> {
  // 验证 selection 存在
  const selection = await prisma.boardSelection.findFirst({
    where: { id: selectionId, boardId },
  })
  if (!selection) {
    throw new AppError(ErrorCodes.BOARD_SELECTION_NOT_FOUND, '卡片不存在', 404)
  }

  const activities = await prisma.boardSelectionActivity.findMany({
    where: { selectionId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  })

  // 批量拉用户名（by / from / to）
  const userIds = new Set<string>()
  for (const a of activities) {
    userIds.add(a.byId)
    if (a.fromUserId) userIds.add(a.fromUserId)
    if (a.toUserId) userIds.add(a.toUserId)
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u.name]))

  return activities.map((a) => ({
    id: a.id,
    action: a.action,
    byId: a.byId,
    byName: userMap.get(a.byId) ?? null,
    fromUserId: a.fromUserId,
    fromUserName: a.fromUserId ? (userMap.get(a.fromUserId) ?? null) : null,
    toUserId: a.toUserId,
    toUserName: a.toUserId ? (userMap.get(a.toUserId) ?? null) : null,
    note: a.note,
    createdAt: a.createdAt.getTime(),
  }))
}

/**
 * 内部辅助：完整构造一个 SelectionResponse（含 prompt/sopDoc/assignee 等关联）
 */
async function buildFullSelectionResponse(
  selection: {
    id: string
    boardId: string
    userId: string
    type: string
    promptId: string | null
    sopDocumentId: string | null
    content: string | null
    color: string | null
    size: unknown
    position: unknown
    note: string | null
    assigneeId: string | null
    completedAt: Date | null
    layer: SopLayer | null
    assigneeInherit: boolean
    promptOverrideTitle: string | null
    promptOverrideContent: string | null
    promptOverrideTags: string[]
    createdAt: Date
    updatedAt: Date
  },
): Promise<SelectionResponse> {
  let prompt = null
  if (selection.type === 'prompt' && selection.promptId) {
    prompt = await prisma.prompt.findUnique({
      where: { id: selection.promptId },
      select: {
        id: true, name: true, category: true, starCount: true, description: true,
        content: true, tags: true,
      },
    })
  }

  let sopDocument: SopDocBrief | null = null
  if (selection.type === 'sop_doc' && selection.sopDocumentId) {
    const doc = await prisma.sopDocument.findUnique({
      where: { id: selection.sopDocumentId },
      select: { id: true, title: true, layer: true, sopProjectId: true },
    })
    if (doc) {
      const project = await prisma.sopProject.findUnique({
        where: { id: doc.sopProjectId },
        select: { name: true },
      })
      sopDocument = {
        id: doc.id,
        title: doc.title,
        layer: doc.layer,
        sopProjectId: doc.sopProjectId,
        sopProjectName: project?.name ?? null,
      }
    }
  }

  const createdBy = await getUserBrief(selection.userId)
  const assignee = selection.assigneeId ? await getUserBrief(selection.assigneeId) : null
  const eff = computeEffective(selection, prompt ?? null)

  return {
    id: selection.id,
    boardId: selection.boardId,
    userId: selection.userId,
    type: selection.type,
    promptId: selection.promptId,
    sopDocumentId: selection.sopDocumentId,
    content: selection.content,
    color: selection.color,
    size: selection.size as { width: number; height: number } | null,
    position: selection.position as { x: number; y: number },
    note: selection.note,
    prompt: prompt ?? null,
    sopDocument,
    createdBy,
    assigneeId: selection.assigneeId,
    assignee,
    completedAt: selection.completedAt ? selection.completedAt.getTime() : null,
    layer: selection.layer,
    assigneeInherit: selection.assigneeInherit,
    promptOverrideTitle: selection.promptOverrideTitle,
    promptOverrideContent: selection.promptOverrideContent,
    promptOverrideTags: selection.promptOverrideTags,
    ...eff,
    createdAt: selection.createdAt.getTime(),
    updatedAt: selection.updatedAt.getTime(),
  }
}

// ========== Remove Selection ==========

export async function removeSelection(
  boardId: string,
  selectionId: string,
): Promise<void> {
  const selection = await prisma.boardSelection.findFirst({
    where: { id: selectionId, boardId },
  })

  if (!selection) {
    throw new AppError(ErrorCodes.BOARD_SELECTION_NOT_FOUND, 'Board selection not found', 404)
  }

  await prisma.boardSelection.delete({
    where: { id: selectionId },
  })
}

// ========================================================================
// Req 1: 把卡片的本地内容 Fork 到公共提示词库
// ========================================================================

export interface ForkToLibraryResult {
  newPromptId: string
  newPromptName: string
}

/**
 * 把一张 prompt 卡片的 effective 内容保存成一条新的公共 Prompt
 *
 * 两种触发场景：
 *  1) 卡片有本地 override（修改了公共库 Prompt）→ 把修改后的版本另存为新 Prompt
 *  2) 卡片是自建的（promptId=null）→ 把自建内容发布到公共库
 *
 * 权限：卡片的创建人或 ADMIN 可以 fork
 */
export async function forkSelectionToLibrary(
  boardId: string,
  selectionId: string,
  actingUserId: string,
  actingUserRole: string,
  options: {
    /** 覆盖发布的标题（默认用 effectiveTitle） */
    name?: string
    /** 可见性 */
    visibility?: 'private' | 'team' | 'public'
    /** 分类 */
    category?: string
  } = {},
): Promise<ForkToLibraryResult> {
  const selection = await prisma.boardSelection.findFirst({
    where: { id: selectionId, boardId },
  })
  if (!selection) {
    throw new AppError(ErrorCodes.BOARD_SELECTION_NOT_FOUND, '卡片不存在', 404)
  }
  if (selection.type !== 'prompt') {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      '只有提示词类型的卡片可以保存到公共库',
    )
  }
  // 权限：只有卡片的创建人或 ADMIN 能 fork
  if (selection.userId !== actingUserId && actingUserRole !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有卡片的创建人可以保存到公共库',
      403,
    )
  }

  // 拉原 Prompt 作为回退（如果有的话）
  let originalPrompt: { name: string; content: string; tags: string[]; category: string } | null = null
  if (selection.promptId) {
    const p = await prisma.prompt.findUnique({
      where: { id: selection.promptId },
      select: { name: true, content: true, tags: true, category: true },
    })
    if (p) originalPrompt = p
  }

  // 计算最终 name/content/tags
  const name =
    options.name ||
    selection.promptOverrideTitle ||
    originalPrompt?.name ||
    '未命名提示词'
  const content =
    selection.promptOverrideContent ??
    originalPrompt?.content ??
    ''
  const tags =
    (selection.promptOverrideTags && selection.promptOverrideTags.length > 0)
      ? selection.promptOverrideTags
      : (originalPrompt?.tags ?? [])
  const category = options.category || originalPrompt?.category || 'OPTIMIZATION'

  if (!content.trim()) {
    throw new AppError(
      ErrorCodes.MISSING_REQUIRED_FIELD,
      '提示词内容为空，无法保存到公共库',
    )
  }

  // 创建新 Prompt
  const created = await prisma.prompt.create({
    data: {
      name,
      content,
      tags,
      // 使用断言：PromptCategory enum 存在于 Prisma client
      category: category as 'DESIGN' | 'FRONTEND' | 'BACKEND' | 'TESTING' | 'INTEGRATION' | 'OPTIMIZATION',
      visibility: options.visibility ?? 'private',
      sourceId: selection.promptId, // 如果是 fork 自某个公共 Prompt，记录来源
      createdById: actingUserId,
    },
  })

  return {
    newPromptId: created.id,
    newPromptName: created.name,
  }
}

// ========================================================================
// Phase 5.3: Layer 负责人管理
// ========================================================================

/**
 * 指派/改换/清空某个 layer 的负责人
 *
 * 权限：仅 ARCHITECT / ADMIN 可以操作（组长权限）
 *
 * 副作用（继承的核心）：
 *   改完 BoardLayerAssignment 后，**批量更新**本白板下所有 layer 相同且
 *   `assigneeInherit=true` 的卡片，把它们的 assigneeId 同步为新的负责人。
 *   同时清空这些卡片的 completedAt（因为换人了，之前的完成不再有效）。
 *
 * @param assigneeId null = 清空负责人
 */
export async function upsertLayerAssignment(
  boardId: string,
  layer: SopLayer,
  assigneeId: string | null,
  actingUserId: string,
  actingUserRole: string,
): Promise<LayerAssignmentRow> {
  if (actingUserRole !== 'ARCHITECT' && actingUserRole !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只有需求架构师或管理员可以指派 layer 负责人',
      403,
    )
  }

  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    select: { id: true },
  })
  if (!board) {
    throw new AppError(ErrorCodes.BOARD_NOT_FOUND, 'Board not found', 404)
  }

  // 如果 assigneeId 非空，验证用户存在
  if (assigneeId) {
    const user = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, deletedAt: true },
    })
    if (!user || user.deletedAt) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, '指定的用户不存在', 404)
    }
  }

  // Upsert layer assignment
  const la = await prisma.boardLayerAssignment.upsert({
    where: { boardId_layer: { boardId, layer } },
    update: { assigneeId, assignedById: actingUserId },
    create: { boardId, layer, assigneeId, assignedById: actingUserId },
  })

  // ===== 批量更新所有继承模式的卡片 =====
  // 条件：同一 board + 同一 layer + assigneeInherit=true
  // 效果：assigneeId 同步为新负责人，completedAt 清空（换人 = 进度作废）
  await prisma.boardSelection.updateMany({
    where: {
      boardId,
      layer,
      assigneeInherit: true,
    },
    data: {
      assigneeId,
      completedAt: null,
    },
  })

  const assignee = assigneeId ? await getUserBrief(assigneeId) : null

  return {
    layer: la.layer,
    assigneeId: la.assigneeId,
    assignee,
    assignedById: la.assignedById,
    updatedAt: la.updatedAt.getTime(),
  }
}

/**
 * 查询白板所有 layer 负责人（按 LAYER_ORDER 顺序，未指派的返回 assigneeId=null）
 */
export async function listLayerAssignments(boardId: string): Promise<LayerAssignmentRow[]> {
  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    include: { layerAssignments: true },
  })
  if (!board) {
    throw new AppError(ErrorCodes.BOARD_NOT_FOUND, 'Board not found', 404)
  }

  const userIds = new Set<string>()
  for (const la of board.layerAssignments) {
    if (la.assigneeId) userIds.add(la.assigneeId)
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, email: true, role: true, avatar: true, legacyRoles: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  const laMap = new Map(board.layerAssignments.map((la) => [la.layer, la]))

  return LAYER_ORDER.map((layer) => {
    const row = laMap.get(layer)
    return {
      layer,
      assigneeId: row?.assigneeId ?? null,
      assignee: row?.assigneeId ? userMap.get(row.assigneeId) ?? null : null,
      assignedById: row?.assignedById ?? null,
      updatedAt: row?.updatedAt.getTime() ?? 0,
    }
  })
}

// ========== Export Board ==========

interface ExportResult {
  name: string
  assembledContent: string
}

export async function exportBoard(boardId: string): Promise<ExportResult> {
  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    include: { selections: true },
  })

  if (!board) {
    throw new AppError(ErrorCodes.BOARD_NOT_FOUND, 'Board not found', 404)
  }

  // Classify selections by type
  const promptSels = board.selections.filter((s) => s.type === 'prompt' && s.promptId)
  const sopSels = board.selections.filter((s) => s.type === 'sop_doc' && s.sopDocumentId)
  const textSels = board.selections.filter((s) => s.type === 'text' && s.content)
  const stickySels = board.selections.filter((s) => s.type === 'sticky' && s.content)

  // Batch-fetch prompt content
  const promptIds = promptSels.map((s) => s.promptId!)
  const prompts = promptIds.length > 0
    ? await prisma.prompt.findMany({
        where: { id: { in: promptIds } },
        select: { id: true, name: true, category: true, content: true },
      })
    : []
  const promptMap = new Map(prompts.map((p) => [p.id, p]))

  // Batch-fetch SOP documents with prompt references (Req 7: content = composed from prompts)
  const sopDocIds = sopSels.map((s) => s.sopDocumentId!)
  const sopDocsRaw = sopDocIds.length > 0
    ? await prisma.sopDocument.findMany({
        where: { id: { in: sopDocIds }, deletedAt: null },
        select: {
          id: true,
          title: true,
          layer: true,
          description: true,
          prompts: {
            orderBy: { sortOrder: 'asc' },
            include: { prompt: { select: { name: true, content: true } } },
          },
        },
      })
    : []
  const composeSopContent = (doc: (typeof sopDocsRaw)[number]): string => {
    if (doc.prompts.length === 0) return doc.description ?? ''
    const parts: string[] = []
    if (doc.description) {
      parts.push(`> ${doc.description}`)
      parts.push('')
    }
    for (const ref of doc.prompts) {
      parts.push(`## ${ref.prompt.name}`)
      if (ref.note) parts.push(`> 备注：${ref.note}`)
      parts.push('')
      parts.push(ref.prompt.content)
      parts.push('')
    }
    return parts.join('\n').trim()
  }
  const sopDocs = sopDocsRaw.map((d) => ({
    id: d.id,
    title: d.title,
    layer: d.layer,
    content: composeSopContent(d),
  }))
  const sopDocMap = new Map(sopDocs.map((d) => [d.id, d]))

  // Assemble markdown — 3-layer feed package structure
  const sections: string[] = []

  sections.push(`# 投喂包: ${board.name}`)
  if (board.description) {
    sections.push(board.description)
  }
  sections.push('')

  // Layer 1: 提示词（公开层 — AI 执行指令）
  if (promptSels.length > 0) {
    sections.push('---')
    sections.push('## 📋 提示词（执行指令）')
    sections.push('')
    for (const sel of promptSels) {
      const prompt = promptMap.get(sel.promptId!)
      if (!prompt) continue
      sections.push(`### ${prompt.name}`)
      if (sel.note) sections.push(`> 备注: ${sel.note}`)
      sections.push('')
      sections.push(prompt.content)
      sections.push('')
    }
  }

  // Layer 2: SOP 规范（核心层 — 约束条件）
  if (sopSels.length > 0) {
    sections.push('---')
    sections.push('## 📐 规范约束（SOP）')
    sections.push('')
    for (const sel of sopSels) {
      const doc = sopDocMap.get(sel.sopDocumentId!)
      if (!doc) continue
      sections.push(`### [${doc.layer}] ${doc.title}`)
      if (sel.note) sections.push(`> 备注: ${sel.note}`)
      sections.push('')
      sections.push(doc.content)
      sections.push('')
    }
  }

  // Layer 3: 文本 + 便利贴（上下文层 — 补充信息）
  if (textSels.length > 0 || stickySels.length > 0) {
    sections.push('---')
    sections.push('## 📝 补充上下文')
    sections.push('')
    for (const sel of textSels) {
      sections.push(sel.content!)
      sections.push('')
    }
    for (const sel of stickySels) {
      sections.push(`- ${sel.content}`)
    }
    if (stickySels.length > 0) sections.push('')
  }

  return {
    name: board.name,
    assembledContent: sections.join('\n'),
  }
}
