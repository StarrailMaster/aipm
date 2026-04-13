# Agent Team Roles

## 第一批：基础设施

### infra-agent
项目初始化和基础设施搭建。搭好骨架让后续 agent 可以直接写业务。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围: 全部（初始化阶段独占）
- 输出: 可运行的 monorepo 项目，含认证、权限、DB、API 框架、接口契约文件
- 验收: `pnpm dev` 前后端启动 + 登录注册跑通 + `npx tsc --noEmit` 通过

---

## 第二批：核心数据模块（并行）

### agent-sop
SOP 知识库 + 模板库。Markdown 文档管理、版本控制、导入导出。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/sop/`, `packages/server/src/routes/templates/`, `packages/server/src/services/sop/`, `packages/server/src/services/template/`
  - 前端: `packages/web/src/views/sop/`, `packages/web/src/views/templates/`, `packages/web/src/stores/sop.ts`, `packages/web/src/stores/template.ts`, `packages/web/src/api/sop.ts`, `packages/web/src/api/template.ts`
  - Prisma: 可新增 SOP/Template 相关 model
- 契约文件: `contracts/api-sop.ts`, `contracts/api-template.ts`
- 验收: SOP CRUD + 版本管理 + Markdown 编辑 + 模板套用编辑 + `npx tsc --noEmit` 通过

### agent-prompt
提示词库 + Skill 库。社区协作机制（Star/Fork/PR）。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/prompts/`, `packages/server/src/routes/skills/`, `packages/server/src/services/prompt/`, `packages/server/src/services/skill/`
  - 前端: `packages/web/src/views/prompts/`, `packages/web/src/views/skills/`, `packages/web/src/stores/prompt.ts`, `packages/web/src/stores/skill.ts`, `packages/web/src/api/prompt.ts`, `packages/web/src/api/skill.ts`
  - Prisma: 可新增 Prompt/Skill/Star/Fork/PR 相关 model
- 契约文件: `contracts/api-prompt.ts`, `contracts/api-skill.ts`
- 验收: 提示词 CRUD + Star/Fork/PR 完整流程 + Skill 关联 Git 地址 + `npx tsc --noEmit` 通过

### agent-org
组织模型 + 角色权限 + 两人制小组 + 原岗位标签。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/org/`, `packages/server/src/routes/squads/`, `packages/server/src/services/org/`, `packages/server/src/services/squad/`
  - 前端: `packages/web/src/views/settings/`, `packages/web/src/stores/org.ts`, `packages/web/src/stores/squad.ts`, `packages/web/src/api/org.ts`, `packages/web/src/api/squad.ts`
  - Prisma: 可新增/修改 User/Squad/Project 相关 model
- 契约文件: `contracts/api-org.ts`
- 验收: 小组 CRUD + 原岗位标签 + 角色权限校验 + `npx tsc --noEmit` 通过

---

## 第三批：业务流程模块（并行）

### agent-board
协同白板 + 提示词选择器 + 选择结果共享。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/boards/`, `packages/server/src/services/board/`, `packages/server/src/ws/board.ts`
  - 前端: `packages/web/src/views/board/`, `packages/web/src/stores/board.ts`, `packages/web/src/api/board.ts`, `packages/web/src/components/board/`
- 契约文件: 无独立契约，依赖 `contracts/api-prompt.ts`（选择器需要查询提示词）
- 验收: 白板画布 + 提示词选择器（搜索+筛选+卡片）+ WebSocket 选择结果同步 + `npx tsc --noEmit` 通过

### agent-feed
投喂包引擎 + 自动组装 + 依赖管理 + 分阶段执行。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/feeds/`, `packages/server/src/services/feed/`
  - 前端: `packages/web/src/views/feeds/`, `packages/web/src/stores/feed.ts`, `packages/web/src/api/feed.ts`
- 契约文件: `contracts/api-feed.ts`
- 验收: 投喂包 CRUD + 依赖关系图 + 分阶段执行 + 状态追踪 + 一键复制 + `npx tsc --noEmit` 通过

### agent-design
设计精修管理 + 状态流转 + Figma 链接 + 锁定/解锁。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/designs/`, `packages/server/src/services/design/`
  - 前端: `packages/web/src/views/designs/`, `packages/web/src/stores/design.ts`, `packages/web/src/api/design.ts`
- 契约文件: `contracts/api-design.ts`
- 验收: 设计稿 CRUD + 状态流转（5 态）+ 锁定/解锁 + Figma 链接 + `npx tsc --noEmit` 通过

---

## 第四批：数据+智能模块（并行）

### agent-dash
项目数据看板（分层下钻）+ OKR 指标看板。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/dashboard/`, `packages/server/src/routes/okr/`, `packages/server/src/services/dashboard/`, `packages/server/src/services/okr/`
  - 前端: `packages/web/src/views/dashboard/`, `packages/web/src/views/okr/`, `packages/web/src/stores/dashboard.ts`, `packages/web/src/stores/okr.ts`, `packages/web/src/api/dashboard.ts`, `packages/web/src/api/okr.ts`
- 契约文件: `contracts/api-dashboard.ts`, `contracts/api-okr.ts`
- 验收: 看板分层下钻（公司→项目→小组）+ OKR CRUD + 手动数据录入 + 达标判定 + `npx tsc --noEmit` 通过

### agent-exp
经验沉淀 + AI 总结反馈 + 仓库管理 Agent + 架构师审批。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围:
  - 后端: `packages/server/src/routes/feedback/`, `packages/server/src/routes/warehouse/`, `packages/server/src/services/feedback/`, `packages/server/src/services/warehouse/`
  - 前端: `packages/web/src/views/experience/`, `packages/web/src/stores/experience.ts`, `packages/web/src/api/feedback.ts`, `packages/web/src/api/warehouse.ts`
- 契约文件: `contracts/api-feedback.ts`
- 验收: 反馈提交 + AI 总结（可 mock）+ Agent 审核/去重/归类 + 审批合并 + `npx tsc --noEmit` 通过

---

## 第五批：CLI + 集成测试

### agent-cli
aipm CLI 工具（login/pull/list/status/feedback）。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围: `packages/cli/`
- 验收: 5 个命令全部可用 + API 认证对接 + `npx tsc --noEmit` 通过

### agent-qa
集成测试 + E2E 测试。
- 工具: Read, Write, Edit, Bash, Glob, Grep
- 工作范围: `tests/`, `packages/server/src/**/*.test.ts`（只读业务代码，只写测试代码）
- 验收: 核心工作流 ①→⑤ 全流程 E2E 通过 + API 接口测试覆盖所有模块
