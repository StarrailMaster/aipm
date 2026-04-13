/**
 * 一次性导入脚本：把 `~/Desktop/提示词/dashboard+数据库+接口 SOP/dashboard-sop/06-AI提示词/`
 * 下面的 13 个提示词 md 文件导入到提示词库，并组装成一个 SOP 模板 "代理 IP 仪表盘"。
 *
 * 用法：
 *   cd packages/server && npx tsx scripts/import-dashboard-sop.ts
 *
 * 幂等性：
 *   - 如果提示词（按 name 匹配）已存在，则跳过创建，直接复用它
 *   - 如果 SOP 模板同名已存在，则跳过创建，直接复用它
 *   - 如果 SOP 文档同标题已存在于同一 layer，则跳过创建，直接复用它
 *   - 如果引用 (sopDocumentId, promptId) 已存在，则跳过（避免重复）
 */
import { PrismaClient, PromptCategory, SopLayer } from '@prisma/client'
import * as fs from 'node:fs'
import * as path from 'node:path'

const prisma = new PrismaClient()

const SOP_PROJECT_NAME = '代理 IP 仪表盘'
const SOP_PROJECT_DESC = '一个 Go + React 全栈代理 IP 仪表盘项目的完整 SOP 模板，涵盖后端 5 轮、前端 6 轮、测试 1 轮，共 12 个 AI 提示词。'

const SOURCE_DIR =
  '/Users/byron/Desktop/提示词/dashboard+数据库+接口 SOP/dashboard-sop/06-AI提示词'

/** 导入的每个提示词定义 */
interface PromptDef {
  fileName: string
  /** 展示用的友好名称（会成为 Prompt.name） */
  name: string
  category: PromptCategory
  description: string
  tags: string[]
  /** 在 SOP 里放到哪一层 */
  sopLayer: SopLayer
  /** 在 SOP 文档里的序号（sortOrder） */
  sopOrder: number
  /** 在 SOP 文档里为该引用加一句话备注 */
  sopNote: string
}

/**
 * 13 个提示词的元数据
 *
 * 分配策略：
 *   - B1-B5 + T1 → BACKEND_ARCH 层，组成"后端开发 6 轮"
 *   - F1-F6 → FRONTEND_ARCH 层，组成"前端开发 6 轮"
 */
const PROMPTS: PromptDef[] = [
  // ===== 后端 6 轮 =====
  {
    fileName: 'B1-后端-项目初始化-Prompt.md',
    name: 'B1 · 后端项目初始化',
    category: 'BACKEND',
    description: '生成完整的 Go 项目骨架：三层架构目录、基础设施（Viper/Zap/GORM/Redis）、5 个业务模块空骨架、中间件栈、Makefile、docker-compose',
    tags: ['Go', '后端', '项目初始化', '骨架', 'AGENTS.md'],
    sopLayer: 'BACKEND_ARCH',
    sopOrder: 1,
    sopNote: '第 1 轮：生成项目骨架 + 基础设施',
  },
  {
    fileName: 'B2-后端-认证模块-Prompt.md',
    name: 'B2 · 后端认证模块',
    category: 'BACKEND',
    description: '实现完整认证和用户管理：JWT 登录、注册、发送验证码、密码重置。JWT HS256 + Bcrypt cost=12 + 频率限制。',
    tags: ['Go', '后端', '认证', 'JWT', 'Bcrypt'],
    sopLayer: 'BACKEND_ARCH',
    sopOrder: 2,
    sopNote: '第 2 轮：完整的登录 / 注册 / 验证码 / 密码重置',
  },
  {
    fileName: 'B3-后端-代理业务模块-Prompt.md',
    name: 'B3 · 后端代理业务模块',
    category: 'BACKEND',
    description: '实现 Proxy 和 Order 两个核心业务模块：账户 CRUD、白名单、流量统计、定价、订单创建/支付/取消。强制跨模块只通过 Service 接口依赖。',
    tags: ['Go', '后端', 'Proxy', 'Order', '业务模块'],
    sopLayer: 'BACKEND_ARCH',
    sopOrder: 3,
    sopNote: '第 3 轮：代理账户 / 白名单 / 订单 / 流量',
  },
  {
    fileName: 'B4-后端-账户与设置模块-Prompt.md',
    name: 'B4 · 后端账户与设置模块',
    category: 'BACKEND',
    description: '实现 User 和 Dashboard 两个模块。Dashboard 是聚合模块，无 Repository，仅通过其他模块的 Service 接口聚合数据。',
    tags: ['Go', '后端', 'User', 'Dashboard', '聚合模块'],
    sopLayer: 'BACKEND_ARCH',
    sopOrder: 4,
    sopNote: '第 4 轮：个人资料 / 仪表板聚合数据',
  },
  {
    fileName: 'B5-后端-Swagger补全-Prompt.md',
    name: 'B5 · 后端 Swagger 补全与审核',
    category: 'BACKEND',
    description: '非编码轮：参数校验补全、Swagger 全量重生成、错误码检查、i18n 补全、Config 表初始化。对 B1-B4 的代码进行全面质量审核。',
    tags: ['Go', '后端', 'Swagger', '代码审核', 'i18n'],
    sopLayer: 'BACKEND_ARCH',
    sopOrder: 5,
    sopNote: '第 5 轮：Swagger + 参数校验 + 错误码全量审核',
  },
  {
    fileName: 'T1-测试-自动化测试-Prompt.md',
    name: 'T1 · 后端自动化测试套件',
    category: 'TESTING',
    description: '生成完整测试套件：Service 层单元测试 ≥80% 覆盖率、Handler 层集成测试 ≥70% 覆盖率、bash 烟雾测试脚本、Swagger 一致性检查。',
    tags: ['Go', '测试', 'testify', '覆盖率', 'Playwright'],
    sopLayer: 'BACKEND_ARCH',
    sopOrder: 6,
    sopNote: '第 6 轮：自动化测试套件（单元 + 集成 + 烟雾）',
  },

  // ===== 前端 6 轮 =====
  {
    fileName: 'F1-前端-认证页面-Prompt.md',
    name: 'F1 · 前端认证页面',
    category: 'FRONTEND',
    description: '生成完整认证页面：登录、注册、忘记密码、重置密码。AuthLayout 双栏布局 + 表单校验 + Mock API + i18n。',
    tags: ['前端', 'React', '认证', '表单', 'i18n'],
    sopLayer: 'FRONTEND_ARCH',
    sopOrder: 1,
    sopNote: '第 1 轮：登录 / 注册 / 忘记密码 / 重置密码',
  },
  {
    fileName: 'F2-前端-Home与侧栏-Prompt.md',
    name: 'F2 · 前端 Home 与侧栏',
    category: 'FRONTEND',
    description: '生成仪表板首页和导航布局：三栏 DashboardLayout、Sidebar（7 态导航）、Header、首页卡片内容。',
    tags: ['前端', 'React', 'Dashboard', 'Sidebar', '布局'],
    sopLayer: 'FRONTEND_ARCH',
    sopOrder: 2,
    sopNote: '第 2 轮：DashboardLayout + 导航 + 首页内容',
  },
  {
    fileName: 'F3-前端-Proxy功能页-Prompt.md',
    name: 'F3 · 前端 Proxy 功能页',
    category: 'FRONTEND',
    description: '代理功能页完整实现：表格、表单、模态框、分页/排序/筛选、Mock API 数据真实可信、所有交互状态齐全。',
    tags: ['前端', 'React', 'Proxy', '表格', '表单'],
    sopLayer: 'FRONTEND_ARCH',
    sopOrder: 3,
    sopNote: '第 3 轮：Proxy 业务页（表格 + 表单 + 模态框）',
  },
  {
    fileName: 'F4-前端-Settings页面-Prompt.md',
    name: 'F4 · 前端 Settings 页面',
    category: 'FRONTEND',
    description: '账户设置页面：修改邮箱、修改密码、删除账户。骨架屏、Toast 提示、完整的表单校验、错误处理。',
    tags: ['前端', 'React', 'Settings', '表单', '骨架屏'],
    sopLayer: 'FRONTEND_ARCH',
    sopOrder: 4,
    sopNote: '第 4 轮：账户设置 / 修改邮箱 / 修改密码',
  },
  {
    fileName: 'F5-前端-接口对接-Prompt.md',
    name: 'F5 · 前端后端接口对接',
    category: 'INTEGRATION',
    description: '把 F1-F4 的 Mock API 替换为真实后端接口：axios 实例、请求/响应拦截器、Token 刷新（含防重入）、完整错误处理。',
    tags: ['前端', 'API 对接', 'axios', 'Token 刷新', '拦截器'],
    sopLayer: 'FRONTEND_ARCH',
    sopOrder: 5,
    sopNote: '第 5 轮：Mock → 真实 API + 拦截器 + Token 刷新',
  },
  {
    fileName: 'F6-前端-细节调优-Prompt.md',
    name: 'F6 · 前端细节调优',
    category: 'OPTIMIZATION',
    description: '前端全方位质量检查与优化：响应式断点、国际化完整性、动画、性能（lazy loading/code splitting）、可访问性。',
    tags: ['前端', '性能优化', '响应式', 'i18n', '可访问性'],
    sopLayer: 'FRONTEND_ARCH',
    sopOrder: 6,
    sopNote: '第 6 轮：质量检查 / 响应式 / 性能 / 可访问性',
  },
]

async function main() {
  // 1. 找一个 createdBy 用户（任何一个 ADMIN 都行，优先 byron@aipm.dev）
  const owner =
    (await prisma.user.findUnique({ where: { email: 'byron@aipm.dev' } })) ??
    (await prisma.user.findFirst({ where: { role: 'ADMIN', deletedAt: null } }))
  if (!owner) {
    throw new Error('找不到 ADMIN 用户，请先跑 `npx tsx scripts/seed-admin.ts`')
  }
  console.log(`[import] 使用 createdBy = ${owner.email} (${owner.id})\n`)

  // 2. 读文件 + 创建或复用 Prompt
  const promptIdMap = new Map<string, string>() // fileName → Prompt.id
  for (const def of PROMPTS) {
    const filePath = path.join(SOURCE_DIR, def.fileName)
    if (!fs.existsSync(filePath)) {
      console.warn(`[skip] 文件不存在：${filePath}`)
      continue
    }
    const content = fs.readFileSync(filePath, 'utf-8')

    // 以 name 作为幂等性 key
    const existing = await prisma.prompt.findFirst({
      where: { name: def.name, deletedAt: null },
    })
    let promptId: string
    if (existing) {
      promptId = existing.id
      console.log(`[reuse] 提示词已存在：${def.name}`)
    } else {
      const created = await prisma.prompt.create({
        data: {
          name: def.name,
          description: def.description,
          category: def.category,
          tags: def.tags,
          content,
          visibility: 'team',
          createdById: owner.id,
        },
      })
      promptId = created.id
      console.log(`[create] 提示词：${def.name} (${content.length.toLocaleString()} chars)`)
    }
    promptIdMap.set(def.fileName, promptId)
  }

  // 3. 创建或复用 SOP 模板
  let sopProject = await prisma.sopProject.findFirst({
    where: { name: SOP_PROJECT_NAME, deletedAt: null },
  })
  if (!sopProject) {
    sopProject = await prisma.sopProject.create({
      data: {
        name: SOP_PROJECT_NAME,
        description: SOP_PROJECT_DESC,
        visibility: 'team',
        createdById: owner.id,
      },
    })
    console.log(`\n[create] SOP 模板：${SOP_PROJECT_NAME} (id=${sopProject.id})`)
  } else {
    console.log(`\n[reuse] SOP 模板已存在：${SOP_PROJECT_NAME} (id=${sopProject.id})`)
  }

  // 4. 创建或复用每一层的 SopDocument + 挂提示词引用
  //    我们把 B1-B5+T1 放到 BACKEND_ARCH 层的一个文档里
  //    把 F1-F6 放到 FRONTEND_ARCH 层的一个文档里
  const groups = [
    {
      layer: 'BACKEND_ARCH' as SopLayer,
      title: '后端开发 6 轮（B1-B5 + T1）',
      description:
        '按顺序执行这 6 个提示词即可完成整个 Go 后端（项目初始化 → 认证 → 代理业务 → 账户设置 → Swagger 审核 → 测试套件）',
      tags: ['Go', '后端', '6 轮'],
      fileNames: [
        'B1-后端-项目初始化-Prompt.md',
        'B2-后端-认证模块-Prompt.md',
        'B3-后端-代理业务模块-Prompt.md',
        'B4-后端-账户与设置模块-Prompt.md',
        'B5-后端-Swagger补全-Prompt.md',
        'T1-测试-自动化测试-Prompt.md',
      ],
    },
    {
      layer: 'FRONTEND_ARCH' as SopLayer,
      title: '前端开发 6 轮（F1-F6）',
      description:
        '按顺序执行这 6 个提示词即可完成整个 React 前端（认证 → 布局 → 业务页 → 设置页 → 接口对接 → 质量调优）',
      tags: ['前端', 'React', '6 轮'],
      fileNames: [
        'F1-前端-认证页面-Prompt.md',
        'F2-前端-Home与侧栏-Prompt.md',
        'F3-前端-Proxy功能页-Prompt.md',
        'F4-前端-Settings页面-Prompt.md',
        'F5-前端-接口对接-Prompt.md',
        'F6-前端-细节调优-Prompt.md',
      ],
    },
  ]

  for (const group of groups) {
    let doc = await prisma.sopDocument.findFirst({
      where: {
        sopProjectId: sopProject.id,
        layer: group.layer,
        title: group.title,
        deletedAt: null,
      },
    })
    if (!doc) {
      doc = await prisma.sopDocument.create({
        data: {
          sopProjectId: sopProject.id,
          layer: group.layer,
          title: group.title,
          description: group.description,
          tags: group.tags,
          createdById: owner.id,
        },
      })
      console.log(`\n[create] SOP 文档：${group.title}`)
    } else {
      console.log(`\n[reuse] SOP 文档已存在：${group.title}`)
    }

    // 挂提示词引用
    for (let i = 0; i < group.fileNames.length; i++) {
      const fn = group.fileNames[i]
      const def = PROMPTS.find((p) => p.fileName === fn)
      if (!def) continue
      const promptId = promptIdMap.get(fn)
      if (!promptId) {
        console.warn(`  [skip] 找不到 promptId：${fn}`)
        continue
      }
      const existingRef = await prisma.sopDocumentPrompt.findFirst({
        where: { sopDocumentId: doc.id, promptId },
      })
      if (existingRef) {
        console.log(`  [reuse ref] ${def.name}`)
        continue
      }
      await prisma.sopDocumentPrompt.create({
        data: {
          sopDocumentId: doc.id,
          promptId,
          sortOrder: i,
          note: def.sopNote,
        },
      })
      console.log(`  [add ref] #${i + 1} ${def.name}`)
    }
  }

  console.log('\n✅ 导入完成')
  console.log(`\n📋 SOP 模板：${SOP_PROJECT_NAME}`)
  console.log(`   ID：${sopProject.id}`)
  console.log(`   打开方式：http://localhost:5173/sop/${sopProject.id}`)
  console.log(`   （或在「知识中心 → SOP 模板」里找"${SOP_PROJECT_NAME}"）`)
}

main()
  .catch((err) => {
    console.error('[import] 失败：', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
