// 诊断：对比"套餐购买页改版"和"11"这两个任务的白板内容 + 最新一次推进结果
// 运行：cd packages/server && npx tsx scripts/diagnose-rounds.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function inspectOne(searchName: string) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`🎯 任务: ${searchName}`)
  console.log('='.repeat(70))

  const iter = await prisma.iteration.findFirst({
    where: { name: { contains: searchName } },
    select: { id: true, name: true, boardId: true, status: true },
  })
  if (!iter) {
    console.log('❌ 找不到任务')
    return
  }
  console.log(`任务 ID: ${iter.id}`)
  console.log(`白板 ID: ${iter.boardId}`)
  console.log(`状态: ${iter.status}`)

  if (!iter.boardId) return

  // === 白板上的 selections ===
  const board = await prisma.board.findFirst({
    where: { id: iter.boardId, deletedAt: null },
    include: { selections: true },
  })
  if (!board) {
    console.log('❌ 白板不存在')
    return
  }

  const byType = board.selections.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1
    return acc
  }, {})
  console.log(`\n📋 白板 Selection 分布 (${board.selections.length} 个):`)
  for (const [type, n] of Object.entries(byType)) {
    console.log(`   ${type}: ${n}`)
  }

  // Prompt selections 明细
  const promptSels = board.selections.filter((s) => s.type === 'prompt' && s.promptId)
  if (promptSels.length > 0) {
    console.log(`\n🔵 Prompt 卡片 (${promptSels.length}):`)
    const promptIds = promptSels.map((s) => s.promptId!).filter(Boolean)
    const prompts = await prisma.prompt.findMany({
      where: { id: { in: promptIds } },
      select: { id: true, name: true, content: true },
    })
    const promptMap = new Map(prompts.map((p) => [p.id, p]))
    for (const sel of promptSels) {
      const p = promptMap.get(sel.promptId!)
      if (p) {
        console.log(`   ${(p.content?.length ?? 0).toString().padStart(6)} chars | ${p.name}`)
      } else {
        console.log(`   [缺失] ${sel.promptId}`)
      }
    }
  }

  // SOP 文档明细
  const sopSels = board.selections.filter((s) => s.type === 'sop_doc' && s.sopDocumentId)
  if (sopSels.length > 0) {
    console.log(`\n🟢 SOP 文档 (${sopSels.length}):`)
    const docIds = sopSels.map((s) => s.sopDocumentId!).filter(Boolean)
    const docs = await prisma.sopDocument.findMany({
      where: { id: { in: docIds } },
      select: { id: true, title: true, layer: true, content: true, deletedAt: true },
    })
    const docMap = new Map(docs.map((d) => [d.id, d]))
    // 排序：按 sel 顺序
    let dupCount = 0
    const seen = new Set<string>()
    for (const sel of sopSels) {
      const d = docMap.get(sel.sopDocumentId!)
      if (!d) {
        console.log(`   [缺失] ${sel.sopDocumentId}`)
        continue
      }
      const delFlag = d.deletedAt ? ' [已删除]' : ''
      const dupFlag = seen.has(d.id) ? ' [重复]' : ''
      if (seen.has(d.id)) dupCount++
      seen.add(d.id)
      console.log(
        `   ${(d.content?.length ?? 0).toString().padStart(6)} chars | ${d.layer.padEnd(14)} | ${d.title}${delFlag}${dupFlag}`,
      )
    }
    console.log(`   去重后: ${seen.size} 份 (重复 ${dupCount})`)
  }

  // === 当前投喂包 ===
  const packages = await prisma.feedPackage.findMany({
    where: { iterationId: iter.id, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      files: {
        select: { id: true, name: true, layer: true, content: true },
      },
    },
  })

  console.log(`\n📦 当前投喂包 (${packages.length} 个):`)
  if (packages.length === 0) {
    console.log('   (无)')
    return
  }

  for (const pkg of packages) {
    console.log(
      `   第 ${pkg.sortOrder} 轮 [${pkg.phase}] ${pkg.name} — ${pkg.files.length} 个文件`,
    )
    for (const f of pkg.files) {
      const layerTag = f.layer === 'core' ? '🎯' : '📄'
      console.log(`      ${layerTag} [${f.layer}] ${f.name} (${f.content?.length ?? 0} chars)`)
    }
  }

  // 分析：文件层面的覆盖率
  const allContextFiles = packages.flatMap((p) => p.files.filter((f) => f.layer === 'context'))
  const uniqueFileNames = new Set(allContextFiles.map((f) => f.name))
  console.log(`\n📊 文件覆盖统计:`)
  console.log(`   投喂包中 context 文件总数: ${allContextFiles.length}`)
  console.log(`   去重后唯一文件数: ${uniqueFileNames.size}`)
  console.log(`   白板 SOP 文档去重数: ${new Set(sopSels.map((s) => s.sopDocumentId)).size}`)
}

async function main() {
  await inspectOne('套餐购买页')
  await inspectOne('11')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
