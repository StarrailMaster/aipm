# AIPM TODOs

Outstanding work items deferred from specs/reviews. Each item includes enough context for someone picking it up in 3 months to understand the motivation and starting point.

---

## Learning Copilot Feature (PRD: docs/prd-learning-copilot.md)

> **Note (2026-04-12)**: 由 D29 scope 扩张决策，原本列在这里的 6 个 TODO（KR 时间维度 / 模板库 / Tree Viz / Cross-Project / A/B Variants / ICE-RICE）全部**移入 Week 1-7 主 scope**，不再是 TODO。下面只保留真正延后的 items。

### [DEFERRED] Copilot Token Cost Admin Widget

**What**: 在 `/settings/ai-config` 页面加一个 "Copilot 成本" widget，展示本月已用 tokens / 美元 + 月度成本趋势图。

**Why**: Eng Review Issue 10 决定每次 Copilot 调用写 `ai_cost_log` 行（time/tokens_in/tokens_out/cost_usd/trigger_type），但没做前端展示。Admin 看不到成本就无法主动预算管理。

**Pros**:
- Admin 提前发现成本异常（比如 worker 重试风暴烧钱）
- 多人用起来后知道每人每月 Copilot 成本，便于定价
- 月度 $20+ 时 Dashboard 告警（Issue 10 定的阈值）

**Cons**:
- 需要后端聚合查询（按月 GROUP BY）
- 前端新组件 + chart 库（或用现有 echarts）
- MVP 时单人用成本可忽略（$3/月），不值得提前投入

**Context**:
- Issue 10 决定：`COPILOT_MAX_MONTHLY_CALLS = 500` 硬保护
- `ai_cost_log` 表结构已在 PRD 中隐含（需要时自己设计）
- Settings 页已有 AI 配置 tab，可复用布局
- 前端已用 echarts（在 dashboard/efficiency 看板里）

**Start here**:
1. 后端：`GET /api/v1/copilot/cost-summary?month=2026-05`
2. Response: `{ totalCalls, totalTokensIn, totalTokensOut, costUsd, breakdownByTriggerType }`
3. 前端：`views/settings/ai-config.vue` 加 Cost Card 组件
4. 月度环比 + 告警红线（$20/月）

**Effort**: human: 1 天 / CC: ~25 分钟

**Depends on**: `ai_cost_log` 表已实施（Week 3 Issue 10 实施时）

---

### [DEFERRED] Legacy Experience → Learning AI 回扫

**What**: 一次性 Python/Node 脚本，让 Copilot 扫所有老的 experience 数据（`Learning` 表里 `source=HUMAN` 的），生成结构化的 learning 和 pattern。

**Why**: 老 experience 是自由文本踩坑笔记，没有 metricType/baseline/delta 等结构化字段。直接进 Copilot 上下文效果差（会产出空洞泛化）。但是它们仍然有历史价值。

**Pros**:
- 把 AIPM 之前 6 个月的"隐性知识"结构化
- 冷启动阶段增加 learning 数量
- 发现历史 pattern（"当时为什么一个月都在弄 XX"）

**Cons**:
- 需要专门为 legacy 设计 prompt（和主 Copilot 不同）
- 提取的 "learning" 可能质量差（原数据结构缺失）
- 一次性脚本，没有长期维护价值

**Context**:
- Issue 10 决定：主 Copilot 不进 legacy experience 上下文
- experience 表已迁移到 `learning source=HUMAN`
- 数据已保留，随时可扫

**Start here**:
1. `scripts/migrate-legacy-experience.ts`
2. 批量读 `learning WHERE source=HUMAN AND hypothesisId IS NULL`
3. 每 10 条 batch 一次发给 Claude
4. Legacy prompt: "这些是过去 6 个月的踩坑笔记，请提取 learning + pattern..."
5. 写回 `learning source=AI_GENERATED hypothesisId=null legacy=true`

**Effort**: human: 3 天 / CC: ~45 分钟

**Depends on**: 主 Learning Copilot 在生产稳定运行 1 月以上

---

### [DEFERRED] 接入 Amplitude / GA4 / Mixpanel 自动数据源

**What**: Hypothesis Variant 的结果数据从外部分析平台 API 自动拉取，不再手填。

**Why**: MVP 用户手填 Variant 数据（sampleSize + conversionCount）。这是"质量洼地"——30 秒的操作但经常被忘记。集成后 variant 数据自动刷新，pattern recognition 质量大增。

**Pros**:
- 零手填，真实数据进 Copilot
- Pattern 质量显著提升（样本数更大、更新及时）
- 支持更多 metric 类型（页面停留时间、scroll depth 等原 pixel 级数据）

**Cons**:
- 需要用户自己的 Amplitude/GA4/Mixpanel 账号 + API key + 埋点配置
- OAuth 或 API key 管理复杂度
- Event name mapping：用户的 event 命名和 hypothesis 的 metric 不一定对齐
- 多平台 SDK 维护成本

**Context**:
- PRD §15 N1：本次不做
- 用户手填变成主要数据路径至少 3 个月后，才有必要自动化
- 如果用户使用期发现数据手填是瓶颈，提前触发

**Start here**:
1. 新模块 `services/analytics-integrations/`
2. 先做 Amplitude adapter（他们的 Chart API 可以查 cohort conversion rate）
3. AI 配置页加 "Analytics Integration" tab
4. Hypothesis detail 页的 variant card 加 "从 Amplitude 拉取" 按钮

**Effort**: human: 2 周 / CC: ~3 小时

**Depends on**: Learning Copilot 生产运行 3+ 月，用户主动要求自动化

---

## General Infrastructure

### [DEFERRED] 全局输入校验重构到 Zod

**What**: 现有后端所有 route 都用手写 `if (!req.body.x) throw new AppError(...)` 校验。迁移到 Zod schema 统一校验。

**Why**: Issue 4 引入 Zod 只是为了 Copilot 输出校验，但 Zod 的真正价值是**所有 route 的输入校验**也可以用它。

**Pros**:
- 一致的错误消息
- 与 TypeScript 类型绑定（单一真源）
- 复杂 validation（nested / conditional）更易写

**Cons**:
- 重构面积大（每个 route 都要改）
- 已有代码 work 得好好的，YAGNI 风险

**Context**:
- Issue 4 已决定引入 Zod 依赖
- 当前校验分散在各 route 文件开头
- 可以逐个 route 迁移，不强制一次性

**Start here**:
1. 选一个小 route（比如 `/learnings` POST）做第一个迁移
2. 对比前后代码行数 + 可读性
3. 决定是否继续推广

**Effort**: human: 5 天（全量） / CC: ~2 小时

**Depends on**: Zod 已经在项目里（Week 1 装了）

---

## ✅ Completed / Moved to Main Scope (2026-04-12 D29)

以下 items 原本在 TODOs.md，但 D29 scope 扩张决策后**移入 Week 1-7 主 scope**，不再是 TODO：

- ~~KR startDate/endDate 时间维度~~ → Week 1 infra + G8 Epic 10
- ~~Hypothesis 模板库~~ → Week 2-4 + G6 Epic 5
- ~~Parent 树形可视化~~ → Week 4 + G11 Epic 8
- ~~跨项目对比看板~~ → Week 4 + G10 Epic 9
- ~~A/B Variants + 显著性检验~~ → Week 1-2 stats + Week 4 UI + G7 Epic 6
- ~~ICE/RICE 打分~~ → Week 2 backend + Week 4 UI + G9 Epic 7
- ~~移动端响应式~~ → Week 1 breakpoints + Week 5 polish + G12 Epic 11
- ~~中英双语 i18n~~ → Week 1 vue-i18n + Week 5 翻译 + G13 Epic 12
