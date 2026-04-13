import prisma from '../src/prisma/client'

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } })
  console.log('--- Projects ---')
  for (const p of projects) console.log(p.id, '|', p.name)

  console.log('\n--- Iterations ---')
  const iterations = await prisma.iteration.findMany({
    select: { id: true, name: true, projectId: true, status: true, boardId: true },
  })
  for (const it of iterations) {
    console.log(it.id, '|', it.name, '| proj=', it.projectId, '|', it.status, '| board=', it.boardId)
  }

  console.log('\n--- FeedPackages ---')
  const pkgs = await prisma.feedPackage.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      phase: true,
      status: true,
      iterationId: true,
      createdAt: true,
      _count: { select: { files: true } },
    },
  })
  console.log('count =', pkgs.length)
  for (const p of pkgs) {
    console.log(`- ${p.id} | ${p.name} | iter=${p.iterationId} | files=${p._count.files} | ${p.createdAt.toISOString()}`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
