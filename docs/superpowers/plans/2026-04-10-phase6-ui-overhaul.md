# Phase 6 — UI 全面优化实施计划

> **For agentic workers:** 本计划将被 subagent-driven-development 分解执行。
> 每个 Req 都是一个独立的交付单元，必须通过 spec review + quality review 才能进入下一个。
>
> **Verification discipline:** 每个 Req 完成后必须跑 `vue-tsc --noEmit`（web）+ `tsc --noEmit`（server）+ 相关 E2E 断言，看到 `exit 0` / 断言绿才能 claim 完成。

**Goal:** 基于 Byron 的 7 条需求把 AIPM 的 UI 和 SOP 数据模型做整体升级，让平台真正成为"可批量使用的提示词组合平台"。

**Architecture:**
- 数据层：SOP 模型重构为 `提示词引用组合`，不再持有 content；白板卡片加 override 字段支持本地修改。
- 后端：最小的 schema 改动，保持既有 E2E 73 断言全绿。
- 前端：整合 3 个知识类模块到一个 tab 容器；详情页三 tabs；设计/工作台状态机合并成 `待办/已完成`；仪表盘改名；效率看板用 PM 专业维度。

**Tech Stack:** Vue 3 + Element Plus + echarts + Pinia；Express + Prisma；PostgreSQL；pnpm workspace。

**Plan location:** `docs/superpowers/plans/2026-04-10-phase6-ui-overhaul.md`

---

## 需求映射表

| Req # | Byron 原文要点 | 交付物 | 依赖 | 是否并行 |
|---|---|---|---|---|
| **Req 1** | 白板卡片加编辑（改当前环节的提示词，非公共库） + 新增自定义提示词卡片 | schema 加 override 字段 + 白板详情 drawer 新 tab + 新建卡片按钮 | 需求 7 后的 schema | 半并行 |
| **Req 2** | SOP/Skill/Prompt 库合并成"知识库"，页面内 tab 切换 | 新 `views/knowledge/` 容器 + 3 个子路由 + 菜单合并 | **依赖 Req 7** | 串行 |
| **Req 3** | 提示词详情页：提示词内容/版本历史/改进建议 改成三 tab 并排 | `views/prompts/detail.vue` 布局改造 | 独立 | 并行 |
| **Req 4** | 设计/工作台：所有状态合并成`待办/已完成`；驳回在待办里加红标；**一键推进到下一个状态** | workbench + designs 视图 + 前端 store + 可能微调后端 action | 独立 | 并行 |
| **Req 5** | 仪表盘改名"我的待办"；效率看板补 PM 专业维度（周期时间/积压/瓶颈/WIP/驳回率） | 后端 `/dashboard/efficiency` 扩字段 + 前端视图 + 多 echarts 图 | 独立 | 并行 |
| **Req 6** | 经验沉淀反馈表单：问题描述 + md 上传 + 关联提示词（搜索含类型筛选） | 后端反馈 endpoint 扩字段 + 前端 `views/experience/index.vue` | 独立 | 并行 |
| **Req 7** | SOP 库 = 提示词组合库；SopDocument 存 promptIds 而非 content；去掉 SopProject.projectId | schema 重构 + service + view 重写 | **阻塞 Req 2** | **我主线串行执行** |

---

## 执行波次

**波次 1（我主线，串行）**：Req 7（schema 破坏性改动）→ Req 1 schema 追加（加 override 字段）。
在波次 1 完成前，没有任何 agent 可以动。

**波次 2（并行 agents）**：Req 3、Req 4、Req 5、Req 6 —— 4 个独立 agent 并行。
Req 1 的前端部分也进入这一波（需要 schema 已就绪）。

**波次 3（我主线）**：Req 2（知识库合并）—— 等 Req 7 SOP 重构和所有知识类视图都就绪后整合。

**波次 4（我主线）**：自我审计 + 修复。

---

## Req 7 — SOP 库重构（我主线优先）

### 7.1 数据模型变更

**旧模型**：
```
SopProject { id, name, projectId, ... }
SopDocument { id, sopProjectId, layer, title, content, version, ... }
SopDocumentVersion { ... content ... }
```

**新模型**：
```prisma
model SopProject {
  id          String       @id @default(uuid())
  name        String
  version     String       @default("v1.0.0")
  description String?
  // projectId  ← 删除（Byron: 不关联项目，是共用模板）
  visibility  Visibility   @default(team)
  createdById String
  createdBy   User         @relation("SopProjectCreator", fields: [createdById], references: [id])
  documents   SopDocument[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  deletedAt   DateTime?

  @@map("sop_projects")
}

model SopDocument {
  id           String                  @id @default(uuid())
  sopProjectId String
  sopProject   SopProject              @relation(fields: [sopProjectId], references: [id])
  layer        SopLayer
  title        String
  description  String?                 // 新：对这个条目的简要说明（原 content 角色）
  sortOrder    Int                     @default(0)
  tags         String[]
  createdById  String
  createdBy    User                    @relation("SopDocumentCreator", fields: [createdById], references: [id])
  // NEW: 引用的提示词（有序列表）
  prompts      SopDocumentPrompt[]
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @updatedAt
  deletedAt    DateTime?

  @@map("sop_documents")
}

// 新连接表（一对多连到 Prompt，保留顺序和可选注释）
model SopDocumentPrompt {
  id             String      @id @default(uuid())
  sopDocumentId  String
  sopDocument    SopDocument @relation(fields: [sopDocumentId], references: [id], onDelete: Cascade)
  promptId       String
  prompt         Prompt      @relation("SopPromptRefs", fields: [promptId], references: [id])
  sortOrder      Int         @default(0)
  note           String?     // 本 SOP 里对这个提示词的补充说明
  createdAt      DateTime    @default(now())

  @@index([sopDocumentId, sortOrder])
  @@map("sop_document_prompts")
}
```

**Prompt** 加反向关系 `sopReferences SopDocumentPrompt[] @relation("SopPromptRefs")`

**迁移策略**：
- Byron 已经清空过数据一次，现在可以再清。
- `SopDocument.content` 改成 `description`（字段改名），历史 content 丢弃。
- `SopDocumentVersion` 暂时保留（可能不再有意义，但先不动）。
- `SopProject.projectId` 字段删除（相关查询全部更新）。

### 7.2 后端 service / route 调整

- `services/sop.service.ts` 里所有 `sopProject.findMany({ where: { projectId } })` 改成 `findMany({})`（返回所有共用模板）
- 删除/调整所有基于 projectId 的过滤
- `SopDocument` 的 content 读写全部改成 `description`
- 新增 endpoint：`POST /sop/documents/:id/prompts`（添加引用）、`DELETE /sop/documents/:id/prompts/:refId`（移除）、`PUT /sop/documents/:id/prompts/:refId`（改 sortOrder/note）
- 改写 `listSopDocuments` 让它 include prompts with Prompt 关联

### 7.3 前端 api/store/view 调整

- `api/sop.ts`：SopDocument 类型 `content → description`；加 `SopDocumentPrompt` 类型；新增引用 CRUD API
- `stores/sop.ts`：store 同步
- `views/sop/detail.vue`：以前是 content 编辑框，现在是"从提示词库选择提示词列表"界面（每行一个 Prompt 引用 + 可拖排序 + note）
- `views/sop/index.vue`：list 显示 prompt 引用数，而非 content 长度

### 7.4 下游影响

- `iteration.service.ts` 的 `advanceIteration` 之前用 `sopDocument.content` 作为 FeedFile 的文件内容 —— 需要改成：用 SopDocument 引用的所有 Prompt.content 拼接起来作为文件内容
- `board.service.ts` 的 addSelection / getBoardDetail 里的 sopDocumentId 处理保持不变（只显示 title/layer）
- `ai.service.ts` 的 SOP Agent 之前把 sopDocument.content 的前 500 字传给 LLM —— 改成把所有引用 prompt 的拼接前 500 字传给 LLM

### 7.5 Verification

- `cd packages/server && npx prisma validate && npx prisma db push --accept-data-loss` → 成功
- `tsc --noEmit` → 除了 auth.ts 预存错误外干净
- 跑 E2E 73 断言 → 全绿（advance 流程依赖 sopDocument → prompt 拼接）
- 手动建一个 SopProject + SopDocument + 挂 2 个 Prompt → 能从前端列表看到

---

## Req 1 — 白板卡片编辑 + 新增自定义提示词

### 1.1 Schema

`BoardSelection` 加 3 个字段：
```prisma
model BoardSelection {
  // ... existing
  // Req 1: 本地 override（只对 prompt 类型有意义）
  promptOverrideTitle   String?   // 用户改过的标题；null = 沿用公共库
  promptOverrideContent String?   // 用户改过的内容；null = 沿用公共库
  promptOverrideTags    String[]  // 用户改过的标签；空数组 = 沿用
}
```

**新增"本地提示词卡片"**：当 `type='prompt' AND promptId IS NULL` 时，卡片是纯本地的，3 个 override 字段必填（至少 title 和 content）。

### 1.2 后端

- `addSelection` 支持 `type='prompt'` 时 `promptId` 可选
- 新增参数 `promptOverrideTitle/Content/Tags`
- `updateSelection` 支持更新这三个字段
- `getBoardDetail` 的 selection 响应：加 `effectiveTitle/effectiveContent/effectiveTags` 计算字段（override 优先，否则用公共库的）

### 1.3 前端

- `PromptCard.vue` 显示 `effectiveTitle`（而不是 `prompt.name`），并在 override 非空时显示小铅笔图标
- 白板详情 drawer（已有）加新 tab "编辑提示词"：
  - 标题、内容、标签 3 个字段
  - 保存 → `updateSelection({ promptOverrideTitle, promptOverrideContent, promptOverrideTags })`
  - "恢复公共库" 按钮 → 三个 override 清空
- 白板工具栏加"新增提示词"按钮（图标 `Plus`）：
  - 弹出对话框 3 字段输入
  - 确定 → `addSelection({ type: 'prompt', promptId: null, promptOverrideTitle, promptOverrideContent, promptOverrideTags, layer: activeLayer })`

### 1.4 Verification
- 修改已有 prompt 卡片的 override → 卡片标题变化；公共库 Prompt 不变
- 恢复公共库 → 恢复
- 新增自定义卡片 → 出现在当前 tab
- tsc 干净

---

## Req 3 — 提示词详情页三 tabs

### 3.1 现状

`views/prompts/detail.vue` 纵向依次展示：提示词内容、版本历史、改进建议（PR）

### 3.2 目标

顶部加 `el-tabs` 横向三个 tab：
- Tab 1 "提示词内容"：当前编辑器 + 元数据
- Tab 2 "版本历史"：历史时间线
- Tab 3 "改进建议"（PR 列表）

每 tab 的内容从旧布局平移过来，保留数据加载逻辑。

### 3.3 Verification
- vue-tsc 干净
- 打开一个提示词详情页，3 个 tab 都能切换 + 数据渲染

---

## Req 4 — 设计/工作台状态机合并 + 一键推进

### 4.1 产品语义

**旧状态机**（FeedPackage）：BLOCKED / PENDING / IN_PROGRESS / REVIEW / DONE / REWORK
**旧状态机**（DesignDraft）：AI_GENERATED / PENDING_REFINE / REFINING / PENDING_CONFIRM / CONFIRMED / LOCKED

**Byron 要的新语义**：前端只让用户看到 `待办 / 已完成`；被驳回的在待办里加红色"驳回"标签；每个环节只需要点"完成"按钮一次。

**不动后端 schema**（保持兼容），只做**前端的虚拟分组**：
- `待办` = 除 `DONE` 以外的所有 FeedPackage 状态（FeedPackage）或除 `CONFIRMED/LOCKED` 以外的所有 DesignDraft 状态
- `已完成` = `DONE`（Feed）或 `CONFIRMED/LOCKED`（Design）
- `被驳回` 标签 = `REWORK` (Feed) 或 `PENDING_REFINE` + 有驳回 changeLog (Design)

**一键推进** = 前端提供一个主按钮 "完成并进入下一步"，内部判断当前状态后自动串联多个 API 调用：
- Workbench 包 `IN_PROGRESS` → `REVIEW`（状态）→ 如果有设计图要求且未审核通过则弹出"推给设计"对话框（不再分两步）
- Workbench 包 `REVIEW + APPROVED` → 一键 `DONE`
- Workbench 包 `REWORK`（被驳回）→ 一键弹出"重新提交"对话框
- Design draft `PENDING_REFINE/REFINING` → 一键弹出"完成"确认（调 completeDesign）
- Design draft `PENDING_CONFIRM` → 一键 confirmDesign

### 4.2 前端改动

- `views/workbench/index.vue`：移除详情 drawer 里原来"开关 / 推给设计 / 审核 / 完成"的分散按钮，替换成一个大的 "完成此环节" 按钮（智能判断下一步）
- 分组显示改成 `待办 / 已完成` 两 tab
- 被驳回的在待办列表上显示红色"驳回"徽章

- `views/designs/index.vue`：同样改成 `待办 / 已完成`（不再是 5 列看板），被驳回加红标
- 详情 drawer 里只有一个 "完成此环节" 按钮

### 4.3 Verification
- tsc 干净
- 手动跑一遍 workbench 流程（创建 → 推给设计 → 审核通过 → 完成）每步只点一个按钮

---

## Req 5 — 仪表盘改名 + 效率看板 PM 专业维度

### 5.1 改名

- 菜单 "仪表盘" → "我的待办"
- `views/dashboard/index.vue` 页面标题同步

### 5.2 新 PM 维度

参考 Kanban / Scrum 的精益度量：

| 维度 | 定义 | 展示方式 |
|---|---|---|
| **吞吐量 (Throughput)** | 本期内完成的任务数 | 已有（保留） |
| **周期时间 (Cycle Time)** | 任务从 `IN_PROGRESS` 到 `DONE` 的平均时长 | **新增折线图 + 中位数** |
| **前置时间 (Lead Time)** | 任务从创建到完成的平均时长 | **新增** |
| **WIP 数 (Work in Progress)** | 当前同时 in-progress 的任务数 | **新增** |
| **驳回率 (Rejection Rate)** | `feed_rejected / 总 review 数` | **新增** |
| **工作时间分布** | 按小时统计完成动作 | **新增 24 小时柱状图** |
| **最频繁协作者** | 与我最常配合的前 5 位用户 | **新增列表** |
| **Layer 分布** | 我处理的白板卡片按 layer 分类 | **新增饼图** |
| **当前待办数** | 保留已有 | — |

### 5.3 后端改动

`services/dashboard/index.ts` 的 `getEfficiency` 扩返回字段：
```typescript
interface EfficiencyResult {
  // ... existing
  cycleTime: {
    avg: number  // ms
    median: number
    p90: number
  }
  leadTime: { avg: number, median: number, p90: number }
  wip: number
  rejectionRate: number  // 0-1
  hourlyDistribution: number[]  // 24 个数
  topCollaborators: Array<{ userId: string; name: string; count: number }>
  layerBreakdown: Array<{ layer: string; count: number }>
}
```

计算口径：
- **cycleTime**：扫本期完成的 FeedPackage，用 `updatedAt - createdAt`（近似）或从 activity log 里算
- **leadTime**：同上但从 iteration.createdAt 算起
- **wip**：实时查 `feedPackage where assigneeId=me AND status IN [IN_PROGRESS] AND deletedAt=null`
- **rejectionRate**：本期 `pushToDesign 次数` vs `rejectDesign 次数`
- **hourlyDistribution**：遍历 BoardSelection.completedAt 和 FeedPackage/DesignDraft 完成时间，按小时分桶
- **topCollaborators**：从审计日志或 FeedPackage 关联里抽 assigneeId≠me 的用户，计数取前 5
- **layerBreakdown**：从 BoardSelection 里按 layer group count

### 5.4 前端改动

`views/dashboard/efficiency.vue` 增加图表：
- 已有 5 个 stat card + 折线图保留
- 新增：cycleTime/leadTime 的柱状图（3 个数 avg/median/p90）
- 新增：24 小时 hourly distribution 柱状图
- 新增：layer 饼图
- 新增：topCollaborators 列表
- 新增：rejectionRate + WIP 的两个小 stat card

### 5.5 Verification

- tsc 干净
- 后端 getEfficiency 手动测试返回新字段
- 前端页面所有图表渲染

---

## Req 6 — 经验沉淀反馈表单改造

### 6.1 字段变更

**旧**：rawDescription + attachments + iterationId + feedPackageId
**新**：`problemDescription: string`（问题描述）+ `mdAttachmentUrl: string?`（md 上传 URL）+ `relatedPromptId: string?`（关联的提示词 ID）

### 6.2 后端

- 数据库 `Feedback` 表字段保持兼容（`rawDescription` 继续用作 problemDescription，`attachments` 数组里只用第一个元素作为 md 文件 URL）
- **或者** 加字段：`relatedPromptId: String?`
- `POST /feedback` 支持新字段

### 6.3 前端

- `views/experience/index.vue` 的提交表单改 3 个字段：
  - 问题描述（textarea）
  - Markdown 文件上传（`el-upload` 单文件，只接受 `.md`，上传到 `POST /upload` 或本地 base64 存储）
  - 关联提示词（两级选择：先选类型 PromptCategory，再搜索 Prompt）

### 6.4 Verification

- tsc 干净
- 提交一个反馈看数据库字段正确

---

## Req 2 — 知识库合并（最后做）

### 2.1 路由

```typescript
{
  path: 'knowledge',
  component: () => import('@/views/knowledge/index.vue'),
  meta: { title: '知识库' },
  children: [
    { path: '', redirect: '/knowledge/prompts' },
    { path: 'prompts', name: 'KnowledgePrompts', component: () => import('@/views/prompts/index.vue') },
    { path: 'skills', name: 'KnowledgeSkills', component: () => import('@/views/skills/index.vue') },
    { path: 'sop', name: 'KnowledgeSop', component: () => import('@/views/sop/index.vue') },
  ],
}
```

保留原 `/prompts/:id`、`/skills/:id`、`/sop/:id` 作为详情子路由（或者挂到 knowledge 下）。

### 2.2 父容器

`views/knowledge/index.vue` 做成 tabs shell（类似 dashboard 容器）：
```vue
<el-tabs v-model="activeTab" @tab-change="handleTabChange">
  <el-tab-pane label="提示词" name="prompts" />
  <el-tab-pane label="Skill" name="skills" />
  <el-tab-pane label="SOP 模板" name="sop" />
</el-tabs>
<router-view />
```

### 2.3 菜单调整

`DashboardLayout.vue` 侧边栏：
- 删除 SOP / 提示词库 / Skill 库 3 个菜单项
- 新增 "知识库" → `/knowledge`
- active menu 逻辑：`route.path.startsWith('/knowledge')` 激活 `/knowledge`

### 2.4 Verification

- vue-tsc 干净
- 菜单点击显示 tabs；各 tab 路由跳转正确；详情页还能打开

---

## 总体 Verification 流程

完成所有 Req 后执行：

1. `cd packages/server && npx prisma validate && npx tsc --noEmit` → 只剩 auth.ts 预存错误
2. `cd packages/web && npx vue-tsc --noEmit` → exit 0
3. `cd packages/server && npx tsx scripts/test-workflow-e2e.ts` → 73/73 绿
4. **手动浏览器 smoke（如果时间允许）**

全部绿后才能 claim Phase 6 完成。

---

## 风险 & 回退

- **Req 7 SOP 重构** 是破坏性改动。如果迁移出错，可以 `git reset` 到 Phase 5 的 commit + db 重新 push 旧 schema。
- **Req 4 状态机合并** 只改前端，后端 schema 不动，可以随时回退前端。
- **Req 5 效率看板**：新增字段如果后端计算有 bug，前端降级显示旧字段。
- **Req 1 白板 override**：override 字段都是可空，没写入的数据跟之前完全兼容。

---

## 进度跟踪（活表）

- [ ] Req 7 — SOP schema + backend + frontend
- [ ] Req 1 schema — BoardSelection 加 3 个 override 字段
- [ ] Req 1 backend + frontend
- [ ] Req 3 — Prompt detail tabs
- [ ] Req 4 — workbench + designs 状态机合并 + 一键推进
- [ ] Req 5 — 效率看板 PM 维度
- [ ] Req 6 — 经验沉淀表单
- [ ] Req 2 — 知识库合并（最后做）
- [ ] 全局 tsc + E2E 验证
- [ ] 自我审计 code review
- [ ] 修复发现的问题
