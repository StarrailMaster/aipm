import prisma from '../prisma/client'
import { AppError, ErrorCodes } from '../utils/errors'
import type { IterationStatus } from '@prisma/client'
import { PointCategory, ContributionSourceType } from '@prisma/client'
import { awardPoints } from './contribution'

const ITERATION_NOT_FOUND = 32001

const VALID_STATUSES: IterationStatus[] = ['SPEC', 'DESIGN', 'REFINE', 'IMPLEMENT', 'ACCEPT', 'DONE']

// Status transition rules: current → allowed next statuses
const STATUS_TRANSITIONS: Record<IterationStatus, IterationStatus[]> = {
  SPEC: ['DESIGN'],
  DESIGN: ['REFINE', 'SPEC'],
  REFINE: ['IMPLEMENT', 'DESIGN'],
  IMPLEMENT: ['ACCEPT', 'REFINE'],
  ACCEPT: ['DONE', 'IMPLEMENT'],
  DONE: [],
}

const STATUS_LABELS: Record<IterationStatus, string> = {
  SPEC: '① 定规范',
  DESIGN: '② 生成设计',
  REFINE: '③ UI 精修',
  IMPLEMENT: '④ 实施',
  ACCEPT: '⑤ 验收',
  DONE: '⑥ 完成',
}

export async function listIterations(params: {
  page: number
  pageSize: number
  skip: number
  projectId?: string
  squadId?: string
  status?: string
  search?: string
}) {
  const where: Record<string, unknown> = {}
  if (params.projectId) where.projectId = params.projectId
  if (params.squadId) where.squadId = params.squadId
  if (params.status && VALID_STATUSES.includes(params.status as IterationStatus)) {
    where.status = params.status
  }
  if (params.search) {
    where.name = { contains: params.search, mode: 'insensitive' }
  }

  const [items, total] = await Promise.all([
    prisma.iteration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.pageSize,
    }),
    prisma.iteration.count({ where }),
  ])

  // Batch-fetch project & squad names
  const projectIds = [...new Set(items.map((i) => i.projectId))]
  const squadIds = [...new Set(items.map((i) => i.squadId))]

  const [projects, squads] = await Promise.all([
    projectIds.length > 0
      ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
      : [],
    squadIds.length > 0
      ? prisma.squad.findMany({ where: { id: { in: squadIds } }, select: { id: true, name: true } })
      : [],
  ])
  const projectMap = new Map(projects.map((p) => [p.id, p.name]))
  const squadMap = new Map(squads.map((s) => [s.id, s.name]))

  // Count feed packages per iteration
  const iterationIds = items.map((i) => i.id)
  const feedCounts = iterationIds.length > 0
    ? await prisma.feedPackage.groupBy({
        by: ['iterationId'],
        where: { iterationId: { in: iterationIds }, deletedAt: null },
        _count: true,
      })
    : []
  const feedCountMap = new Map(feedCounts.map((fc) => [fc.iterationId, fc._count]))

  // 批量查已完成 feed 包数（真实进度 = completedCount / totalCount）
  const feedCompletedCounts = iterationIds.length > 0
    ? await prisma.feedPackage.groupBy({
        by: ['iterationId'],
        where: { iterationId: { in: iterationIds }, deletedAt: null, status: 'DONE' },
        _count: true,
      })
    : []
  const feedCompletedMap = new Map(feedCompletedCounts.map((fc) => [fc.iterationId, fc._count]))

  // Phase B.4: 批量拉 hypothesis 简要信息（用于任务卡显示 "正在验证: ..." badge）
  const hypothesisIds = items
    .map((i) => i.hypothesisId)
    .filter((x): x is string => !!x)
  const hypotheses = hypothesisIds.length > 0
    ? await prisma.hypothesis.findMany({
        where: { id: { in: hypothesisIds } },
        select: { id: true, statement: true, status: true },
      })
    : []
  const hypothesisMap = new Map(hypotheses.map((h) => [h.id, h]))

  const mapped = items.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    projectName: projectMap.get(item.projectId) ?? null,
    squadId: item.squadId,
    squadName: squadMap.get(item.squadId) ?? null,
    name: item.name,
    status: item.status,
    statusLabel: STATUS_LABELS[item.status] ?? item.status,
    boardId: item.boardId,
    feedCount: feedCountMap.get(item.id) ?? 0,
    feedCompletedCount: feedCompletedMap.get(item.id) ?? 0,
    hypothesisId: item.hypothesisId,
    hypothesis: item.hypothesisId
      ? (() => {
          const h = hypothesisMap.get(item.hypothesisId)
          return h ? { id: h.id, statement: h.statement, status: h.status } : null
        })()
      : null,
    createdAt: item.createdAt.getTime(),
    updatedAt: item.updatedAt.getTime(),
  }))

  return { items: mapped, total }
}

export async function createIteration(data: {
  projectId: string
  squadId: string
  name: string
  userId: string
}) {
  // Validate project exists
  const project = await prisma.project.findUnique({ where: { id: data.projectId } })
  if (!project) throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '项目不存在', 404)

  // Validate squad exists
  const squad = await prisma.squad.findUnique({ where: { id: data.squadId } })
  if (!squad) throw new AppError(ErrorCodes.MISSING_REQUIRED_FIELD, '小组不存在', 404)

  // Auto-create board workspace for this task
  const board = await prisma.board.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      createdById: data.userId,
    },
  })

  const iteration = await prisma.iteration.create({
    data: {
      projectId: data.projectId,
      squadId: data.squadId,
      name: data.name,
      boardId: board.id,
    },
  })

  return {
    id: iteration.id,
    projectId: iteration.projectId,
    projectName: project.name,
    squadId: iteration.squadId,
    squadName: squad.name,
    name: iteration.name,
    status: iteration.status,
    statusLabel: STATUS_LABELS[iteration.status],
    boardId: board.id,
    feedCount: 0,
    createdAt: iteration.createdAt.getTime(),
    updatedAt: iteration.updatedAt.getTime(),
  }
}

export async function getIteration(id: string) {
  const iteration = await prisma.iteration.findUnique({ where: { id } })
  if (!iteration) throw new AppError(ITERATION_NOT_FOUND, '迭代不存在', 404)

  const [project, squad, feeds, designs, hypothesis] = await Promise.all([
    prisma.project.findUnique({ where: { id: iteration.projectId }, select: { id: true, name: true } }),
    prisma.squad.findUnique({ where: { id: iteration.squadId }, select: { id: true, name: true } }),
    prisma.feedPackage.findMany({
      where: { iterationId: id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, phase: true, status: true, sortOrder: true },
    }),
    prisma.designDraft.findMany({
      where: { iterationId: id, deletedAt: null },
      select: { id: true, name: true, status: true },
    }),
    // Phase B.2: 反向回填所属假设 + KR + Objective 基本信息
    iteration.hypothesisId
      ? prisma.hypothesis.findUnique({
          where: { id: iteration.hypothesisId },
          select: {
            id: true,
            statement: true,
            status: true,
            parentId: true,
            keyResult: {
              select: {
                id: true,
                name: true,
                objective: { select: { id: true, name: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
  ])

  return {
    id: iteration.id,
    projectId: iteration.projectId,
    projectName: project?.name ?? null,
    squadId: iteration.squadId,
    squadName: squad?.name ?? null,
    name: iteration.name,
    status: iteration.status,
    statusLabel: STATUS_LABELS[iteration.status],
    boardId: iteration.boardId,
    hypothesisId: iteration.hypothesisId,
    hypothesis: hypothesis
      ? {
          id: hypothesis.id,
          statement: hypothesis.statement,
          status: hypothesis.status,
          parentId: hypothesis.parentId,
          krId: hypothesis.keyResult.id,
          krName: hypothesis.keyResult.name,
          objectiveId: hypothesis.keyResult.objective.id,
          objectiveName: hypothesis.keyResult.objective.name,
        }
      : null,
    allowedTransitions: STATUS_TRANSITIONS[iteration.status].map((s) => ({
      status: s,
      label: STATUS_LABELS[s],
    })),
    feeds,
    designs,
    createdAt: iteration.createdAt.getTime(),
    updatedAt: iteration.updatedAt.getTime(),
  }
}

export async function updateIteration(id: string, data: { name?: string }) {
  const existing = await prisma.iteration.findUnique({ where: { id } })
  if (!existing) throw new AppError(ITERATION_NOT_FOUND, '迭代不存在', 404)

  const updated = await prisma.iteration.update({
    where: { id },
    data: { name: data.name ?? existing.name },
  })

  return {
    id: updated.id,
    name: updated.name,
    status: updated.status,
    statusLabel: STATUS_LABELS[updated.status],
    updatedAt: updated.updatedAt.getTime(),
  }
}

export async function updateIterationStatus(id: string, newStatus: string) {
  if (!VALID_STATUSES.includes(newStatus as IterationStatus)) {
    throw new AppError(ErrorCodes.INVALID_FORMAT, `无效状态: ${newStatus}，有效值: ${VALID_STATUSES.join(', ')}`)
  }

  const existing = await prisma.iteration.findUnique({ where: { id } })
  if (!existing) throw new AppError(ITERATION_NOT_FOUND, '迭代不存在', 404)

  const allowed = STATUS_TRANSITIONS[existing.status]
  if (!allowed.includes(newStatus as IterationStatus)) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `不能从「${STATUS_LABELS[existing.status]}」跳转到「${STATUS_LABELS[newStatus as IterationStatus]}」`,
    )
  }

  const updated = await prisma.iteration.update({
    where: { id },
    data: { status: newStatus as IterationStatus },
  })

  return {
    id: updated.id,
    name: updated.name,
    status: updated.status,
    statusLabel: STATUS_LABELS[updated.status],
    allowedTransitions: STATUS_TRANSITIONS[updated.status].map((s) => ({
      status: s,
      label: STATUS_LABELS[s],
    })),
    updatedAt: updated.updatedAt.getTime(),
  }
}

// ========== 推进（Advance）: SOP 文件分组 Agent 一键拆成 N 轮投喂包 ==========
//
// 架构（2026-04，Byron 最终确认版）：
//
// SOP 文档是**固定资产**。Agent 的工作是**文件分组**，不是内容生成：
//   Input:  [{ id, title, layer, excerpt }] (33 份 SOP metadata)
//   Output: [{ roundNumber, title, phase, tool, instructions, notes, documentIds }]
//
// 每一轮 FeedPackage 里的 FeedFile：
//   - `00-Prompt（复制这段给 AI）.md` — 入口文件，后端按模板本地生成
//   - `{docTitle}.md` × N — 直接复制对应 SOP 文档的**原始 content**，一字不改
//
// 为什么这样做？Byron 原话：
//   "我的 sop 文件是固定的... 你只是把我的文件重新放到每一轮的文件夹中...
//    因为第一轮可能是每个文件夹找一个文件，非常不好操作"
//
// Agent 省的是"从 7 个 SOP 分类文件夹里手动挑文件"的体力活。
//
// 性能：1 次 AI 调用（~5-15s），不再是旧架构的 10 次并行生成（~60-120s）
// ============================================================================

export async function advanceIteration(id: string, userId: string) {
  const iteration = await prisma.iteration.findUnique({ where: { id } })
  if (!iteration) throw new AppError(ITERATION_NOT_FOUND, '迭代不存在', 404)

  // 1. 必须有关联的白板
  if (!iteration.boardId) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      '此任务未关联工作台，无法推进。请先在工作台添加 SOP 文档。',
    )
  }

  // 2. 查白板（含所有 selections）
  const board = await prisma.board.findFirst({
    where: { id: iteration.boardId, deletedAt: null },
    include: { selections: true },
  })
  if (!board) {
    throw new AppError(ErrorCodes.INVALID_FORMAT, '白板不存在或已删除', 404)
  }

  // ===== 流程闭环 Gate #1：白板协作准备阶段完成度检查 =====
  //
  // 白板是项目启动前的多角色协作准备阶段（需求架构师整理需求、设计师做规范、
  // 实施工程师整理技术约束等）。每张被指派的卡片都必须由负责人完成并确认后，
  // 才允许推进到工作台。
  //
  // 规则：任何类型的 selection（prompt/sop_doc/text/sticky）只要 assigneeId 非空
  // 且 completedAt 为空，就算"未完成"。没有 assigneeId 的卡片不参与闭环检查。
  //
  // 注意：这个 gate 必须在"SOP 存在性检查"之前，因为团队协作期可能还没把
  // SOP 文档拖到白板上，但卡片完成度是用户先能感知到的（"还有谁没完成"）。
  const incompleteCards = board.selections.filter(
    (s) => s.assigneeId && !s.completedAt,
  )
  if (incompleteCards.length > 0) {
    // 批量拉指派人姓名，生成友好错误信息
    const assigneeIds = Array.from(new Set(incompleteCards.map((c) => c.assigneeId!)))
    const assignees = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true },
    })
    const assigneeMap = new Map(assignees.map((u) => [u.id, u.name]))
    const preview = incompleteCards
      .slice(0, 5)
      .map((c) => {
        const name = assigneeMap.get(c.assigneeId!) ?? '未知用户'
        const label = c.type === 'prompt' ? '提示词卡片' : c.type === 'sop_doc' ? 'SOP 卡片' : c.type
        return `${label}（指派给 ${name}）`
      })
      .join('、')
    const suffix = incompleteCards.length > 5 ? ` 等 ${incompleteCards.length} 张` : ''
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `白板准备阶段尚有 ${incompleteCards.length} 张卡片未完成：${preview}${suffix}。请所有负责人确认完成后再推进。`,
    )
  }

  // ===== 流程闭环 Gate #2：SOP 存在性检查 =====
  // 所有人准备完成后，白板上必须至少有一份 SOP 文档作为工作台包的原材料
  const sopSelections = board.selections.filter(
    (s) => s.type === 'sop_doc' && s.sopDocumentId,
  )
  if (sopSelections.length === 0) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      '白板上没有任何 SOP 文档。请先在工作台添加 SOP 卡片后再推进。',
    )
  }

  // 3. 去重 + 拉取 SOP 文档 + 拼接引用 Prompt 组装"有效 content"
  //    Req 7: SopDocument 不再持有 content，而是引用一组 Prompt，这里把 Prompt 按 sortOrder 拼接
  const docIds = Array.from(new Set(sopSelections.map((s) => s.sopDocumentId!).filter(Boolean)))
  const sopDocsRaw = await prisma.sopDocument.findMany({
    where: { id: { in: docIds }, deletedAt: null },
    select: {
      id: true,
      title: true,
      layer: true,
      description: true,
      prompts: {
        orderBy: { sortOrder: 'asc' },
        include: {
          prompt: { select: { name: true, content: true } },
        },
      },
    },
  })

  if (sopDocsRaw.length === 0) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      '白板引用的 SOP 文档都已被删除，无法拆解',
      404,
    )
  }

  // 本地 helper：把 SopDocument 的引用 Prompt 拼接成一段 markdown content
  const assembleSopDocContent = (doc: (typeof sopDocsRaw)[number]): string => {
    if (doc.prompts.length === 0) {
      // 没引用任何 prompt 的 SOP 只有 description 作为内容
      return doc.description ?? ''
    }
    const parts: string[] = []
    if (doc.description) {
      parts.push(`> ${doc.description}`)
      parts.push('')
    }
    for (const ref of doc.prompts) {
      parts.push(`## ${ref.prompt.name}`)
      if (ref.note) {
        parts.push(`> 备注：${ref.note}`)
      }
      parts.push('')
      parts.push(ref.prompt.content)
      parts.push('')
    }
    return parts.join('\n').trim()
  }

  // 把每个 doc 预先拼接好 content，供下游 Agent / FeedFile 使用
  const sopDocs = sopDocsRaw.map((d) => ({
    id: d.id,
    title: d.title,
    layer: d.layer,
    content: assembleSopDocContent(d),
  }))

  const docMap = new Map(sopDocs.map((d) => [d.id, d]))

  // 4. 构造给 Agent 的 metadata（只传 title/layer/前500字摘要，不传全文）
  const EXCERPT_LEN = 500
  const agentInput = sopDocs.map((d) => ({
    id: d.id,
    title: d.title,
    layer: d.layer as string,
    excerpt: d.content.slice(0, EXCERPT_LEN),
    fullLength: d.content.length,
  }))

  // 5. 运行文件分组 Agent（单次 AI 调用）
  //    注意：不传 iteration.status — Agent 应该一次性产出完整推进计划（Fix C）
  // Fix 10 / D19: 迁移到 services/sop-split/（seam 层，后续物理搬家）
  const { runSopSplitAgent, buildRoundEntryMarkdown } = await import('./sop-split')
  let agentResult
  try {
    agentResult = await runSopSplitAgent(iteration.name, agentInput)
  } catch (err) {
    const msg = (err as Error)?.message ?? 'SOP 分组 Agent 调用失败'
    throw new AppError(ErrorCodes.INVALID_FORMAT, msg, 500)
  }

  if (agentResult.rounds.length === 0) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      'Agent 未能规划出任何轮次，请检查白板 SOP 文档是否足够',
      500,
    )
  }

  // 6. 覆盖模式：先软删除当前任务下所有现有投喂包
  //    关键：必须先软删除这些包**已关联的 FEED_PUSH DesignDraft**，否则
  //    设计师会看到"幽灵设计任务"（父包已删但子草稿还在）
  const doomedFeeds = await prisma.feedPackage.findMany({
    where: {
      iterationId: id,
      deletedAt: null,
      designDraftId: { not: null },
    },
    select: { designDraftId: true },
  })
  const doomedDraftIds = doomedFeeds
    .map((f) => f.designDraftId)
    .filter((id): id is string => id !== null)
  if (doomedDraftIds.length > 0) {
    await prisma.designDraft.updateMany({
      where: {
        id: { in: doomedDraftIds },
        sourceType: 'FEED_PUSH',
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })
  }

  const resetRes = await prisma.feedPackage.updateMany({
    where: { iterationId: id, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  const resetDeletedCount = resetRes.count

  // 7. 为每一轮创建 FeedPackage + FeedFiles
  //    文件布局：
  //      00-Prompt（复制这段给 AI）.md  (本地模板生成，layer=core)
  //      {docTitle-1}.md              (原始 SOP 内容，layer=context)
  //      {docTitle-2}.md              (原始 SOP 内容，layer=context)
  //      ...
  const createdPackages: Array<{
    id: string
    sortOrder: number
    roundNumber: number
    title: string
    phase: string
    fileCount: number
  }> = []

  // ===== S-5 自动分配负责人 =====
  // agent 生成 feed 不填 assignee → 工程师"我的待办"永远空。
  // 这里预先拉取本任务 squad 的 DESIGNER / ENGINEER 成员，
  // 然后按 feed.phase 对号入座、round-robin 分配。
  const squadMembers = await prisma.user.findMany({
    where: { squadId: iteration.squadId, deletedAt: null },
    select: { id: true, role: true, name: true },
  })
  const designers = squadMembers.filter((m) => m.role === 'DESIGNER')
  const engineers = squadMembers.filter((m) => m.role === 'ENGINEER')
  // round-robin 计数器
  const cursor = { DESIGN: 0, IMPLEMENT: 0 }

  function pickAssignee(phase: 'DESIGN' | 'IMPLEMENT'): string | null {
    const pool = phase === 'DESIGN' ? designers : engineers
    if (pool.length === 0) return null
    const idx = cursor[phase] % pool.length
    cursor[phase] += 1
    return pool[idx].id
  }

  for (const round of agentResult.rounds) {
    const sortOrder = round.roundNumber
    const phase = round.phase === 'DESIGN' ? 'DESIGN' : 'IMPLEMENT'
    const assigneeId = pickAssignee(phase as 'DESIGN' | 'IMPLEMENT')

    const pkg = await prisma.feedPackage.create({
      data: {
        iterationId: id,
        name: `第 ${sortOrder} 轮 · ${round.title}`,
        phase,
        status: 'PENDING',
        sortOrder,
        createdById: userId,
        assigneeId, // S-5: 自动轮询分配同组对应角色成员
      },
    })

    // 7a. 本轮要放的 SOP 文档（过滤掉已删除或找不到的）
    const roundDocs = round.documentIds
      .map((docId) => docMap.get(docId))
      .filter((d): d is (typeof sopDocs)[number] => !!d)

    // 7b. 生成入口文件 00-Prompt（复制这段给 AI）.md（本地模板，无 AI）
    const entryContent = buildRoundEntryMarkdown(
      iteration.name,
      round,
      roundDocs.map((d) => ({ id: d.id, title: d.title, layer: d.layer as string })),
    )

    await prisma.feedFile.create({
      data: {
        feedPackageId: pkg.id,
        name: '00-Prompt（复制这段给 AI）.md',
        content: entryContent,
        layer: 'core',
      },
    })

    // 7c. 每份分配到本轮的 SOP 文档都作为独立 FeedFile 存入
    //     content = 原始文档 content，一字不改
    for (const doc of roundDocs) {
      // 文件名加 .md 后缀方便用户下载/辨认
      const fileName = doc.title.endsWith('.md') ? doc.title : `${doc.title}.md`
      await prisma.feedFile.create({
        data: {
          feedPackageId: pkg.id,
          name: fileName,
          content: doc.content ?? '',
          layer: 'context',
        },
      })
    }

    createdPackages.push({
      id: pkg.id,
      sortOrder,
      roundNumber: round.roundNumber,
      title: round.title,
      phase: round.phase,
      fileCount: 1 + roundDocs.length, // 入口 + 原始 SOP 文件数
    })
  }

  // 8. 补 dependsOn（需要先有所有 package ID 才能连接依赖）
  const agentRoundToPkgId = new Map<number, string>()
  for (let i = 0; i < agentResult.rounds.length; i++) {
    agentRoundToPkgId.set(agentResult.rounds[i].roundNumber, createdPackages[i].id)
  }

  for (let i = 0; i < agentResult.rounds.length; i++) {
    const round = agentResult.rounds[i]
    if (round.dependsOnRounds.length === 0) continue

    const depIds = round.dependsOnRounds
      .map((n) => agentRoundToPkgId.get(n))
      .filter((x): x is string => !!x)

    if (depIds.length > 0) {
      await prisma.feedPackage.update({
        where: { id: createdPackages[i].id },
        data: { dependsOn: depIds },
      })
    }
  }

  // 9. S-3 修复：iteration.status 根据 agent 实际产出的 phase 决定下一个状态
  //    - 有 DESIGN 轮次 → 进入 DESIGN
  //    - 只有 IMPLEMENT 轮次 → 跳过 DESIGN/REFINE 直接到 IMPLEMENT
  //    这样前端看到的 feed.phase 和 iteration.status 永远是一致的
  if (iteration.status === 'SPEC') {
    const hasDesignRound = agentResult.rounds.some((r) => r.phase === 'DESIGN')
    const nextStatus: IterationStatus = hasDesignRound ? 'DESIGN' : 'IMPLEMENT'
    await prisma.iteration.update({
      where: { id },
      data: { status: nextStatus },
    })
  }
  // 再调一次通用自动流转，确保状态指向最合适的位置
  await autoAdvanceIterationStatus(id)

  // 10. Contribution points: first_used_in_workbench 事件（对 Prompt 原作者）
  //     和 first_used_in_iteration 事件（对 SopProject 原作者）
  //     不阻塞主流程 —— 任何失败都静默忽略
  try {
    // 收集本次推进涉及到的所有 SopDocument id
    const sopDocIds = sopDocsRaw.map((d) => d.id)

    // a) 查这些 SopDocument 引用的所有 Prompt（去重），附带 prompt 基本信息
    const promptRefs = await prisma.sopDocumentPrompt.findMany({
      where: { sopDocumentId: { in: sopDocIds } },
      select: {
        promptId: true,
        prompt: { select: { id: true, name: true, createdById: true } },
      },
    })
    const uniquePromptMap = new Map<
      string,
      { id: string; name: string; createdById: string }
    >()
    for (const ref of promptRefs) {
      if (ref.prompt && !uniquePromptMap.has(ref.prompt.id)) {
        uniquePromptMap.set(ref.prompt.id, ref.prompt)
      }
    }

    // b) 给每个 Prompt 的原作者发"首次推进到工作台"事件 (+6 value)
    for (const p of uniquePromptMap.values()) {
      await awardPoints({
        userId: p.createdById,
        eventKey: `first_used_in_workbench:prompt:${p.id}`,
        eventType: 'first_used_in_workbench',
        category: PointCategory.value,
        sourceType: ContributionSourceType.prompt,
        sourceId: p.id,
        points: 6,
        reason: `你创建的提示词「${p.name}」首次被推进到工作台`,
      })
    }

    // c) 收集本次推进涉及的所有 SopProject id（通过 sopProjectId 去重）
    const sopProjectIdSet = new Set<string>()
    const sopDocsWithProject = await prisma.sopDocument.findMany({
      where: { id: { in: sopDocIds } },
      select: { sopProjectId: true },
    })
    for (const d of sopDocsWithProject) sopProjectIdSet.add(d.sopProjectId)

    if (sopProjectIdSet.size > 0) {
      const sopProjects = await prisma.sopProject.findMany({
        where: { id: { in: Array.from(sopProjectIdSet) } },
        select: { id: true, name: true, createdById: true },
      })
      for (const sp of sopProjects) {
        await awardPoints({
          userId: sp.createdById,
          eventKey: `first_used_in_iteration:sop_project:${sp.id}`,
          eventType: 'first_used_in_iteration',
          category: PointCategory.value,
          sourceType: ContributionSourceType.sop_project,
          sourceId: sp.id,
          points: 20,
          reason: `你创建的 SOP 模板「${sp.name}」首次被推进到工作台`,
        })
      }
    }
  } catch (err) {
    // 非关键路径：积分发放失败不影响 advance 主流程
    console.error('[iteration-advance] contribution points error:', (err as Error).message)
  }

  // 重查一次最新的 iteration 状态（可能被自动流转推进过）
  const finalIteration = await prisma.iteration.findUnique({ where: { id } })
  const finalStatus = finalIteration?.status ?? iteration.status

  return {
    id: iteration.id,
    name: iteration.name,
    status: finalStatus,
    statusLabel: STATUS_LABELS[finalStatus] ?? finalStatus,
    allowedTransitions: STATUS_TRANSITIONS[finalStatus].map((s) => ({
      status: s,
      label: STATUS_LABELS[s],
    })),
    feedPackageId: createdPackages[0]?.id ?? null, // 兼容旧字段
    updatedAt: iteration.updatedAt.getTime(),
    agentResult: {
      resetDeletedCount,
      reasoning: agentResult.reasoning,
      plannedCount: agentResult.rounds.length,
      generatedCount: createdPackages.length,
      failedCount: 0,
      totalDocuments: sopDocs.length,
      unassignedDocumentCount: agentResult.unassignedDocumentIds.length,
      rounds: createdPackages.map((p) => ({
        id: p.id,
        sortOrder: p.sortOrder,
        title: p.title,
        phase: p.phase,
        fileCount: p.fileCount,
      })),
      failures: [] as Array<{ roundNumber: number; title: string; error: string }>,
    },
  }
}

export async function deleteIteration(id: string, opts?: { cascade?: boolean }) {
  const existing = await prisma.iteration.findUnique({ where: { id } })
  if (!existing) throw new AppError(ITERATION_NOT_FOUND, '迭代不存在', 404)

  // A-6: 默认要求显式级联删除，避免误删
  // cascade=true 时把所有 feed 包一起软删除；false 时若有 feed 直接拒绝
  const feedCount = await prisma.feedPackage.count({
    where: { iterationId: id, deletedAt: null },
  })
  if (feedCount > 0 && !opts?.cascade) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      `该任务下有 ${feedCount} 个工作台包。请使用 ?cascade=true 级联删除，或先清空工作台包。`,
    )
  }

  if (feedCount > 0) {
    // 级联软删 feed 包 + 关联的 feed files + execution records
    await prisma.feedPackage.updateMany({
      where: { iterationId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  }

  // 同步软删 board（如果存在），避免再产生孤儿 board
  if (existing.boardId) {
    await prisma.board.updateMany({
      where: { id: existing.boardId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  }

  await prisma.iteration.delete({ where: { id } })
}

// ========================================================================
// Fix P3-9: iteration.status 自动流转
// ========================================================================
//
// 由以下触发点调用：
//   - advanceIteration 成功后（SPEC → DESIGN）
//   - feed.pushToDesign 后（DESIGN → REFINE，首次进入审核期）
//   - feed.approveDesign 后（REFINE → IMPLEMENT，所有审核通过）
//   - feed.updateStatus 后（→ ACCEPT，所有工作台包完成）
//
// 规则（只前进不后退）：
//   SPEC       → DESIGN   : 由 advanceIteration 触发
//   DESIGN     → REFINE   : 任一工作台包被推给设计审核（PENDING_REVIEW 出现）
//   DESIGN     → ACCEPT   : 所有包都 DONE 且所有需要设计图的都 APPROVED（跳过 REFINE/IMPLEMENT）
//   REFINE     → IMPLEMENT: 所有需要设计图的包都 APPROVED 且无 PENDING_REVIEW
//   REFINE     → ACCEPT   : 所有包都 DONE（同时满足审核）
//   IMPLEMENT  → ACCEPT   : 所有包都 DONE 且所有需要设计图的都 APPROVED
//   ACCEPT     → (手动)    : 验收是主观判断，必须手动标 DONE
//   DONE       → (终态)    : 不自动变化
//
// 注意：这个函数绕过 STATUS_TRANSITIONS 做系统级更新（它代表明确的业务规则
// 满足，不是用户手动切换）。如果手动 updateIterationStatus 走的是 VALID 路径。
//
// 不抛错：如果 iteration 不存在或状态不合法就悄悄跳过（非关键路径，不应阻塞调用方）
// ========================================================================
export async function autoAdvanceIterationStatus(iterationId: string): Promise<void> {
  try {
    const iter = await prisma.iteration.findUnique({
      where: { id: iterationId },
      select: { id: true, status: true },
    })
    if (!iter) return
    if (iter.status === 'DONE' || iter.status === 'ACCEPT') return

    // 查所有该迭代的工作台包
    const packages = await prisma.feedPackage.findMany({
      where: { iterationId, deletedAt: null },
      select: {
        phase: true,
        status: true,
        designOutputRequired: true,
        designReviewStatus: true,
      },
    })

    if (packages.length === 0) return

    const hasAnyPendingReview = packages.some(
      (p) => p.designReviewStatus === 'PENDING_REVIEW',
    )
    const allNeedingDesignApproved = packages
      .filter((p) => p.designOutputRequired)
      .every((p) => p.designReviewStatus === 'APPROVED')
    const allDone = packages.every((p) => p.status === 'DONE')

    let nextStatus: IterationStatus | null = null

    switch (iter.status) {
      case 'SPEC':
        // SPEC → DESIGN 只在 advanceIteration 里显式处理，这里不动
        break

      case 'DESIGN':
        if (allDone && allNeedingDesignApproved) {
          // 极端场景：所有包一气呵成都完成了，直接跳到 ACCEPT
          nextStatus = 'ACCEPT'
        } else if (hasAnyPendingReview) {
          // 进入设计审核期
          nextStatus = 'REFINE'
        }
        break

      case 'REFINE':
        if (allDone && allNeedingDesignApproved) {
          nextStatus = 'ACCEPT'
        } else if (allNeedingDesignApproved && !hasAnyPendingReview) {
          // 所有审核完成，进入实施期
          nextStatus = 'IMPLEMENT'
        }
        break

      case 'IMPLEMENT':
        if (allDone && allNeedingDesignApproved) {
          nextStatus = 'ACCEPT'
        }
        break
    }

    if (nextStatus && nextStatus !== iter.status) {
      await prisma.iteration.update({
        where: { id: iterationId },
        data: { status: nextStatus },
      })
      console.log(
        `[iteration-auto-advance] ${iterationId.slice(0, 8)} ${iter.status} → ${nextStatus}`,
      )
    }
  } catch (err) {
    // 非关键路径，不抛错
    console.error('[iteration-auto-advance] error:', (err as Error).message)
  }
}
