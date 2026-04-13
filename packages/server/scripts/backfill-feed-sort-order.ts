import prisma from '../src/prisma/client'

/**
 * 回填历史 FeedPackage 的 sortOrder 和 name。
 * 规则：
 * - 同一 iteration 内按 createdAt ASC 依次编号 1, 2, 3...
 * - 如果 name 不以 "第 N 轮" 开头，自动加上前缀
 */
async function main() {
  const iterations = await prisma.iteration.findMany({ select: { id: true, name: true } })
  console.log(`Found ${iterations.length} iterations`)

  let totalUpdated = 0
  for (const iter of iterations) {
    const pkgs = await prisma.feedPackage.findMany({
      where: { iterationId: iter.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, sortOrder: true },
    })

    if (pkgs.length === 0) continue

    console.log(`\n[${iter.name}] ${pkgs.length} packages`)
    for (let i = 0; i < pkgs.length; i++) {
      const p = pkgs[i]
      const round = i + 1
      let newName = p.name

      // 剥离老前缀 "任务名 - " 或 "第 N 轮 · "
      newName = newName.replace(/^第\s*\d+\s*轮\s*·\s*/, '')
      newName = newName.replace(new RegExp(`^${iter.name}\\s*-\\s*`), '')

      newName = `第 ${round} 轮 · ${newName}`

      await prisma.feedPackage.update({
        where: { id: p.id },
        data: { sortOrder: round, name: newName },
      })
      console.log(`  ${p.id.slice(0, 8)} | sortOrder: ${p.sortOrder} → ${round} | name: ${newName}`)
      totalUpdated++
    }
  }

  console.log(`\nTotal updated: ${totalUpdated}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
