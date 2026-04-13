# AIPM — AI-Native 项目管理平台

## 项目概述

面向 AI 时代的内部项目管理平台。OKR 指标驱动迭代，内置提示词/Skill/模板协作。
400 人团队自用，全部自研，内部部署。

## 技术栈（强制）

- 前端：Vue 3 + TypeScript + Vite + Vue Router + Pinia
- UI 组件库：Element Plus
- 后端：Node.js + TypeScript + Express
- 数据库：PostgreSQL + Prisma ORM
- 实时通信：WebSocket（ws 库）
- 认证：JWT（jsonwebtoken）
- 包管理：pnpm workspace（monorepo）

## 项目结构

```
aipm/
├── packages/
│   ├── web/                    # Vue 3 前端
│   │   ├── src/
│   │   │   ├── views/          # 页面
│   │   │   ├── components/     # 组件
│   │   │   ├── composables/    # 组合函数
│   │   │   ├── stores/         # Pinia stores
│   │   │   ├── api/            # API 客户端
│   │   │   ├── router/         # 路由
│   │   │   ├── types/          # 前端专有类型
│   │   │   └── utils/          # 工具函数
│   │   └── ...
│   ├── server/                 # Node.js 后端
│   │   ├── src/
│   │   │   ├── routes/         # API 路由（按模块分目录）
│   │   │   ├── services/       # 业务逻辑层
│   │   │   ├── middleware/     # 中间件（auth, error, logger）
│   │   │   ├── prisma/         # Prisma schema + migrations
│   │   │   ├── ws/             # WebSocket handlers
│   │   │   └── utils/          # 工具函数
│   │   └── ...
│   └── cli/                    # aipm CLI 工具（第五批开发）
│       └── ...
├── contracts/                  # 接口契约（TypeScript 类型，全 agent 共享）
│   ├── api-sop.ts
│   ├── api-prompt.ts
│   ├── api-skill.ts
│   ├── api-template.ts
│   ├── api-org.ts
│   ├── api-feed.ts
│   ├── api-design.ts
│   ├── api-dashboard.ts
│   ├── api-okr.ts
│   ├── api-feedback.ts
│   └── common.ts               # 公共类型（统一响应、分页、认证等）
├── tasks/                      # Agent team 任务文件
├── CLAUDE.md                   # 本文件
├── AGENTS.md                   # Agent 角色定义
└── prd.md                      # 产品需求文档（链接）
```

## API 规范（所有 agent 必须遵守）

### 统一响应结构

```typescript
interface ApiResponse<T = any> {
  code: number        // 0 = 成功，非 0 = 错误码
  message: string     // 成功提示或错误信息
  data: T | null      // 业务数据
  timestamp: number   // 毫秒时间戳
}
```

### 分页请求

```typescript
interface PaginationQuery {
  page: number        // 从 1 开始
  pageSize: number    // 默认 20，最大 100
}

interface PaginationResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

### 路由命名

```
GET    /api/v1/{module}          # 列表（支持分页、搜索、筛选）
GET    /api/v1/{module}/:id      # 详情
POST   /api/v1/{module}          # 创建
PUT    /api/v1/{module}/:id      # 更新
DELETE /api/v1/{module}/:id      # 删除
POST   /api/v1/{module}/:id/{action}  # 特殊操作（如 star, fork, lock）
```

### 认证

- 所有 API 需要 JWT 认证（除 /api/v1/auth/* 外）
- Token 通过 `Authorization: Bearer <token>` 传递
- JWT payload 包含 `{ userId, role, squadId }`

### 错误码

```
0     = 成功
1xxxx = 认证相关（10001 未登录，10002 token 过期，10003 权限不足）
2xxxx = 参数校验（20001 缺少必填参数，20002 参数格式错误）
3xxxx = 业务错误（按模块分段，如 30xxx SOP，31xxx 提示词）
5xxxx = 系统错误
```

## 数据库规范

### Prisma 模型规范

- 所有表必须有 `id`（String, uuid）、`createdAt`、`updatedAt`
- 软删除使用 `deletedAt` 字段（DateTime?）
- 时间字段使用 DateTime 类型（Prisma 自动处理）
- API 响应中的时间字段转为毫秒时间戳（number）
- 枚举使用 Prisma enum 定义

### 模型分层

- Prisma Model = 数据库模型（仅 Prisma 操作使用）
- DTO = API 入参/出参（仅路由层使用）
- 通过 contracts/ 下的类型定义 DTO，所有 agent 共享

## 前端规范

### 页面组织

```
src/views/
├── auth/               # 登录注册
├── dashboard/          # 仪表盘 + 项目看板
├── board/              # 协同白板
├── sop/                # SOP 知识库
├── prompts/            # 提示词库
├── skills/             # Skill 库
├── templates/          # 模板库
├── feeds/              # 投喂包
├── designs/            # 设计精修
├── okr/                # OKR 看板
├── experience/         # 经验沉淀
└── settings/           # 设置（团队、小组、项目）
```

### 状态管理

- 使用 Pinia，每个模块一个 store
- Store 命名：`use{Module}Store`（如 `usePromptStore`）

### API 客户端

- 使用 axios 封装统一请求
- 自动附加 JWT token
- 统一错误处理和 loading 状态
- 每个模块一个 API 文件（如 `api/prompt.ts`）

## 代码风格

- TypeScript strict mode
- ESLint + Prettier
- 变量命名：camelCase
- 类型/接口命名：PascalCase
- 文件命名：kebab-case
- Vue 组件命名：PascalCase
- Composition API（不使用 Options API）

## 禁止事项

- 禁止使用 any 类型（必须明确类型定义）
- 禁止硬编码配置（数据库 URL、密钥等走环境变量）
- 禁止跨模块直接访问数据库（通过 service 层调用）
- 禁止在前端存储敏感信息（除 JWT token 外）
- 禁止引入 CLAUDE.md 未列出的新框架或 CSS 方案
- 禁止修改 contracts/ 下的类型定义（除 infra-agent 外）
- 禁止修改其他 agent 负责的路由和页面

## Agent 协作规则

- 每个 agent 只能修改自己范围内的文件
- 跨模块依赖通过 contracts/ 下的类型定义对齐
- 如果发现 contracts/ 中缺少需要的类型，在任务报告中注明，由 Team Lead 协调
- 所有 agent 完成后必须通过 `npx tsc --noEmit` 类型检查
