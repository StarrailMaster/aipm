// 诊断脚本：导出"套餐购买页改版"任务对应白板的全部原始内容，
// 让 Byron 能直接看到 23 万字符到底是什么。
//
// 运行：cd packages/server && npx tsx scripts/inspect-board-export.ts
//
// 产出三个文件到 /tmp/：
//   1. board-inspect-summary.txt        — 统计摘要
//   2. board-inspect-detail.md          — 每个卡片的明细（类型/标题/字符数/前 300 字符）
//   3. board-inspect-assembled.md       — exportBoard() 实际输出的完整内容

import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
import { exportBoard } from '../src/services/board/index'

const prisma = new PrismaClient()

async function main() {
  // 1. 找到"套餐购买页改版"任务
  const iter = await prisma.iteration.findFirst({
    where: { name: { contains: '套餐购买页' } },
    select: { id: true, name: true, boardId: true },
  })
  if (!iter || !iter.boardId) {
    console.log('❌ 找不到套餐购买页任务或未关联白板')
    return
  }

  const board = await prisma.board.findFirst({
    where: { id: iter.boardId, deletedAt: null },
    include: { selections: true },
  })
  if (!board) {
    console.log('❌ 白板不存在')
    return
  }

  const summary: string[] = []
  const detail: string[] = []

  const header = `任务: ${iter.name}
白板: ${board.name}
白板 ID: ${iter.boardId}
总 selections: ${board.selections.length}
`
  console.log(header)
  summary.push(header)

  // 2. 按类型分组
  const byType = board.selections.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1
    return acc
  }, {})
  const typeLine = `类型分布: ${JSON.stringify(byType)}`
  console.log(typeLine)
  summary.push(typeLine + '\n')

  // 3. 拉各类内容
  const promptSels = board.selections.filter((s) => s.type === 'prompt' && s.promptId)
  const sopSels = board.selections.filter((s) => s.type === 'sop_doc' && s.sopDocumentId)
  const textSels = board.selections.filter((s) => s.type === 'text' && s.content)
  const stickySels = board.selections.filter((s) => s.type === 'sticky' && s.content)

  const prompts =
    promptSels.length > 0
      ? await prisma.prompt.findMany({
          where: { id: { in: promptSels.map((s) => s.promptId!) } },
          select: { id: true, name: true, content: true },
        })
      : []
  const promptMap = new Map(prompts.map((p) => [p.id, p]))

  const sopDocs =
    sopSels.length > 0
      ? await prisma.sopDocument.findMany({
          where: { id: { in: sopSels.map((s) => s.sopDocumentId!) } },
          select: { id: true, title: true, layer: true, content: true, deletedAt: true },
        })
      : []
  const sopDocMap = new Map(sopDocs.map((d) => [d.id, d]))

  // 4. 提示词明细
  detail.push('# 提示词卡片明细\n')
  let promptTotal = 0
  console.log(`\n=== 提示词（${promptSels.length} 个） ===`)
  for (const sel of promptSels) {
    const p = promptMap.get(sel.promptId!)
    if (!p) {
      detail.push(`## [缺失] 提示词 ID ${sel.promptId}\n`)
      continue
    }
    const len = p.content?.length ?? 0
    promptTotal += len
    console.log(`  ${len.toString().padStart(7)} chars | ${p.name}`)
    detail.push(`## ${p.name}`)
    detail.push(`- 字符数: ${len}`)
    detail.push(`- Selection ID: ${sel.id}`)
    detail.push(``)
    detail.push('```')
    detail.push((p.content ?? '').slice(0, 500))
    if ((p.content?.length ?? 0) > 500) detail.push('... (truncated)')
    detail.push('```')
    detail.push('')
  }
  summary.push(`提示词总字符: ${promptTotal}`)

  // 5. SOP 文档明细
  detail.push('---\n')
  detail.push('# SOP 文档明细\n')
  let sopTotal = 0
  console.log(`\n=== SOP 文档（${sopSels.length} 个，去重后 ${sopDocs.length} 个） ===`)
  const sortedSops = sopSels
    .map((sel) => {
      const doc = sopDocMap.get(sel.sopDocumentId!)
      return { sel, doc, len: doc?.content?.length ?? 0 }
    })
    .sort((a, b) => b.len - a.len)

  for (const { sel, doc, len } of sortedSops) {
    if (!doc) {
      detail.push(`## [缺失] SOP 文档 ID ${sel.sopDocumentId}\n`)
      continue
    }
    sopTotal += len
    const delFlag = doc.deletedAt ? ' [DELETED]' : ''
    console.log(`  ${len.toString().padStart(7)} chars | ${doc.layer.padEnd(8)} | ${doc.title}${delFlag}`)
    detail.push(`## [${doc.layer}] ${doc.title}${delFlag}`)
    detail.push(`- 字符数: ${len}`)
    detail.push(`- Selection ID: ${sel.id}`)
    detail.push(`- Doc ID: ${doc.id}`)
    detail.push(``)
    detail.push('```')
    detail.push((doc.content ?? '').slice(0, 500))
    if ((doc.content?.length ?? 0) > 500) detail.push('... (truncated)')
    detail.push('```')
    detail.push('')
  }
  summary.push(`SOP 总字符: ${sopTotal}`)
  summary.push(`SOP selection 数: ${sopSels.length}`)
  summary.push(`SOP 文档去重后数: ${sopDocs.length}`)

  // 6. 检查 SOP 重复
  const sopDocIds = sopSels.map((s) => s.sopDocumentId!)
  const counts = sopDocIds.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1
    return acc
  }, {})
  const dupes = Object.entries(counts).filter(([, n]) => n > 1)
  if (dupes.length > 0) {
    console.log(`\n⚠️  SOP 文档重复:`)
    detail.push('## ⚠️ 重复选中的 SOP 文档\n')
    for (const [id, n] of dupes) {
      const doc = sopDocMap.get(id)
      console.log(`    × ${n}: ${doc?.title ?? id}`)
      detail.push(`- × ${n}: ${doc?.title ?? id}`)
    }
    detail.push('')
    summary.push(`重复 SOP 文档: ${dupes.length} 个`)
  }

  // 7. 文本 + 便利贴
  const textTotal = textSels.reduce((n, s) => n + (s.content?.length ?? 0), 0)
  const stickyTotal = stickySels.reduce((n, s) => n + (s.content?.length ?? 0), 0)
  console.log(`\n=== 其他 ===`)
  console.log(`  文本: ${textSels.length} 个 / ${textTotal} chars`)
  console.log(`  便利贴: ${stickySels.length} 个 / ${stickyTotal} chars`)
  summary.push(`文本: ${textSels.length} 个 / ${textTotal} chars`)
  summary.push(`便利贴: ${stickySels.length} 个 / ${stickyTotal} chars`)

  // 8. 调用 exportBoard 拿真实输出
  const exp = await exportBoard(iter.boardId)
  const finalLen = exp.assembledContent.length
  console.log(`\n=== exportBoard 实际输出 ===`)
  console.log(`  总字符数: ${finalLen}`)
  summary.push('')
  summary.push(`=== exportBoard() 实际输出 ===`)
  summary.push(`总字符数: ${finalLen}`)

  // 9. 写文件
  writeFileSync('/tmp/board-inspect-summary.txt', summary.join('\n'))
  writeFileSync('/tmp/board-inspect-detail.md', detail.join('\n'))
  writeFileSync('/tmp/board-inspect-assembled.md', exp.assembledContent)

  console.log(`\n✅ 已写入:`)
  console.log(`   /tmp/board-inspect-summary.txt    (摘要)`)
  console.log(`   /tmp/board-inspect-detail.md      (每张卡片明细)`)
  console.log(`   /tmp/board-inspect-assembled.md   (exportBoard 完整输出)`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
