#!/usr/bin/env tsx
/**
 * 贡献积分历史回填脚本
 *
 * 把上线前已存在的 Prompt / Skill / SOP / PR / Star / Fork / advance 记录
 * 对应的贡献积分补发出来。
 *
 * 幂等：多次运行安全（依赖 ContributionPoint.eventKey 的唯一约束）。
 *
 * 用法：
 *   cd packages/server && npx tsx scripts/backfill-contribution-points.ts
 */
import type { AwardInput } from '../src/services/contribution'
import { PointCategory, ContributionSourceType } from '@prisma/client'
import prisma from '../src/prisma/client'
import { awardPoints } from '../src/services/contribution'

// ------------------------------------------------------------------
// 工具
// ------------------------------------------------------------------

interface StepCounter {
  granted: number
  skipped: number
}

function newCounter(): StepCounter {
  return { granted: 0, skipped: 0 }
}

function tag(granted: boolean): string {
  return granted ? '[award]' : '[skip] '
}

function fmtName(s: string): string {
  return s.length > 40 ? `${s.slice(0, 40)}...` : s
}

/**
 * 预检查 + 调 awardPoints，避免在幂等路径上触发 Prisma 的 P2002 error 日志。
 * 已存在 → 直接返回 false。
 * 不存在 → 调 awardPoints（仍然会走 create + P2002 catch 兜底，但竞争场景很罕见）。
 */
async function safeAward(input: AwardInput): Promise<boolean> {
  const existing = await prisma.contributionPoint.findUnique({
    where: { eventKey: input.eventKey },
    select: { id: true },
  })
  if (existing) return false
  return awardPoints(input)
}

// 里程碑积分表（与 services/contribution/index.ts 保持一致）
const STAR_POINTS: Record<number, number> = { 1: 5, 5: 10, 10: 20, 25: 40 }
const FORK_POINTS: Record<number, number> = { 1: 8, 5: 15 }
const STAR_THRESHOLDS = [1, 5, 10, 25]
const FORK_THRESHOLDS = [1, 5]

/**
 * 里程碑发放（脚本本地版本）：
 * 和 checkAndAwardMilestones 的行为保持一致，但使用 safeAward 做预检查，避免重复运行时的噪声日志。
 * 返回这次发放的新里程碑数。
 */
async function grantMilestones(params: {
  ownerId: string
  sourceType: ContributionSourceType
  sourceId: string
  sourceName: string
  currentCount: number
  kind: 'star' | 'fork'
}): Promise<number> {
  const { ownerId, sourceType, sourceId, sourceName, currentCount, kind } = params

  const thresholds = kind === 'star' ? STAR_THRESHOLDS : FORK_THRESHOLDS
  const pointsTable = kind === 'star' ? STAR_POINTS : FORK_POINTS
  const eventType = kind === 'star' ? 'star_milestone' : 'fork_milestone'
  const labelPrefix = kind === 'star' ? '收藏数达到' : 'Fork 数达到'

  let granted = 0
  for (const threshold of thresholds) {
    if (currentCount < threshold) continue
    const points = pointsTable[threshold]
    if (!points || points <= 0) continue
    const eventKey = `${kind}_milestone_${threshold}:${sourceType}:${sourceId}`
    const reason = `「${sourceName}」${labelPrefix} ${threshold} ${kind === 'star' ? '颗星' : '次'}`
    const ok = await safeAward({
      userId: ownerId,
      eventKey,
      eventType,
      category: PointCategory.value,
      sourceType,
      sourceId,
      points,
      reason,
    })
    if (ok) granted += 1
  }
  return granted
}

// ------------------------------------------------------------------
// Step 1: Prompt 创建 (+10 base)
// ------------------------------------------------------------------
async function step1_promptCreate(): Promise<StepCounter> {
  console.log('\n[backfill] Step 1: Prompt creation events...')
  const c = newCounter()
  const prompts = await prisma.prompt.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, createdById: true },
  })
  for (const p of prompts) {
    const granted = await safeAward({
      userId: p.createdById,
      eventKey: `create:prompt:${p.id}`,
      eventType: 'create',
      category: PointCategory.base,
      sourceType: ContributionSourceType.prompt,
      sourceId: p.id,
      points: 10,
      reason: `创建提示词「${p.name}」`,
    })
    console.log(`  ${tag(granted)} create:prompt:${p.id} "创建提示词「${fmtName(p.name)}」" → ${granted ? 'granted' : 'already exists'}`)
    granted ? c.granted++ : c.skipped++
  }
  console.log(`Step 1 summary: ${c.granted} granted, ${c.skipped} skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 2: Skill 创建 (+10 base)
// ------------------------------------------------------------------
async function step2_skillCreate(): Promise<StepCounter> {
  console.log('\n[backfill] Step 2: Skill creation events...')
  const c = newCounter()
  const skills = await prisma.skill.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, createdById: true },
  })
  for (const s of skills) {
    const granted = await safeAward({
      userId: s.createdById,
      eventKey: `create:skill:${s.id}`,
      eventType: 'create',
      category: PointCategory.base,
      sourceType: ContributionSourceType.skill,
      sourceId: s.id,
      points: 10,
      reason: `创建 Skill「${s.name}」`,
    })
    console.log(`  ${tag(granted)} create:skill:${s.id} "创建 Skill「${fmtName(s.name)}」" → ${granted ? 'granted' : 'already exists'}`)
    granted ? c.granted++ : c.skipped++
  }
  console.log(`Step 2 summary: ${c.granted} granted, ${c.skipped} skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 3: SopProject 创建 (+15 base)
// ------------------------------------------------------------------
async function step3_sopProjectCreate(): Promise<StepCounter> {
  console.log('\n[backfill] Step 3: SopProject creation events...')
  const c = newCounter()
  const projects = await prisma.sopProject.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, createdById: true },
  })
  for (const sp of projects) {
    const granted = await safeAward({
      userId: sp.createdById,
      eventKey: `create:sop_project:${sp.id}`,
      eventType: 'create',
      category: PointCategory.base,
      sourceType: ContributionSourceType.sop_project,
      sourceId: sp.id,
      points: 15,
      reason: `创建 SOP 模板「${sp.name}」`,
    })
    console.log(`  ${tag(granted)} create:sop_project:${sp.id} "创建 SOP 模板「${fmtName(sp.name)}」" → ${granted ? 'granted' : 'already exists'}`)
    granted ? c.granted++ : c.skipped++
  }
  console.log(`Step 3 summary: ${c.granted} granted, ${c.skipped} skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 4: SopDocument 创建 (+5 base)
// ------------------------------------------------------------------
async function step4_sopDocumentCreate(): Promise<StepCounter> {
  console.log('\n[backfill] Step 4: SopDocument creation events...')
  const c = newCounter()
  const docs = await prisma.sopDocument.findMany({
    where: { deletedAt: null },
    include: { sopProject: { select: { name: true } } },
  })
  for (const d of docs) {
    const granted = await safeAward({
      userId: d.createdById,
      eventKey: `create:sop_doc:${d.id}`,
      eventType: 'create',
      category: PointCategory.base,
      sourceType: ContributionSourceType.sop_document,
      sourceId: d.id,
      points: 5,
      reason: `为 SOP 模板「${d.sopProject?.name ?? '未知'}」创建文档「${d.title}」`,
    })
    console.log(`  ${tag(granted)} create:sop_doc:${d.id} "为「${fmtName(d.sopProject?.name ?? '未知')}」创建文档「${fmtName(d.title)}」" → ${granted ? 'granted' : 'already exists'}`)
    granted ? c.granted++ : c.skipped++
  }
  console.log(`Step 4 summary: ${c.granted} granted, ${c.skipped} skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 5: PromptPr 创建 (+2 base, 给 submittedById)
// ------------------------------------------------------------------
async function step5_promptPrCreate(): Promise<StepCounter> {
  console.log('\n[backfill] Step 5: PromptPr creation events...')
  const c = newCounter()
  const prs = await prisma.promptPr.findMany({
    include: { prompt: { select: { name: true } } },
  })
  for (const pr of prs) {
    const granted = await safeAward({
      userId: pr.submittedById,
      eventKey: `create:prompt_pr:${pr.id}`,
      eventType: 'create',
      category: PointCategory.base,
      sourceType: ContributionSourceType.prompt_pr,
      sourceId: pr.id,
      points: 2,
      reason: `为「${pr.prompt?.name ?? '未知提示词'}」提交改进建议`,
    })
    console.log(`  ${tag(granted)} create:prompt_pr:${pr.id} "为「${fmtName(pr.prompt?.name ?? '未知')}」提交改进建议" → ${granted ? 'granted' : 'already exists'}`)
    granted ? c.granted++ : c.skipped++
  }
  console.log(`Step 5 summary: ${c.granted} granted, ${c.skipped} skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 6: PromptPr MERGED (+10 submitter value, +5 original value)
// ------------------------------------------------------------------
async function step6_promptPrMerged(): Promise<StepCounter> {
  console.log('\n[backfill] Step 6: PromptPr merge events...')
  const c = newCounter()
  const prs = await prisma.promptPr.findMany({
    where: { status: 'MERGED' },
    include: { prompt: { select: { id: true, name: true, createdById: true } } },
  })
  for (const pr of prs) {
    // 给提交者：+10 value
    const g1 = await safeAward({
      userId: pr.submittedById,
      eventKey: `pr_merged_submitter:prompt_pr:${pr.id}`,
      eventType: 'pr_merged_submitter',
      category: PointCategory.value,
      sourceType: ContributionSourceType.prompt_pr,
      sourceId: pr.id,
      points: 10,
      reason: `对「${pr.prompt?.name ?? '未知提示词'}」的改进建议被合并`,
    })
    console.log(`  ${tag(g1)} pr_merged_submitter:prompt_pr:${pr.id} → ${g1 ? 'granted' : 'already exists'}`)
    g1 ? c.granted++ : c.skipped++

    // 给原作者：+5 value（如果不是自己合并自己）
    if (pr.prompt && pr.submittedById !== pr.prompt.createdById) {
      const g2 = await safeAward({
        userId: pr.prompt.createdById,
        eventKey: `pr_merged_original:prompt_pr:${pr.id}`,
        eventType: 'pr_merged_original',
        category: PointCategory.value,
        sourceType: ContributionSourceType.prompt,
        sourceId: pr.prompt.id,
        points: 5,
        reason: `你创建的「${pr.prompt.name}」收到了被合并的改进`,
      })
      console.log(`  ${tag(g2)} pr_merged_original:prompt_pr:${pr.id} → ${g2 ? 'granted' : 'already exists'}`)
      g2 ? c.granted++ : c.skipped++
    }
  }
  console.log(`Step 6 summary: ${c.granted} granted, ${c.skipped} skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 7: Prompt star milestones
// ------------------------------------------------------------------
async function step7_promptStarMilestones(): Promise<StepCounter> {
  console.log('\n[backfill] Step 7: Prompt star milestones...')
  const c = newCounter()
  const prompts = await prisma.prompt.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, createdById: true },
  })
  for (const p of prompts) {
    const stars = await prisma.star.findMany({
      where: { targetType: 'prompt', promptId: p.id },
      select: { userId: true },
    })
    // 排除自己给自己星
    const netStarCount = stars.filter((s) => s.userId !== p.createdById).length
    if (netStarCount <= 0) continue

    const delta = await grantMilestones({
      ownerId: p.createdById,
      sourceType: ContributionSourceType.prompt,
      sourceId: p.id,
      sourceName: p.name,
      currentCount: netStarCount,
      kind: 'star',
    })
    if (delta > 0) {
      console.log(
        `  [award] star_milestone:prompt:${p.id} "「${fmtName(p.name)}」净 star=${netStarCount}" → granted ${delta} milestones`,
      )
      c.granted += delta
    } else {
      console.log(
        `  [skip]  star_milestone:prompt:${p.id} "「${fmtName(p.name)}」净 star=${netStarCount}" → already exists`,
      )
      c.skipped++
    }
  }
  console.log(`Step 7 summary: ${c.granted} milestones granted, ${c.skipped} prompts skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 8: Prompt fork milestones
// ------------------------------------------------------------------
async function step8_promptForkMilestones(): Promise<StepCounter> {
  console.log('\n[backfill] Step 8: Prompt fork milestones...')
  const c = newCounter()
  const prompts = await prisma.prompt.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, createdById: true },
  })
  for (const p of prompts) {
    const forks = await prisma.prompt.findMany({
      where: { sourceId: p.id, deletedAt: null },
      select: { createdById: true },
    })
    const netForkCount = forks.filter((f) => f.createdById !== p.createdById).length
    if (netForkCount <= 0) continue

    const delta = await grantMilestones({
      ownerId: p.createdById,
      sourceType: ContributionSourceType.prompt,
      sourceId: p.id,
      sourceName: p.name,
      currentCount: netForkCount,
      kind: 'fork',
    })
    if (delta > 0) {
      console.log(
        `  [award] fork_milestone:prompt:${p.id} "「${fmtName(p.name)}」净 fork=${netForkCount}" → granted ${delta} milestones`,
      )
      c.granted += delta
    } else {
      console.log(
        `  [skip]  fork_milestone:prompt:${p.id} "「${fmtName(p.name)}」净 fork=${netForkCount}" → already exists`,
      )
      c.skipped++
    }
  }
  console.log(`Step 8 summary: ${c.granted} milestones granted, ${c.skipped} prompts skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 9: Skill star milestones
// ------------------------------------------------------------------
async function step9_skillStarMilestones(): Promise<StepCounter> {
  console.log('\n[backfill] Step 9: Skill star milestones...')
  const c = newCounter()
  const skills = await prisma.skill.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, createdById: true },
  })
  for (const s of skills) {
    const stars = await prisma.star.findMany({
      where: { targetType: 'skill', skillId: s.id },
      select: { userId: true },
    })
    const netStarCount = stars.filter((x) => x.userId !== s.createdById).length
    if (netStarCount <= 0) continue

    const delta = await grantMilestones({
      ownerId: s.createdById,
      sourceType: ContributionSourceType.skill,
      sourceId: s.id,
      sourceName: s.name,
      currentCount: netStarCount,
      kind: 'star',
    })
    if (delta > 0) {
      console.log(
        `  [award] star_milestone:skill:${s.id} "「${fmtName(s.name)}」净 star=${netStarCount}" → granted ${delta} milestones`,
      )
      c.granted += delta
    } else {
      console.log(
        `  [skip]  star_milestone:skill:${s.id} "「${fmtName(s.name)}」净 star=${netStarCount}" → already exists`,
      )
      c.skipped++
    }
  }
  console.log(`Step 9 summary: ${c.granted} milestones granted, ${c.skipped} skills skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 10: Skill fork milestones
// ------------------------------------------------------------------
async function step10_skillForkMilestones(): Promise<StepCounter> {
  console.log('\n[backfill] Step 10: Skill fork milestones...')
  const c = newCounter()
  const skills = await prisma.skill.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, createdById: true },
  })
  for (const s of skills) {
    const forks = await prisma.skill.findMany({
      where: { sourceId: s.id, deletedAt: null },
      select: { createdById: true },
    })
    const netForkCount = forks.filter((f) => f.createdById !== s.createdById).length
    if (netForkCount <= 0) continue

    const delta = await grantMilestones({
      ownerId: s.createdById,
      sourceType: ContributionSourceType.skill,
      sourceId: s.id,
      sourceName: s.name,
      currentCount: netForkCount,
      kind: 'fork',
    })
    if (delta > 0) {
      console.log(
        `  [award] fork_milestone:skill:${s.id} "「${fmtName(s.name)}」净 fork=${netForkCount}" → granted ${delta} milestones`,
      )
      c.granted += delta
    } else {
      console.log(
        `  [skip]  fork_milestone:skill:${s.id} "「${fmtName(s.name)}」净 fork=${netForkCount}" → already exists`,
      )
      c.skipped++
    }
  }
  console.log(`Step 10 summary: ${c.granted} milestones granted, ${c.skipped} skills skipped`)
  return c
}

// ------------------------------------------------------------------
// Step 11: Workbench usage —— Prompt 首次推进 (+6 value) + SopProject 首次被采用 (+20 value)
// ------------------------------------------------------------------
async function step11_workbenchUsage(): Promise<{
  prompt: StepCounter
  sopProject: StepCounter
}> {
  console.log('\n[backfill] Step 11: Workbench "first-used" events...')
  const promptC = newCounter()
  const sopProjectC = newCounter()

  // 1) 拿到所有"已经做过 advance 的 iteration" —— 即有至少一个 FeedPackage 的 iteration
  const iterationIds = await prisma.feedPackage
    .findMany({
      where: { deletedAt: null },
      select: { iterationId: true },
      distinct: ['iterationId'],
    })
    .then((rows) => rows.map((r) => r.iterationId))

  if (iterationIds.length === 0) {
    console.log('  (no advanced iterations found)')
    return { prompt: promptC, sopProject: sopProjectC }
  }

  const iterations = await prisma.iteration.findMany({
    where: { id: { in: iterationIds } },
    select: { id: true, boardId: true },
  })

  const touchedPromptIds = new Set<string>()
  const touchedSopProjectIds = new Set<string>()

  for (const it of iterations) {
    if (!it.boardId) continue
    const sopDocSelections = await prisma.boardSelection.findMany({
      where: { boardId: it.boardId, type: 'sop_doc', sopDocumentId: { not: null } },
      select: { sopDocumentId: true },
    })
    const sopDocIds = sopDocSelections
      .map((s) => s.sopDocumentId)
      .filter((id): id is string => Boolean(id))
    if (sopDocIds.length === 0) continue
    const sopDocs = await prisma.sopDocument.findMany({
      where: { id: { in: sopDocIds } },
      include: {
        prompts: {
          include: {
            prompt: { select: { id: true, createdById: true, name: true } },
          },
        },
        sopProject: { select: { id: true, createdById: true, name: true } },
      },
    })
    for (const doc of sopDocs) {
      if (doc.sopProject) touchedSopProjectIds.add(doc.sopProject.id)
      for (const p of doc.prompts) {
        if (p.prompt) touchedPromptIds.add(p.prompt.id)
      }
    }
  }

  console.log(
    `  (touched ${touchedPromptIds.size} prompts, ${touchedSopProjectIds.size} sop_projects across ${iterations.length} advanced iterations)`,
  )

  // 2) Prompt: first_used_in_workbench (+6 value)
  for (const promptId of touchedPromptIds) {
    const p = await prisma.prompt.findUnique({
      where: { id: promptId },
      select: { id: true, name: true, createdById: true, deletedAt: true },
    })
    if (!p || p.deletedAt) continue
    const granted = await safeAward({
      userId: p.createdById,
      eventKey: `first_used_in_workbench:prompt:${p.id}`,
      eventType: 'first_used_in_workbench',
      category: PointCategory.value,
      sourceType: ContributionSourceType.prompt,
      sourceId: p.id,
      points: 6,
      reason: `你的「${p.name}」被推进到工作台`,
    })
    console.log(
      `  ${tag(granted)} first_used_in_workbench:prompt:${p.id} "「${fmtName(p.name)}」" → ${granted ? 'granted' : 'already exists'}`,
    )
    granted ? promptC.granted++ : promptC.skipped++
  }

  // 3) SopProject: first_used_in_iteration (+20 value)
  for (const spId of touchedSopProjectIds) {
    const sp = await prisma.sopProject.findUnique({
      where: { id: spId },
      select: { id: true, name: true, createdById: true, deletedAt: true },
    })
    if (!sp || sp.deletedAt) continue
    const granted = await safeAward({
      userId: sp.createdById,
      eventKey: `first_used_in_iteration:sop_project:${sp.id}`,
      eventType: 'first_used_in_iteration',
      category: PointCategory.value,
      sourceType: ContributionSourceType.sop_project,
      sourceId: sp.id,
      points: 20,
      reason: `你的 SOP 模板「${sp.name}」被项目采用`,
    })
    console.log(
      `  ${tag(granted)} first_used_in_iteration:sop_project:${sp.id} "「${fmtName(sp.name)}」" → ${granted ? 'granted' : 'already exists'}`,
    )
    granted ? sopProjectC.granted++ : sopProjectC.skipped++
  }

  console.log(
    `Step 11 summary: prompt ${promptC.granted} granted / ${promptC.skipped} skipped, ` +
      `sop_project ${sopProjectC.granted} granted / ${sopProjectC.skipped} skipped`,
  )
  return { prompt: promptC, sopProject: sopProjectC }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
  console.log('=== Contribution Points Backfill ===')
  const startTotal = await prisma.contributionPoint.count()
  const startSum = await prisma.contributionPoint.aggregate({ _sum: { points: true } })

  const promptCreate = await step1_promptCreate()
  const skillCreate = await step2_skillCreate()
  const sopProjectCreate = await step3_sopProjectCreate()
  const sopDocumentCreate = await step4_sopDocumentCreate()
  const promptPrCreate = await step5_promptPrCreate()
  const promptPrMerged = await step6_promptPrMerged()
  const promptStarM = await step7_promptStarMilestones()
  const promptForkM = await step8_promptForkMilestones()
  const skillStarM = await step9_skillStarMilestones()
  const skillForkM = await step10_skillForkMilestones()
  const workbench = await step11_workbenchUsage()

  const endTotal = await prisma.contributionPoint.count()
  const endSum = await prisma.contributionPoint.aggregate({ _sum: { points: true } })
  const addedRecords = endTotal - startTotal
  const addedPoints = (endSum._sum.points ?? 0) - (startSum._sum.points ?? 0)

  const line = (label: string, n: StepCounter) =>
    `  ${label.padEnd(34)} ${String(n.granted).padStart(3)} / ${String(n.granted + n.skipped).padStart(3)}`

  console.log('\n=== 最终统计 ===')
  console.log(line('Prompt created:', promptCreate))
  console.log(line('Skill created:', skillCreate))
  console.log(line('SopProject created:', sopProjectCreate))
  console.log(line('SopDocument created:', sopDocumentCreate))
  console.log(line('PromptPr created:', promptPrCreate))
  console.log(line('PromptPr merged:', promptPrMerged))
  console.log(line('Prompt star milestones:', promptStarM))
  console.log(line('Prompt fork milestones:', promptForkM))
  console.log(line('Skill star milestones:', skillStarM))
  console.log(line('Skill fork milestones:', skillForkM))
  console.log(line('Workbench usage (prompt):', workbench.prompt))
  console.log(line('Workbench usage (sop_project):', workbench.sopProject))

  console.log(
    `\n总共发放 ${addedRecords} 条新积分记录（约 ${addedPoints} 分）` +
      `；ContributionPoint 表从 ${startTotal} → ${endTotal}`,
  )
}

main()
  .catch((e) => {
    console.error('[backfill] 失败：', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
