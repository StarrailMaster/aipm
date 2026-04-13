/**
 * 基础种子脚本：在数据库被重置后快速恢复一个可用状态。
 *
 * 用法：
 *   cd packages/server && npx tsx scripts/seed-admin.ts
 *
 * 会创建/确保：
 *   - 管理员用户：admin@aipm.com / admin123
 *   - 一个默认 Project
 *   - 一个默认 Squad（归属默认 Project）
 *
 * 如果表里已经有这些数据，脚本会幂等跳过。
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

type UserRole = 'ADMIN' | 'ARCHITECT' | 'ENGINEER' | 'DESIGNER'

async function ensureUser(
  email: string,
  password: string,
  name: string,
  role: UserRole = 'ADMIN',
  legacyRoles: string[] = ['产品经理', '前端开发', '后端开发'],
) {
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    const hashed = await bcrypt.hash(password, 10)
    user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        role,
        legacyRoles,
      },
    })
    console.log(`[seed] 创建用户：${email} / ${password} (${role})`)
  } else {
    console.log(`[seed] 用户已存在：${email} (${user.role})`)
  }
  return user
}

async function main() {
  // 1. 确保管理员用户们
  const admin = await ensureUser('admin@aipm.com', 'admin123', '管理员')
  await ensureUser('byron@aipm.dev', 'admin123', 'Byron')

  // 2. 三个测试账户（两人制小组 + 设计师）
  await ensureUser(
    'arch@aipm.dev',
    'test123',
    '测试架构师',
    'ARCHITECT',
    ['产品经理', 'UI设计', '前端开发'],
  )
  await ensureUser(
    'eng@aipm.dev',
    'test123',
    '测试工程师',
    'ENGINEER',
    ['后端开发', '测试工程师'],
  )
  await ensureUser(
    'designer@aipm.dev',
    'test123',
    '测试设计师',
    'DESIGNER',
    ['UI设计', 'UX设计'],
  )

  // 2. 确保默认 Project
  let project = await prisma.project.findFirst({ where: { name: '默认项目' } })
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: '默认项目',
        description: '系统自动创建的默认项目',
        ownerId: admin.id,
      },
    })
    console.log(`[seed] 创建默认项目 id=${project.id}`)
  } else {
    console.log(`[seed] 默认项目已存在 id=${project.id}`)
  }

  // 3. 确保默认 Squad
  let squad = await prisma.squad.findFirst({ where: { name: '默认小组' } })
  if (!squad) {
    squad = await prisma.squad.create({
      data: {
        name: '默认小组',
        projectId: project.id,
      },
    })
    console.log(`[seed] 创建默认小组 id=${squad.id}`)
  } else {
    console.log(`[seed] 默认小组已存在 id=${squad.id}`)
  }

  // 4. 把 admin 归到该 squad
  if (admin.squadId !== squad.id) {
    await prisma.user.update({
      where: { id: admin.id },
      data: { squadId: squad.id },
    })
    console.log(`[seed] admin squadId → ${squad.id}`)
  }

  console.log('\n✅ Seed 完成\n')
  console.log('登录账号：')
  console.log('  admin@aipm.com      / admin123   (ADMIN)')
  console.log('  byron@aipm.dev      / admin123   (ADMIN)')
  console.log('  arch@aipm.dev       / test123    (ARCHITECT - 需求架构师)')
  console.log('  eng@aipm.dev        / test123    (ENGINEER - 实施工程师)')
  console.log('  designer@aipm.dev   / test123    (DESIGNER - 设计师)')
  console.log('\n⚠️  前端如果有旧 token，请先退出登录再重新登录。')
}

main()
  .catch((err) => {
    console.error('[seed] 失败：', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
