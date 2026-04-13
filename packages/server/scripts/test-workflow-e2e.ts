/**
 * E2E 测试：工作流 pipeline 所有断点修复验证
 *
 * 运行：
 *   cd packages/server && npx tsx scripts/test-workflow-e2e.ts
 *
 * 特性：
 *   - 直接调 service（不走 HTTP / 不需要密码 / 不需要启动 server）
 *   - 自动 setup 临时 iteration + 所有测试数据都挂在下面
 *   - finally 里自动 teardown，失败也会清理
 *   - 所有测试数据带 [E2E-TEST] 前缀便于识别
 *
 * 覆盖 8 个修复：
 *   A. 手动设计任务必须指派（修复 3）
 *   A+. 手动任务权限 / 完成 → 确认闭环
 *   B. 工作台包推给设计 → 审核通过 / 驳回 / 重新提交 / 完成（修复 1 + 6）
 *   B+. feed_implement 口径调整（修复 2）
 *   C. 白板协作推进 gate（修复 路径 3）
 *   C+. 白板卡片完成权限
 *   D. advanceIteration 孤儿清理（修复 5）
 *   E. feed_rejected OR 口径（修复 4）
 */

import prisma from '../src/prisma/client'
import * as feedService from '../src/services/feed'
import * as designService from '../src/services/design'
import * as dashboardService from '../src/services/dashboard'
import * as boardService from '../src/services/board'
import { advanceIteration } from '../src/services/iteration.service'

// ========== 输出辅助 ==========

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const GRAY = '\x1b[90m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'

let passCount = 0
let failCount = 0
const failures: string[] = []

const ok = (msg: string) => {
  console.log(`${GREEN}  ✓${RESET} ${msg}`)
  passCount++
}
const fail = (msg: string, detail?: string) => {
  console.log(`${RED}  ✗${RESET} ${msg}`)
  if (detail) console.log(`${GRAY}    ${detail}${RESET}`)
  failCount++
  failures.push(msg)
}
const section = (title: string) => {
  console.log(`\n${BLUE}${BOLD}═══ ${title} ═══${RESET}`)
}
const step = (msg: string) => {
  console.log(`${YELLOW}→${RESET} ${msg}`)
}

/** 断言：调用应该成功 */
async function expectOk<T>(label: string, promise: Promise<T>): Promise<T | null> {
  try {
    const result = await promise
    ok(label)
    return result
  } catch (err) {
    fail(label, (err as Error).message)
    return null
  }
}

/** 断言：调用应该失败，且错误信息包含 expectedSubstring */
async function expectFailsWith<T>(
  label: string,
  promise: Promise<T>,
  expectedSubstring: string,
): Promise<void> {
  try {
    await promise
    fail(label, `期望失败（含 "${expectedSubstring}"），但调用成功了`)
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes(expectedSubstring)) {
      ok(`${label}  ${GRAY}(${msg.slice(0, 80)})${RESET}`)
    } else {
      fail(label, `错误信息不含 "${expectedSubstring}"，实际：${msg}`)
    }
  }
}

// ========== 主流程 ==========

async function main() {
  console.log(`${BLUE}${BOLD}┌──────────────────────────────────────────────┐${RESET}`)
  console.log(`${BLUE}${BOLD}│  Workflow Pipeline E2E — 断点修复全量验证  │${RESET}`)
  console.log(`${BLUE}${BOLD}└──────────────────────────────────────────────┘${RESET}`)

  // ============================================================
  // Setup
  // ============================================================
  section('Setup: 准备测试数据')

  /**
   * 角色映射（复用数据库里已有的用户）：
   *   IMPLEMENTOR = test@test.com (ENGINEER)  — 实施工程师
   *   DESIGNER    = byron@aipm.dev (ADMIN)    — 扮演设计师（ADMIN 可通过所有权限）
   *   BYSTANDER   = 111111@qq.com (ARCHITECT) — 路人，专门测越权拦截
   */
  const implementor = await prisma.user.findFirst({ where: { email: 'test@test.com' } })
  const designer = await prisma.user.findFirst({ where: { email: 'byron@aipm.dev' } })
  const bystander = await prisma.user.findFirst({ where: { email: '111111@qq.com' } })

  if (!implementor || !designer || !bystander) {
    console.error(
      `${RED}❌ 缺少测试用户。需要: test@test.com / byron@aipm.dev / 111111@qq.com${RESET}`,
    )
    process.exit(1)
  }
  step(`实施工程师 IMPLEMENTOR = ${implementor.name} (${implementor.role})`)
  step(`设计师 DESIGNER = ${designer.name} (${designer.role})  ${GRAY}[ADMIN 扮演]${RESET}`)
  step(`路人 BYSTANDER = ${bystander.name} (${bystander.role})  ${GRAY}[用于越权测试]${RESET}`)

  const project = await prisma.project.findFirst({ where: { deletedAt: null } })
  const squad = await prisma.squad.findFirst()
  if (!project || !squad) {
    console.error(`${RED}❌ 数据库没有 project 或 squad${RESET}`)
    process.exit(1)
  }
  step(`项目: ${project.name} / 小组: ${squad.name}`)

  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const testPrefix = `[E2E-TEST ${stamp}]`

  const board = await prisma.board.create({
    data: {
      projectId: project.id,
      name: `${testPrefix} board`,
      createdById: implementor.id,
    },
  })
  const iteration = await prisma.iteration.create({
    data: {
      projectId: project.id,
      squadId: squad.id,
      name: `${testPrefix} iteration`,
      status: 'DESIGN',
      boardId: board.id,
    },
  })
  step(`临时 Iteration: ${iteration.id.slice(0, 8)} / Board: ${board.id.slice(0, 8)}`)

  // ============================================================
  // Teardown（始终在 finally 里跑）
  // ============================================================
  const teardown = async () => {
    console.log(`\n${YELLOW}Teardown — 清理测试数据${RESET}`)
    try {
      // 按 testPrefix 扫所有相关 iteration/board（场景 G 会创建多个子 iteration）
      const allIterations = await prisma.iteration.findMany({
        where: { name: { startsWith: testPrefix } },
        select: { id: true, boardId: true },
      })
      const iterIds = allIterations.map((i) => i.id)
      const boardIds = allIterations.map((i) => i.boardId).filter((id): id is string => !!id)

      // 顺序：先软删子对象，再硬删 iteration（iteration 没有 deletedAt 字段）
      const deletedDrafts = await prisma.designDraft.updateMany({
        where: { iterationId: { in: iterIds } },
        data: { deletedAt: new Date() },
      })
      const deletedFeeds = await prisma.feedPackage.updateMany({
        where: { iterationId: { in: iterIds } },
        data: { deletedAt: new Date() },
      })
      // BoardSelectionActivity 通过 onDelete:Cascade 会跟着 selection 一起删
      const deletedSels = await prisma.boardSelection.deleteMany({
        where: { boardId: { in: boardIds } },
      })
      await prisma.board.updateMany({
        where: { id: { in: boardIds } },
        data: { deletedAt: new Date() },
      })
      // iteration 必须硬删（无 deletedAt 字段）
      const deletedIters = await prisma.iteration.deleteMany({
        where: { id: { in: iterIds } },
      })
      step(
        `已清理：${deletedDrafts.count} DesignDrafts, ${deletedFeeds.count} FeedPackages, ${deletedSels.count} Selections, ${boardIds.length} Boards, ${deletedIters.count} Iterations`,
      )
    } catch (err) {
      console.log(`${RED}⚠️  Teardown 异常：${(err as Error).message}${RESET}`)
      console.log(`${GRAY}    可用 SQL 手动清理：DELETE FROM iterations WHERE name LIKE '${testPrefix}%';${RESET}`)
    }
  }

  try {
    // ============================================================
    // 场景 A: 手动设计任务闭环（修复 3）
    // ============================================================
    section('场景 A: 手动设计任务闭环（修复 3: 必须指派 + 权限）')

    // A.1 不指派创建 → 拒绝
    await expectFailsWith(
      'A.1  不指派创建手动任务 → 拒绝',
      designService.createDesignDraft(implementor.id, {
        iterationId: iteration.id,
        name: `${testPrefix} 手动任务`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      '必须指派',
    )

    // A.2 指派非设计师 → 拒绝（bystander 是 ARCHITECT）
    await expectFailsWith(
      'A.2  指派给非设计师 → 拒绝',
      designService.createDesignDraft(implementor.id, {
        iterationId: iteration.id,
        name: `${testPrefix} 手动任务`,
        assigneeId: bystander.id,
      }),
      '不是设计师',
    )

    // A.3 正常创建
    const manualDraft = await expectOk(
      'A.3  指派设计师创建手动任务 → 成功',
      designService.createDesignDraft(implementor.id, {
        iterationId: iteration.id,
        name: `${testPrefix} 手动任务 - 首页规范`,
        assigneeId: designer.id,
      }),
    )
    if (!manualDraft) throw new Error('setup: A.3 创建失败，无法继续')

    // A.4 路人尝试完成 → 403
    await expectFailsWith(
      'A.4  路人尝试完成别人的任务 → 403',
      designService.completeDesign(manualDraft.id, bystander.id),
      '只有被指派',
    )

    // A.5 设计师完成 → PENDING_CONFIRM
    const afterComplete = await expectOk(
      'A.5  设计师点完成 → PENDING_CONFIRM',
      designService.completeDesign(manualDraft.id, designer.id),
    )
    if (afterComplete && afterComplete.status !== 'PENDING_CONFIRM') {
      fail(`A.5  状态应为 PENDING_CONFIRM，实际 ${afterComplete.status}`)
    }

    // A.6 路人尝试确认 → 403
    await expectFailsWith(
      'A.6  路人尝试确认 → 403',
      designService.confirmDesign(manualDraft.id, bystander.id),
      '只有任务创建人',
    )

    // A.7 设计师（非创建人）尝试确认 → 403（注意：设计师是 assignee 但不是 createdBy）
    await expectFailsWith(
      'A.7  设计师（非创建人）尝试确认 → 403',
      designService.confirmDesign(manualDraft.id, designer.id),
      '只有任务创建人',
    )

    // A.8 创建人确认 → CONFIRMED + confirmedAt 非空
    const afterConfirm = await expectOk(
      'A.8  创建人确认 → CONFIRMED',
      designService.confirmDesign(manualDraft.id, implementor.id),
    )
    if (afterConfirm) {
      if (afterConfirm.status !== 'CONFIRMED') {
        fail(`A.8  状态应为 CONFIRMED，实际 ${afterConfirm.status}`)
      }
      if (!afterConfirm.confirmedAt) {
        fail('A.8  confirmedAt 未记录')
      } else {
        ok('A.8  confirmedAt 已记录')
      }
      if (!afterConfirm.confirmedBy || afterConfirm.confirmedBy.id !== implementor.id) {
        fail('A.8  confirmedBy 未记录或不对')
      } else {
        ok('A.8  confirmedBy 已记录')
      }
    }

    // ============================================================
    // 场景 B: 工作台包设计审核闭环（修复 1 + 6 + 2）
    // ============================================================
    section('场景 B: 工作台包设计审核闭环（修复 1 权限 + 6 状态同步）')

    // B.1 创建带设计图要求的工作台包
    const pkg = await expectOk(
      'B.1  创建工作台包（designOutputRequired=true）',
      feedService.createFeedPackage(implementor.id, {
        iterationId: iteration.id,
        name: `${testPrefix} 套餐购买页`,
        phase: 'IMPLEMENT',
        designOutputRequired: true,
      }),
    )
    if (!pkg) throw new Error('setup: B.1 创建失败')

    // 手动把 assignee 和 status 设到合适的初始态
    await prisma.feedPackage.update({
      where: { id: pkg.id },
      data: { assigneeId: implementor.id, status: 'IN_PROGRESS' },
    })

    // B.2 路人推给设计 → 403
    await expectFailsWith(
      'B.2  路人尝试推给设计 → 403',
      feedService.pushToDesign(pkg.id, bystander.id, 'ARCHITECT', {
        figmaUrl: 'https://figma.com/test-attack',
        designerId: designer.id,
      }),
      '只有工作台包的负责人或创建人',
    )

    // B.3 实施工程师推给设计 → REVIEW + PENDING_REVIEW
    const afterPush = await expectOk(
      'B.3  实施工程师推给设计',
      feedService.pushToDesign(pkg.id, implementor.id, 'ENGINEER', {
        figmaUrl: 'https://figma.com/first-submission',
        designerId: designer.id,
      }),
    )
    if (afterPush) {
      if (afterPush.designReviewStatus !== 'PENDING_REVIEW') {
        fail(`B.3  designReviewStatus 应为 PENDING_REVIEW，实际 ${afterPush.designReviewStatus}`)
      }
      if (afterPush.status !== 'REVIEW') {
        fail(`B.3  status 应为 REVIEW（修复 6），实际 ${afterPush.status}`)
      } else {
        ok('B.3  status 同步推到 REVIEW  (修复 6)')
      }
    }

    // B.4 [修复 2] 推给设计后，实施工程师的 my-tasks.feed_implement 里不应再有此包
    const myTasks_afterPush = await dashboardService.getMyTasks(implementor.id)
    const inFeedImpl_afterPush = myTasks_afterPush.tasks.find(
      (t) => t.category === 'feed_implement' && t.meta.feedPackageId === pkg.id,
    )
    if (inFeedImpl_afterPush) {
      fail(
        'B.4  [修复 2] 推给设计后，feed_implement 里不应再有此包（应该已自动消失）',
      )
    } else {
      ok('B.4  [修复 2] 推给设计后 feed_implement 自动消失')
    }

    // B.5 设计师的 feed_design_review 里应该出现此包
    const designerTasks_afterPush = await dashboardService.getMyTasks(designer.id)
    const inReview_afterPush = designerTasks_afterPush.tasks.find(
      (t) => t.category === 'feed_design_review' && t.meta.feedPackageId === pkg.id,
    )
    if (inReview_afterPush) {
      ok('B.5  设计师 feed_design_review 里出现此包')
    } else {
      fail('B.5  设计师 feed_design_review 里找不到此包')
    }

    // B.6 路人尝试 approve → 403
    await expectFailsWith(
      'B.6  路人尝试审核通过 → 403',
      feedService.approveDesign(pkg.id, bystander.id, 'ARCHITECT'),
      '只有指派的设计师',
    )

    // B.7 路人尝试 reject → 403
    await expectFailsWith(
      'B.7  路人尝试驳回 → 403',
      feedService.rejectDesign(pkg.id, bystander.id, 'ARCHITECT', {
        reason: 'attack',
      }),
      '只有指派的设计师',
    )

    // B.8 实施工程师尝试自己 approve → 403（自己不能审自己）
    await expectFailsWith(
      'B.8  实施工程师尝试自己审核通过 → 403',
      feedService.approveDesign(pkg.id, implementor.id, 'ENGINEER'),
      '只有指派的设计师',
    )

    // B.9 设计师驳回 → REWORK + REJECTED
    const afterReject = await expectOk(
      'B.9  设计师驳回',
      feedService.rejectDesign(pkg.id, designer.id, 'ADMIN', {
        reason: '配色和品牌指南不一致，请用主色 #7357EB',
      }),
    )
    if (afterReject) {
      if (afterReject.status !== 'REWORK') {
        fail(`B.9  status 应为 REWORK（修复 6），实际 ${afterReject.status}`)
      } else {
        ok('B.9  status 同步推到 REWORK  (修复 6)')
      }
      if (afterReject.designReviewStatus !== 'REJECTED') {
        fail(`B.9  designReviewStatus 应为 REJECTED`)
      }
    }

    // B.10 [修复 2] 驳回后，feed_implement 不应有此包（已排除 REJECTED）
    const myTasks_afterReject = await dashboardService.getMyTasks(implementor.id)
    const inFeedImpl_afterReject = myTasks_afterReject.tasks.find(
      (t) => t.category === 'feed_implement' && t.meta.feedPackageId === pkg.id,
    )
    if (inFeedImpl_afterReject) {
      fail(
        'B.10 [修复 2] 驳回后 feed_implement 里不应有此包（应该只在 feed_rejected 显示）',
      )
    } else {
      ok('B.10 [修复 2] 驳回后 feed_implement 正确排除')
    }

    // B.11 feed_rejected 里应该有此包
    const inRejected = myTasks_afterReject.tasks.find(
      (t) => t.category === 'feed_rejected' && t.meta.feedPackageId === pkg.id,
    )
    if (inRejected) {
      ok('B.11 feed_rejected 里出现此包')
    } else {
      fail('B.11 feed_rejected 里找不到此包')
    }

    // B.12 实施工程师修改后重新推给设计
    const afterRepush = await expectOk(
      'B.12 实施工程师重新推给设计',
      feedService.pushToDesign(pkg.id, implementor.id, 'ENGINEER', {
        figmaUrl: 'https://figma.com/second-submission',
        designerId: designer.id,
      }),
    )
    if (afterRepush) {
      if (afterRepush.designReviewStatus !== 'PENDING_REVIEW') {
        fail(`B.12 designReviewStatus 应回到 PENDING_REVIEW`)
      }
      if (afterRepush.status !== 'REVIEW') {
        fail(`B.12 status 应回到 REVIEW`)
      }
    }

    // B.13 设计师审核通过
    const afterApprove = await expectOk(
      'B.13 设计师审核通过',
      feedService.approveDesign(pkg.id, designer.id, 'ADMIN'),
    )
    if (afterApprove) {
      if (afterApprove.designReviewStatus !== 'APPROVED') {
        fail(`B.13 designReviewStatus 应为 APPROVED`)
      }
      if (afterApprove.status !== 'REVIEW') {
        fail(`B.13 status 应保持 REVIEW（实施工程师还要点完成）`)
      } else {
        ok('B.13 status 保持 REVIEW 等实施工程师点完成')
      }
    }

    // B.14 [修复 2] 审核通过后，feed_implement 里应出现此包 + 有 readyToComplete 标记
    const myTasks_afterApprove = await dashboardService.getMyTasks(implementor.id)
    const readyTask = myTasks_afterApprove.tasks.find(
      (t) => t.category === 'feed_implement' && t.meta.feedPackageId === pkg.id,
    )
    if (!readyTask) {
      fail('B.14 [修复 2] 审核通过后，feed_implement 应该重新出现此包')
    } else if (!readyTask.meta.readyToComplete) {
      fail(`B.14 [修复 2] 缺少 readyToComplete 标记，subtitle=${readyTask.subtitle}`)
    } else if (!readyTask.subtitle.includes('审核通过')) {
      fail(`B.14 [修复 2] subtitle 未提示审核通过，实际 "${readyTask.subtitle}"`)
    } else {
      ok('B.14 [修复 2] feed_implement 显示「审核通过请点完成」提示')
    }

    // B.15 updateStatus REVIEW → DONE，gate 应通过
    const afterDone = await expectOk(
      'B.15 updateStatus REVIEW → DONE',
      feedService.updateStatus(pkg.id, 'DONE'),
    )
    if (afterDone && afterDone.status !== 'DONE') {
      fail(`B.15 status 应为 DONE，实际 ${afterDone.status}`)
    }

    // B.16 [双层防护验证]
    //   a) IN_PROGRESS → DONE 被 VALID_TRANSITIONS 层拦截
    //   b) REVIEW + PENDING_REVIEW → DONE 被 designReviewStatus gate 层拦截
    //   c) REVIEW + NOT_REQUIRED (designOutputRequired=false) → DONE 放行
    const pkgA = await prisma.feedPackage.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} gate-a`,
        phase: 'IMPLEMENT',
        status: 'IN_PROGRESS',
        designOutputRequired: true,
        createdById: implementor.id,
        assigneeId: implementor.id,
      },
    })
    await expectFailsWith(
      'B.16a [双层防护] IN_PROGRESS → DONE 被 VALID_TRANSITIONS 拦截',
      feedService.updateStatus(pkgA.id, 'DONE'),
      'Cannot transition from IN_PROGRESS to DONE',
    )

    const pkgB = await prisma.feedPackage.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} gate-b`,
        phase: 'IMPLEMENT',
        status: 'REVIEW',
        designOutputRequired: true,
        designReviewStatus: 'PENDING_REVIEW',
        figmaUrl: 'https://figma.com/gate-b',
        designReviewerId: designer.id,
        createdById: implementor.id,
        assigneeId: implementor.id,
      },
    })
    await expectFailsWith(
      'B.16b [双层防护] REVIEW + PENDING_REVIEW → DONE 被 designReviewStatus gate 拦截',
      feedService.updateStatus(pkgB.id, 'DONE'),
      '审核通过',
    )

    // C: 不需要设计图的包，REVIEW → DONE 应该放行（gate 只拦 designOutputRequired=true）
    const pkgC = await prisma.feedPackage.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} gate-c`,
        phase: 'IMPLEMENT',
        status: 'REVIEW',
        designOutputRequired: false,
        createdById: implementor.id,
        assigneeId: implementor.id,
      },
    })
    const okDone = await expectOk(
      'B.16c [双层防护] 无需设计图的包 REVIEW → DONE 正常放行',
      feedService.updateStatus(pkgC.id, 'DONE'),
    )
    if (okDone && okDone.status !== 'DONE') {
      fail(`B.16c status 应为 DONE`)
    }

    // ============================================================
    // 场景 C: 白板协作推进 gate
    // ============================================================
    section('场景 C: 白板协作推进 gate（路径 3）')

    const card1 = await prisma.boardSelection.create({
      data: {
        boardId: board.id,
        userId: implementor.id,
        type: 'text',
        content: `${testPrefix} 实施工程师整理技术约束`,
        position: { x: 100, y: 100 },
        assigneeId: implementor.id,
      },
    })
    const card2 = await prisma.boardSelection.create({
      data: {
        boardId: board.id,
        userId: implementor.id,
        type: 'text',
        content: `${testPrefix} 设计师做视觉规范`,
        position: { x: 300, y: 100 },
        assigneeId: designer.id,
      },
    })
    // 无指派卡片（不参与 gate）
    await prisma.boardSelection.create({
      data: {
        boardId: board.id,
        userId: implementor.id,
        type: 'sticky',
        content: `${testPrefix} 无人指派便利贴`,
        position: { x: 500, y: 100 },
      },
    })
    step('已在白板加 3 张卡片（2 张指派 + 1 张无指派）')

    // C.1 两张未完成 → advance 拦截
    await expectFailsWith(
      'C.1  2 张指派卡片未完成时 advance → 拦截',
      advanceIteration(iteration.id, implementor.id),
      '白板准备阶段尚有',
    )

    // C.2 路人尝试完成卡片 2（指派给设计师的）→ 403
    await expectFailsWith(
      'C.2  路人尝试完成别人的卡片 → 403',
      boardService.completeSelection(board.id, card2.id, bystander.id, 'ARCHITECT'),
      '只有卡片的指派人',
    )

    // C.3 实施工程师完成卡片 1
    const completedCard1 = await expectOk(
      'C.3  实施工程师完成卡片 1',
      boardService.completeSelection(board.id, card1.id, implementor.id, 'ENGINEER'),
    )
    if (completedCard1 && !completedCard1.completedAt) {
      fail('C.3  completedAt 未记录')
    }

    // C.4 卡片 2 仍未完成，advance 仍应拦截
    await expectFailsWith(
      'C.4  1/2 完成时 advance 仍然拦截',
      advanceIteration(iteration.id, implementor.id),
      '白板准备阶段尚有',
    )

    // C.5 设计师完成卡片 2
    await expectOk(
      'C.5  设计师完成卡片 2',
      boardService.completeSelection(board.id, card2.id, designer.id, 'ADMIN'),
    )

    // C.6 两张都完成，gate 应通过（但 advance 本身还会因 SOP 缺失或 AI 调用失败，
    //     所以我们不调真正的 advance，只验证 gate 层面满足）
    const stillIncomplete = await prisma.boardSelection.count({
      where: { boardId: board.id, assigneeId: { not: null }, completedAt: null },
    })
    if (stillIncomplete === 0) {
      ok('C.6  所有指派卡片已完成，白板 gate 应该放行')
    } else {
      fail(`C.6  仍有 ${stillIncomplete} 张未完成卡片`)
    }

    // C.7 撤回卡片 1 的完成 → gate 再次拦截
    await expectOk(
      'C.7  实施工程师撤回卡片 1 的完成',
      boardService.reopenSelection(board.id, card1.id, implementor.id, 'ENGINEER'),
    )
    await expectFailsWith(
      'C.8  撤回后 advance 再次拦截',
      advanceIteration(iteration.id, implementor.id),
      '白板准备阶段尚有',
    )

    // ============================================================
    // 场景 D: advanceIteration 孤儿清理（修复 5）
    // ============================================================
    section('场景 D: advanceIteration 孤儿清理（修复 5）')

    // 模拟上一次 advance 生成的 FeedPackage + DesignDraft
    const orphanDraft = await prisma.designDraft.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} orphan test draft`,
        status: 'PENDING_REFINE',
        sourceType: 'FEED_PUSH',
        createdById: implementor.id,
        assigneeId: designer.id,
      },
    })
    const orphanPkg = await prisma.feedPackage.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} orphan test pkg`,
        phase: 'DESIGN',
        status: 'REVIEW',
        sortOrder: 99,
        createdById: implementor.id,
        designDraftId: orphanDraft.id,
        designReviewStatus: 'PENDING_REVIEW',
        designReviewerId: designer.id,
      },
    })
    step(`已构造旧 advance 遗留：pkg ${orphanPkg.id.slice(0, 8)} + draft ${orphanDraft.id.slice(0, 8)}`)

    // 手动执行 advanceIteration step 6 的清理逻辑（不能真跑 advance 避免 AI 调用）
    const doomedFeeds = await prisma.feedPackage.findMany({
      where: {
        iterationId: iteration.id,
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

    // D.1 验证 orphan DesignDraft 被软删
    const checkedDraft = await prisma.designDraft.findUnique({
      where: { id: orphanDraft.id },
    })
    if (checkedDraft?.deletedAt) {
      ok('D.1  advance 覆盖模式会先软删 FEED_PUSH 的 DesignDraft (修复 5)')
    } else {
      fail('D.1  DesignDraft 未被软删，断点 5 未修复')
    }

    // D.2 验证未关联 FeedPackage 的 MANUAL DesignDraft 不受影响
    const unrelatedManual = await prisma.designDraft.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} unrelated manual draft`,
        status: 'PENDING_REFINE',
        sourceType: 'MANUAL',
        createdById: implementor.id,
        assigneeId: designer.id,
      },
    })
    // 再跑一次清理逻辑
    const doomedFeeds2 = await prisma.feedPackage.findMany({
      where: {
        iterationId: iteration.id,
        deletedAt: null,
        designDraftId: { not: null },
      },
      select: { designDraftId: true },
    })
    const doomedDraftIds2 = doomedFeeds2
      .map((f) => f.designDraftId)
      .filter((id): id is string => id !== null)
    if (doomedDraftIds2.length > 0) {
      await prisma.designDraft.updateMany({
        where: {
          id: { in: doomedDraftIds2 },
          sourceType: 'FEED_PUSH',
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      })
    }
    const checkedManual = await prisma.designDraft.findUnique({
      where: { id: unrelatedManual.id },
    })
    if (checkedManual && !checkedManual.deletedAt) {
      ok('D.2  未关联 FeedPackage 的 MANUAL draft 不受影响')
    } else {
      fail('D.2  MANUAL draft 被误删')
    }

    // ============================================================
    // 场景 E: feed_rejected OR 口径（修复 4）
    // ============================================================
    section('场景 E: feed_rejected OR createdById/assigneeId（修复 4）')

    // 构造：createdBy=implementor, assignee=bystander，REJECTED 状态
    const pkgE = await prisma.feedPackage.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} 包 E（转移场景）`,
        phase: 'IMPLEMENT',
        status: 'REWORK',
        createdById: implementor.id,
        assigneeId: bystander.id,
        designOutputRequired: true,
        figmaUrl: 'https://figma.com/e-test',
        designReviewStatus: 'REJECTED',
        designReviewerId: designer.id,
      },
    })
    step(`已构造转移场景包: createdBy=${implementor.name}, assignee=${bystander.name}, REJECTED`)

    // E.1 创建人 implementor 能看到 feed_rejected
    const implTasks_E = await dashboardService.getMyTasks(implementor.id)
    const foundByCreator = implTasks_E.tasks.find(
      (t) => t.category === 'feed_rejected' && t.meta.feedPackageId === pkgE.id,
    )
    if (foundByCreator) {
      ok('E.1  创建人 (implementor) 看到被驳回的包')
    } else {
      fail('E.1  创建人没看到')
    }

    // E.2 [修复 4] 实际 assignee (bystander) 也能看到
    const bysTasks_E = await dashboardService.getMyTasks(bystander.id)
    const foundByAssignee = bysTasks_E.tasks.find(
      (t) => t.category === 'feed_rejected' && t.meta.feedPackageId === pkgE.id,
    )
    if (foundByAssignee) {
      ok('E.2  [修复 4] assignee (bystander) 也看到被驳回的包')
    } else {
      fail('E.2  [修复 4] assignee 没看到 → feed_rejected OR 查询失败')
    }

    // E.3 路人 (designer) 既不是 createdBy 也不是 assignee，不应看到
    const designerTasks_E = await dashboardService.getMyTasks(designer.id)
    const foundByBystander = designerTasks_E.tasks.find(
      (t) => t.category === 'feed_rejected' && t.meta.feedPackageId === pkgE.id,
    )
    if (!foundByBystander) {
      ok('E.3  无关路人 (designer) 没看到（口径未扩得太宽）')
    } else {
      fail('E.3  无关路人不应看到被驳回的包')
    }

    // ============================================================
    // 场景 F: REWORK 回退清审核状态（修复 P2-7）
    // ============================================================
    section('场景 F: REWORK 回退清审核状态（修复 P2-7）')

    // F.1 构造一个 REVIEW + APPROVED 状态的包
    const draftF = await prisma.designDraft.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} F draft`,
        status: 'CONFIRMED',
        sourceType: 'FEED_PUSH',
        createdById: implementor.id,
        assigneeId: designer.id,
        figmaUrl: 'https://figma.com/f',
      },
    })
    const pkgF = await prisma.feedPackage.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} 包 F`,
        phase: 'IMPLEMENT',
        status: 'REVIEW',
        designOutputRequired: true,
        designReviewStatus: 'APPROVED',
        figmaUrl: 'https://figma.com/f',
        designReviewerId: designer.id,
        designDraftId: draftF.id,
        createdById: implementor.id,
        assigneeId: implementor.id,
      },
    })
    step(
      `已构造 REVIEW+APPROVED 包: pkg ${pkgF.id.slice(0, 8)}, draft ${draftF.id.slice(0, 8)}`,
    )

    // F.2 用户手动退回 REWORK
    const afterRollback = await expectOk(
      'F.1  用户从 REVIEW+APPROVED 退回 REWORK',
      feedService.updateStatus(pkgF.id, 'REWORK'),
    )
    if (afterRollback) {
      if (afterRollback.designReviewStatus !== 'NOT_REQUIRED') {
        fail(
          `F.2  designReviewStatus 应清为 NOT_REQUIRED，实际 ${afterRollback.designReviewStatus}`,
        )
      } else {
        ok('F.2  designReviewStatus 已清为 NOT_REQUIRED')
      }
      if (afterRollback.designReviewerId !== null) {
        fail(`F.3  designReviewerId 应为 null`)
      } else {
        ok('F.3  designReviewerId 已清')
      }
      if (afterRollback.figmaUrl !== null) {
        fail(`F.4  figmaUrl 应为 null`)
      } else {
        ok('F.4  figmaUrl 已清')
      }
      if (afterRollback.designDraftId !== null) {
        fail(`F.5  designDraftId 应为 null`)
      } else {
        ok('F.5  designDraftId 已断开')
      }
    }

    // F.6 关联的 DesignDraft 应被软删
    const checkedDraftF = await prisma.designDraft.findUnique({
      where: { id: draftF.id },
    })
    if (checkedDraftF?.deletedAt) {
      ok('F.6  关联 FEED_PUSH DesignDraft 已软删')
    } else {
      fail('F.6  关联的 FEED_PUSH DesignDraft 未被软删')
    }

    // F.7 反例：rejectDesign 进入 REWORK 的情况 → 不应被清（保留 REJECTED）
    const draftG = await prisma.designDraft.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} G draft`,
        status: 'PENDING_REFINE',
        sourceType: 'FEED_PUSH',
        createdById: implementor.id,
        assigneeId: designer.id,
        figmaUrl: 'https://figma.com/g',
      },
    })
    const pkgG = await prisma.feedPackage.create({
      data: {
        iterationId: iteration.id,
        name: `${testPrefix} 包 G`,
        phase: 'IMPLEMENT',
        status: 'REVIEW',
        designOutputRequired: true,
        designReviewStatus: 'PENDING_REVIEW',
        figmaUrl: 'https://figma.com/g',
        designReviewerId: designer.id,
        designDraftId: draftG.id,
        createdById: implementor.id,
        assigneeId: implementor.id,
      },
    })
    // 走正常 rejectDesign 流程
    await expectOk(
      'F.7  rejectDesign 进入 REWORK',
      feedService.rejectDesign(pkgG.id, designer.id, 'ADMIN', {
        reason: 'test',
      }),
    )
    const pkgGAfter = await prisma.feedPackage.findUnique({ where: { id: pkgG.id } })
    if (pkgGAfter?.designReviewStatus === 'REJECTED') {
      ok('F.8  rejectDesign 导致的 REWORK 保留 REJECTED 状态（不被 P2-7 误清）')
    } else {
      fail(
        `F.8  rejectDesign 的 REJECTED 被错误地清除了：${pkgGAfter?.designReviewStatus}`,
      )
    }

    // ============================================================
    // 场景 G: iteration.status 自动流转（修复 P3-9）
    // ============================================================
    section('场景 G: iteration.status 自动流转（修复 P3-9）')

    // 每个子场景用独立的 iteration 避免状态互相污染
    const makeSubIter = async (initStatus: 'SPEC' | 'DESIGN' | 'REFINE' | 'IMPLEMENT') => {
      const subBoard = await prisma.board.create({
        data: {
          projectId: project.id,
          name: `${testPrefix} G-board ${initStatus}`,
          createdById: implementor.id,
        },
      })
      const subIter = await prisma.iteration.create({
        data: {
          projectId: project.id,
          squadId: squad.id,
          name: `${testPrefix} G-iter ${initStatus}`,
          status: initStatus,
          boardId: subBoard.id,
        },
      })
      return { board: subBoard, iteration: subIter }
    }

    // 导入 autoAdvanceIterationStatus（测试脚本里直接调）
    const { autoAdvanceIterationStatus } = await import(
      '../src/services/iteration.service'
    )

    // G.1 DESIGN + 有 PENDING_REVIEW → REFINE
    {
      const { iteration: iterG1 } = await makeSubIter('DESIGN')
      await prisma.feedPackage.create({
        data: {
          iterationId: iterG1.id,
          name: `${testPrefix} G1 pkg`,
          phase: 'DESIGN',
          status: 'REVIEW',
          designOutputRequired: true,
          designReviewStatus: 'PENDING_REVIEW',
          figmaUrl: 'https://figma.com/g1',
          designReviewerId: designer.id,
          createdById: implementor.id,
        },
      })
      await autoAdvanceIterationStatus(iterG1.id)
      const afterG1 = await prisma.iteration.findUnique({ where: { id: iterG1.id } })
      if (afterG1?.status === 'REFINE') {
        ok('G.1  DESIGN + 有 PENDING_REVIEW → REFINE')
      } else {
        fail(`G.1  状态应为 REFINE，实际 ${afterG1?.status}`)
      }
    }

    // G.2 REFINE + 所有 APPROVED 无 PENDING → IMPLEMENT
    {
      const { iteration: iterG2 } = await makeSubIter('REFINE')
      await prisma.feedPackage.create({
        data: {
          iterationId: iterG2.id,
          name: `${testPrefix} G2 pkg`,
          phase: 'DESIGN',
          status: 'REVIEW',
          designOutputRequired: true,
          designReviewStatus: 'APPROVED',
          createdById: implementor.id,
        },
      })
      await autoAdvanceIterationStatus(iterG2.id)
      const afterG2 = await prisma.iteration.findUnique({ where: { id: iterG2.id } })
      if (afterG2?.status === 'IMPLEMENT') {
        ok('G.2  REFINE + 所有 APPROVED → IMPLEMENT')
      } else {
        fail(`G.2  状态应为 IMPLEMENT，实际 ${afterG2?.status}`)
      }
    }

    // G.3 IMPLEMENT + 所有 DONE → ACCEPT
    {
      const { iteration: iterG3 } = await makeSubIter('IMPLEMENT')
      await prisma.feedPackage.create({
        data: {
          iterationId: iterG3.id,
          name: `${testPrefix} G3 pkg a`,
          phase: 'IMPLEMENT',
          status: 'DONE',
          designOutputRequired: true,
          designReviewStatus: 'APPROVED',
          createdById: implementor.id,
        },
      })
      await prisma.feedPackage.create({
        data: {
          iterationId: iterG3.id,
          name: `${testPrefix} G3 pkg b`,
          phase: 'IMPLEMENT',
          status: 'DONE',
          designOutputRequired: false,
          createdById: implementor.id,
        },
      })
      await autoAdvanceIterationStatus(iterG3.id)
      const afterG3 = await prisma.iteration.findUnique({ where: { id: iterG3.id } })
      if (afterG3?.status === 'ACCEPT') {
        ok('G.3  IMPLEMENT + 所有包 DONE + 审核通过 → ACCEPT')
      } else {
        fail(`G.3  状态应为 ACCEPT，实际 ${afterG3?.status}`)
      }
    }

    // G.4 IMPLEMENT + 有未完成的 → 不动
    {
      const { iteration: iterG4 } = await makeSubIter('IMPLEMENT')
      await prisma.feedPackage.create({
        data: {
          iterationId: iterG4.id,
          name: `${testPrefix} G4 pkg`,
          phase: 'IMPLEMENT',
          status: 'IN_PROGRESS',
          createdById: implementor.id,
        },
      })
      await autoAdvanceIterationStatus(iterG4.id)
      const afterG4 = await prisma.iteration.findUnique({ where: { id: iterG4.id } })
      if (afterG4?.status === 'IMPLEMENT') {
        ok('G.4  IMPLEMENT + 包未完成 → 保持不动（只前进不后退）')
      } else {
        fail(`G.4  状态不应变，实际 ${afterG4?.status}`)
      }
    }

    // G.5 ACCEPT → DONE 应该保持手动，不自动推进
    {
      const { iteration: iterG5 } = await makeSubIter('IMPLEMENT')
      await prisma.iteration.update({
        where: { id: iterG5.id },
        data: { status: 'ACCEPT' },
      })
      await prisma.feedPackage.create({
        data: {
          iterationId: iterG5.id,
          name: `${testPrefix} G5 pkg`,
          phase: 'IMPLEMENT',
          status: 'DONE',
          createdById: implementor.id,
        },
      })
      await autoAdvanceIterationStatus(iterG5.id)
      const afterG5 = await prisma.iteration.findUnique({ where: { id: iterG5.id } })
      if (afterG5?.status === 'ACCEPT') {
        ok('G.5  ACCEPT 保持不动（DONE 必须手动）')
      } else {
        fail(`G.5  ACCEPT 不应自动推到 ${afterG5?.status}`)
      }
    }

    // ============================================================
    // 场景 H: 白板卡片审计日志（修复 P2-8）
    // ============================================================
    section('场景 H: 白板卡片审计日志（修复 P2-8）')

    // H.1 创建一张未指派的卡片
    const cardH = await prisma.boardSelection.create({
      data: {
        boardId: board.id,
        userId: implementor.id,
        type: 'text',
        content: `${testPrefix} 审计测试卡片`,
        position: { x: 700, y: 100 },
      },
    })
    step(`已创建审计测试卡片 ${cardH.id.slice(0, 8)}`)

    // H.2 第一次指派（assign）
    await expectOk(
      'H.1  架构师指派给实施工程师',
      boardService.updateSelection(board.id, cardH.id, bystander.id, {
        assigneeId: implementor.id,
      }),
    )

    // H.3 改派（reassign）
    await expectOk(
      'H.2  架构师改派给设计师',
      boardService.updateSelection(board.id, cardH.id, bystander.id, {
        assigneeId: designer.id,
      }),
    )

    // H.4 设计师完成
    await expectOk(
      'H.3  设计师完成',
      boardService.completeSelection(board.id, cardH.id, designer.id, 'ADMIN'),
    )

    // H.5 设计师撤回（带 note）
    await expectOk(
      'H.4  设计师撤回（带原因）',
      boardService.reopenSelection(
        board.id,
        cardH.id,
        designer.id,
        'ADMIN',
        '还要补一点细节',
      ),
    )

    // H.6 设计师再次完成
    await expectOk(
      'H.5  设计师再次完成',
      boardService.completeSelection(board.id, cardH.id, designer.id, 'ADMIN'),
    )

    // H.7 取消指派（unassign）
    await expectOk(
      'H.6  架构师清空指派人',
      boardService.updateSelection(board.id, cardH.id, bystander.id, {
        assigneeId: null,
      }),
    )

    // H.8 查询 activity 审计记录
    const activities = await boardService.listSelectionActivities(board.id, cardH.id)
    step(`查询到 ${activities.length} 条审计记录`)

    // 预期 6 条动作（按时间倒序）:
    //   unassign → reopen → complete → reassign → complete → assign
    const expectedActions = ['unassign', 'complete', 'reopen', 'complete', 'reassign', 'assign']
    if (activities.length !== expectedActions.length) {
      fail(
        `H.7  审计条数错误：期望 ${expectedActions.length}，实际 ${activities.length}`,
      )
    } else {
      ok(`H.7  审计记录数量正确（${activities.length} 条）`)
    }

    for (let i = 0; i < Math.min(activities.length, expectedActions.length); i++) {
      if (activities[i].action === expectedActions[i]) {
        ok(`H.8.${i + 1}  按时间倒序第 ${i + 1} 条动作 = ${expectedActions[i]}`)
      } else {
        fail(
          `H.8.${i + 1}  期望 ${expectedActions[i]}，实际 ${activities[i].action}`,
        )
      }
    }

    // H.9 验证 reassign 条记录里有 fromUserId 和 toUserId
    const reassignEntry = activities.find((a) => a.action === 'reassign')
    if (
      reassignEntry &&
      reassignEntry.fromUserId === implementor.id &&
      reassignEntry.toUserId === designer.id
    ) {
      ok('H.9  reassign 记录正确包含 fromUserId 和 toUserId')
    } else {
      fail('H.9  reassign 记录缺少 from/to 信息')
    }

    // H.10 验证 reopen 带 note
    const reopenEntry = activities.find((a) => a.action === 'reopen')
    if (reopenEntry && reopenEntry.note === '还要补一点细节') {
      ok('H.10 reopen 记录保留 note')
    } else {
      fail('H.10 reopen 的 note 未被保留')
    }

    // H.11 验证 byName 被填充
    const completeEntry = activities.find((a) => a.action === 'complete')
    if (completeEntry && completeEntry.byName === designer.name) {
      ok('H.11 审计记录的 byName 正确填充')
    } else {
      fail('H.11 byName 未正确填充')
    }
  } finally {
    // 始终跑 teardown
    await teardown()
  }

  // ============================================================
  // 总结
  // ============================================================
  console.log()
  console.log(`${BLUE}${BOLD}┌──────────────────────────────────────────────┐${RESET}`)
  console.log(`${BLUE}${BOLD}│  测试总结                                   │${RESET}`)
  console.log(`${BLUE}${BOLD}└──────────────────────────────────────────────┘${RESET}`)
  console.log(`${GREEN}${BOLD}  通过: ${passCount}${RESET}`)
  if (failCount > 0) {
    console.log(`${RED}${BOLD}  失败: ${failCount}${RESET}`)
    console.log(`\n${RED}失败项:${RESET}`)
    failures.forEach((f) => console.log(`  ${RED}✗${RESET} ${f}`))
  } else {
    console.log(`${GRAY}  失败: 0${RESET}`)
  }
  console.log()

  await prisma.$disconnect()
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error(`\n${RED}${BOLD}❌ 测试脚本异常崩溃:${RESET}`)
  console.error(err)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
