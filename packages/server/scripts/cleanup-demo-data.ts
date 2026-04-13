/**
 * 清理开发测试时产生的脏数据。
 *
 * 用法：
 *   cd packages/server && npx tsx scripts/cleanup-demo-data.ts
 *
 * 会清理（软删除）：
 *   D-3: SopDocument title 是 "111" 或其他明显占位符
 *   D-4: Prompt name 是 "测试*"、"demo*" 的明显测试数据
 *   D-5: 审计残留的 audit-test-* / audit-weak-* / audit-long-* 测试用户
 *
 * 不清理：
 *   - 真实项目数据
 *   - 系统默认项目/小组
 *   - 管理员账号
 *
 * 幂等安全：多次运行无副作用，只处理匹配条件的记录。
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const JUNK_SOP_TITLES = ['111', '222', 'test', 'Test', '测试', '占位']
const JUNK_PROMPT_NAME_PATTERNS = [
  /^测试贡献积分$/,
  /^测试prompt$/i,
  /^demo prompt/i,
]
const JUNK_USER_EMAIL_PATTERNS = [/^audit-(test|weak|long|empty)-/i]

async function main() {
  let totalCleaned = 0

  // D-3: 清理 SOP 文档垃圾标题
  const junkSopDocs = await prisma.sopDocument.findMany({
    where: {
      deletedAt: null,
      title: { in: JUNK_SOP_TITLES },
    },
    select: { id: true, title: true },
  })
  if (junkSopDocs.length > 0) {
    await prisma.sopDocument.updateMany({
      where: { id: { in: junkSopDocs.map((d) => d.id) } },
      data: { deletedAt: new Date() },
    })
    console.log(
      `[cleanup] D-3 软删除 ${junkSopDocs.length} 份垃圾 SOP 文档：${junkSopDocs
        .map((d) => d.title)
        .join('、')}`,
    )
    totalCleaned += junkSopDocs.length
  }

  // D-4: 清理测试提示词
  const allPrompts = await prisma.prompt.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const junkPrompts = allPrompts.filter((p) =>
    JUNK_PROMPT_NAME_PATTERNS.some((pat) => pat.test(p.name)),
  )
  if (junkPrompts.length > 0) {
    await prisma.prompt.updateMany({
      where: { id: { in: junkPrompts.map((p) => p.id) } },
      data: { deletedAt: new Date() },
    })
    console.log(
      `[cleanup] D-4 软删除 ${junkPrompts.length} 个测试提示词：${junkPrompts
        .map((p) => p.name)
        .join('、')}`,
    )
    totalCleaned += junkPrompts.length
  }

  // D-5: 清理审计残留的测试用户
  const allUsers = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, name: true },
  })
  const junkUsers = allUsers.filter((u) =>
    JUNK_USER_EMAIL_PATTERNS.some((pat) => pat.test(u.email)),
  )
  if (junkUsers.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: junkUsers.map((u) => u.id) } },
      data: { deletedAt: new Date() },
    })
    console.log(
      `[cleanup] D-5 软删除 ${junkUsers.length} 个审计测试用户：${junkUsers
        .map((u) => u.email)
        .join('、')}`,
    )
    totalCleaned += junkUsers.length
  }

  // 统计孤儿 Board：有 board 但 iteration.boardId 指向它但 iteration 已删或不存在
  const orphanBoards = await prisma.board.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const iterationBoardIds = await prisma.iteration.findMany({
    select: { boardId: true },
  })
  const validBoardIds = new Set(
    iterationBoardIds
      .map((i) => i.boardId)
      .filter((id): id is string => id !== null),
  )
  const trulyOrphan = orphanBoards.filter((b) => !validBoardIds.has(b.id))
  if (trulyOrphan.length > 0) {
    await prisma.board.updateMany({
      where: { id: { in: trulyOrphan.map((b) => b.id) } },
      data: { deletedAt: new Date() },
    })
    console.log(
      `[cleanup] S-2 软删除 ${trulyOrphan.length} 个孤儿 Board：${trulyOrphan
        .map((b) => b.name)
        .join('、')}`,
    )
    totalCleaned += trulyOrphan.length
  }

  if (totalCleaned === 0) {
    console.log('[cleanup] ✅ 数据库干净，没有需要清理的垃圾')
  } else {
    console.log(`\n[cleanup] ✅ 共清理 ${totalCleaned} 条脏数据`)
  }
}

main()
  .catch((err) => {
    console.error('[cleanup] 失败：', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
