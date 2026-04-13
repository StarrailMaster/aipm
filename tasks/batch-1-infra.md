# 第一批：infra-agent 任务

## 你的角色

你是 AIPM 项目的基础设施工程师。你的任务是搭建整个项目的骨架，让后续 9 个 agent 可以直接在你的骨架上开发各自的模块。

## 核心约束

- **严格遵守 CLAUDE.md** 中的所有技术栈、目录结构、API 规范
- 你是唯一可以修改 `contracts/` 目录的 agent
- 你的输出必须可编译、可运行
- 不要写业务逻辑，只搭框架和骨架

---

## 任务清单

### 1. 初始化 monorepo

使用 pnpm workspace 创建 monorepo 结构：

```
aipm/
├── pnpm-workspace.yaml
├── package.json              # root，定义 workspace scripts
├── tsconfig.base.json        # 共享 TS 配置
├── .eslintrc.js
├── .prettierrc
├── .env.example
├── packages/
│   ├── web/                  # Vue 3 + Vite + Element Plus
│   └── server/               # Node.js + Express + TypeScript
└── contracts/                # 共享类型定义
```

**web 包**:
- `pnpm create vite` 初始化 Vue 3 + TypeScript
- 安装 Element Plus、Vue Router、Pinia、axios
- 配置 Vite proxy 到后端 `http://localhost:3000`
- 创建基础布局（左侧导航 + 顶部栏 + 内容区）
- 创建空路由骨架（每个模块一个空页面占位）
- 创建 axios 封装（自动附加 JWT、统一错误处理）

**server 包**:
- Express + TypeScript + tsx 热重载
- 配置 Prisma + PostgreSQL
- 创建基础中间件栈：
  - errorHandler（统一错误响应）
  - authMiddleware（JWT 校验）
  - roleMiddleware（角色权限校验）
  - requestLogger（请求日志）
  - cors
- 创建统一响应工具函数（success / error / paginate）
- 创建 WebSocket 服务骨架

### 2. 数据库 Schema（Prisma）

创建核心 model（后续 agent 可以新增字段，但不能修改已有字段）：

```prisma
// 用户
model User {
  id          String   @id @default(uuid())
  email       String   @unique
  password    String   // bcrypt hash
  name        String
  role        Role     @default(MEMBER)
  avatar      String?
  // 原岗位标签
  legacyRoles String[] // ["产品经理", "前端开发"]
  squadId     String?
  squad       Squad?   @relation(fields: [squadId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
}

enum Role {
  ADMIN              // 管理员
  ARCHITECT          // 需求架构师
  ENGINEER           // 实施工程师
  DESIGNER           // UI 设计师
}

// 项目
model Project {
  id          String   @id @default(uuid())
  name        String
  description String?
  ownerId     String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
}

// 小组（两人制）
model Squad {
  id          String   @id @default(uuid())
  name        String
  projectId   String
  members     User[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// 迭代
model Iteration {
  id          String          @id @default(uuid())
  projectId   String
  squadId     String
  name        String
  status      IterationStatus @default(SPEC)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

enum IterationStatus {
  SPEC        // ① 定规范
  DESIGN      // ② 生成设计图
  REFINE      // ③ UI 精修
  IMPLEMENT   // ④ 实施
  ACCEPT      // ⑤ 验收
  DONE        // 完成
}
```

运行 `npx prisma db push` 和 `npx prisma generate`。

### 3. 认证模块

完整实现（这是唯一需要写业务逻辑的部分，因为所有 agent 都依赖认证）：

**API 路由**:
- `POST /api/v1/auth/register` — 注册（email + password + name）
- `POST /api/v1/auth/login` — 登录（返回 JWT token）
- `GET /api/v1/auth/me` — 获取当前用户信息
- `PUT /api/v1/auth/me` — 更新个人信息

**实现要求**:
- 密码使用 bcrypt（cost=12）
- JWT 有效期 7 天
- JWT payload: `{ userId, role, squadId }`
- 注册时 role 默认 MEMBER，需要 ADMIN 手动修改角色

### 4. 角色权限中间件

```typescript
// 使用方式
router.get('/api/v1/admin/users', requireRole(Role.ADMIN), handler)
router.post('/api/v1/prompts', requireRole(Role.ARCHITECT, Role.ENGINEER), handler)
```

权限层级：`ADMIN > ARCHITECT > ENGINEER > DESIGNER`

### 5. 前端基础布局

创建 `DashboardLayout.vue`：

```
┌─────────────────────────────────────────┐
│ 顶部栏：Logo + 项目切换 + 通知 + 用户    │
├─────────┬───────────────────────────────┤
│ 左侧导航 │                               │
│ ------  │       内容区                   │
│ 仪表盘   │    （router-view）             │
│ 白板     │                               │
│ SOP 库   │                               │
│ 提示词库  │                               │
│ Skill库  │                               │
│ 模板库   │                               │
│ 投喂包   │                               │
│ 设计管理  │                               │
│ OKR看板  │                               │
│ 经验沉淀  │                               │
│ ------  │                               │
│ 设置     │                               │
├─────────┴───────────────────────────────┤
│ 底部状态栏（可选）                        │
└─────────────────────────────────────────┘
```

- 左侧导航使用 Element Plus Menu 组件
- 每个菜单项对应一个空页面（显示"模块名 - 开发中"）
- 登录页 + 路由守卫（未登录跳转登录页）

### 6. 前端路由骨架

```typescript
const routes = [
  { path: '/login', component: LoginView },
  { path: '/register', component: RegisterView },
  {
    path: '/',
    component: DashboardLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: () => import('@/views/dashboard/index.vue') },
      { path: 'board', component: () => import('@/views/board/index.vue') },
      { path: 'sop', component: () => import('@/views/sop/index.vue') },
      { path: 'prompts', component: () => import('@/views/prompts/index.vue') },
      { path: 'skills', component: () => import('@/views/skills/index.vue') },
      { path: 'templates', component: () => import('@/views/templates/index.vue') },
      { path: 'feeds', component: () => import('@/views/feeds/index.vue') },
      { path: 'designs', component: () => import('@/views/designs/index.vue') },
      { path: 'okr', component: () => import('@/views/okr/index.vue') },
      { path: 'experience', component: () => import('@/views/experience/index.vue') },
      { path: 'settings', component: () => import('@/views/settings/index.vue') },
    ]
  }
]
```

每个空页面只需要一个标题和"开发中"提示。

### 7. 接口契约文件

在 `contracts/` 下为每个模块创建类型定义骨架。每个文件包含：
- 请求/响应 DTO 类型
- 关键枚举
- 简短注释说明用途

参照 PRD 中的数据结构定义。详见 `contracts/` 目录下的各文件。

### 8. WebSocket 骨架

创建 WebSocket 服务，支持：
- 连接时 JWT 认证
- 房间机制（按 projectId 分房间）
- 消息类型定义（`selection_update` 等）
- 后续 agent 可以注册自己的消息处理器

---

## 交付物清单

- [ ] pnpm monorepo 结构，`pnpm install` 成功
- [ ] `pnpm dev` 前后端同时启动（web: 5173, server: 3000）
- [ ] PostgreSQL 连接成功，Prisma model 同步
- [ ] 注册 → 登录 → 获取用户信息 完整流程
- [ ] 角色权限中间件可用
- [ ] 前端布局 + 导航 + 路由守卫 + 所有空页面
- [ ] contracts/ 下所有接口契约文件
- [ ] WebSocket 服务启动，可连接
- [ ] `npx tsc --noEmit` 通过（前端+后端+contracts）
- [ ] `.env.example` 包含所有需要的环境变量

## 验收命令

```bash
pnpm install
pnpm dev                    # 前后端启动
npx tsc --noEmit            # 类型检查
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456","name":"Test"}'
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'
```
