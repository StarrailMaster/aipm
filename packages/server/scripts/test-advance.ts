// 直接调 advanceIteration 测试新的文件分组 Agent，不走 HTTP
// 运行：cd packages/server && HTTPS_PROXY=http://127.0.0.1:1082 HTTP_PROXY=http://127.0.0.1:1082 npx tsx scripts/test-advance.ts

import { PrismaClient } from '@prisma/client'
import { advanceIteration } from '../src/services/iteration.service'

const prisma = new PrismaClient()

async function main() {
  // 找到 "套餐购买页改版" 任务
  const iter = await prisma.iteration.findFirst({
    where: { name: { contains: '套餐购买页' } },
    select: { id: true, name: true, boardId: true },
  })
  if (!iter) {
    console.log('❌ 找不到套餐购买页任务')
    return
  }
  console.log(`🎯 任务: ${iter.name}`)
  console.log(`   任务 ID: ${iter.id}`)
  console.log(`   白板 ID: ${iter.boardId}`)
  console.log('')

  // 需要一个 userId 作为 createdById
  const anyUser = await prisma.user.findFirst({ select: { id: true, name: true } })
  if (!anyUser) {
    console.log('❌ 数据库没有用户，无法继续')
    return
  }
  console.log(`👤 以用户 ${anyUser.name ?? anyUser.id} 身份运行`)
  console.log('')

  console.log('🚀 调用 advanceIteration...')
  const t0 = Date.now()
  const result = await advanceIteration(iter.id, anyUser.id)
  const elapsed = Date.now() - t0
  console.log(`✅ 耗时 ${(elapsed / 1000).toFixed(1)}s`)
  console.log('')

  const a = result.agentResult
  if (!a) {
    console.log('⚠️  返回没有 agentResult')
    return
  }

  console.log('=== Agent 结果 ===')
  console.log(`清空旧包: ${a.resetDeletedCount}`)
  console.log(`规划轮数: ${a.plannedCount}`)
  console.log(`创建轮数: ${a.generatedCount}`)
  console.log(`白板文档总数: ${a.totalDocuments}`)
  console.log(`未分配文档数: ${a.unassignedDocumentCount}`)
  console.log('')
  console.log(`思路: ${a.reasoning}`)
  console.log('')
  console.log('=== 每一轮 ===')
  for (const r of a.rounds) {
    console.log(`  第 ${r.sortOrder} 轮 · ${r.title} [${r.phase}] — ${r.fileCount} 个文件`)
  }
  console.log('')

  // 2. 查数据库验证 FeedFile 内容正确
  console.log('=== 验证 FeedFile 内容 ===')
  const packages = await prisma.feedPackage.findMany({
    where: { iterationId: iter.id, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: { files: { orderBy: { createdAt: 'asc' } } },
  })

  for (const pkg of packages) {
    console.log(`\n📦 ${pkg.name}`)
    for (const f of pkg.files) {
      const preview = (f.content ?? '').slice(0, 80).replace(/\n/g, ' ')
      console.log(`   [${f.layer}] ${f.name} (${f.content.length} chars)`)
      console.log(`      ${preview}...`)
    }
  }
}

main()
  .catch((err) => {
    console.error('❌ 错误:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
