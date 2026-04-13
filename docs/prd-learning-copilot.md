# Learning Copilot — AIPM 学习闭环 PRD

| 字段 | 值 |
|---|---|
| **项目** | AIPM (AI-Native Project Management) |
| **Feature Name** | Learning Copilot — Hypothesis-driven 学习闭环 + AI Copilot |
| **Version** | v2.0 (Full Scope) |
| **Status** | Eng Reviewed + Scope Expanded · Ready for Kickoff |
| **Owner** | Byron |
| **Target Ship** | **7 weeks** from kickoff (scope 扩张后，一次完整交付) |
| **Created** | 2026-04-11 |
| **Last Updated** | 2026-04-12 (D29 scope 扩张) |
| **文档位置** | `aipm/docs/prd-learning-copilot.md` |

---

## 0. Executive Summary

给现有 AIPM 系统增加一个 **hypothesis-driven 学习闭环**，用假设（Hypothesis）作为连接 OKR 和日常任务的一等公民。配套 **AI Copilot**，在假设关闭时立即生成 learnings，并在每天早晨生成跨假设规律发现。

**核心心智转换**：从"本周要做哪些任务"（执行管理）转换为"本周要验证哪些假设"（学习管理）。系统首页从"我的待办"被删除，替换为 **Learning Dashboard**。

**为什么现在做**：AI 让执行成本趋近于零，传统 PM 工具（Linear / Jira / Asana）都是"执行管理"范式的遗产。AIPM 有机会成为 **AI 时代第一个"学习速率管理系统"**，市场上没有直接对手。

**7 周完整交付**（Scope 扩张后，一次到位不分 v1/v2）：

- **Week 1 Infra**：数据模型（Hypothesis/Result/Template/Variant/Learning/Digest）+ BullMQ + Zod + stats.ts + **vue-i18n + 响应式框架**
- **Week 2 Backend**：Hypothesis/Variant/Template/Dashboard services + Copilot 骨架 + 显著性检验
- **Week 3 Backend Copilot + 前端基础**：BullMQ worker + Daily digest + `/dashboard` 重构 + Hypothesis CRUD UI
- **Week 4 Features**：模板库 UI + Variants UI + Tree Viz（@antv/g6）+ Cross-Project 看板 + ICE/RICE + KR 时间维度
- **Week 5 Polish 上半**：375/768/1280 响应式 + 中英双语 i18n 翻译 + 设计 review
- **Week 6 Polish 下半**：测试补齐（新代码 100% 覆盖）+ Copilot prompt 调优 + 故障演练
- **Week 7 灰度上线**：dogfood + Migration Stage 2 contract + 生产

**核心原则**（用户 D29 决策）：
- ✅ **不分 v1/v2**：所有原 v2 延后的功能现在就做（模板库、Variants、Tree、Cross-Project、ICE/RICE、KR 时间维度、移动端、i18n）
- ✅ **质量优先**：100% 测试覆盖、异步 AI、完整 edge case、安全 migration
- ❌ **仍不做**：接 Amplitude/GA4、Legacy miner、动现有 iteration/feed/board、SSO

---

## 1. Problem Statement

### 1.1 现状

AIPM 已有：
- **任务管理**：基于 `iteration` 模型的 SPEC → DESIGN → IMPLEMENT → ACCEPT 流转
- **白板**：多角色协作准备阶段
- **工作台**：AI feed packages（Byron 的核心创新）
- **团队看板**：贡献看板 + 效能看板
- **经验沉淀**（experience）：验收失败后的踩坑笔记
- **OKR 模型**：Objective + KeyResult 的基础 CRUD，UI 初级，没有和 iteration 关联

缺失的关键能力：
1. **任务和目标脱钩**：用户无法回答"我为什么做这个任务"。iteration 和 OKR 完全没有连接。
2. **交付即结束**：iteration 推到 DONE 就没人再管，没有数据回填机制验证"做了有没有用"。
3. **经验无法沉淀跨任务规律**：experience 只在验收失败时触发，且是"个人踩坑笔记"，没有跨假设的规律识别。
4. **OKR 看板静态**：KR 进度靠人拍脑袋手填，不是数据驱动。

### 1.2 用户痛点（来自需求对话）

> "我每周都会为项目做一个核心的排期计划，这些任务都是为了一个 OKR 去做的。我希望每次任务的功能迭代都有数据结果反馈回来，为了达到指标可能会多次迭代做 A/B 测试，我希望这些有价值的测试经验能够保留。"

**翻译成痛点清单**：
1. 功能上线后不知道"有没有用"——缺少 result capture
2. 为了证明一个假设要迭代 3-5 次——系统不认识"同一方向的多次尝试"
3. 失败经验每次都重新学——缺少跨假设的 pattern recognition
4. 周度排期和 OKR 进度是两张皮——无因果关联

### 1.3 深层洞察（产品定位）

**AI 让执行成本趋近于零**，以前做一个功能 2 周，现在 2 天。这意味着：
- 传统 PM 工具的核心价值（管理执行 flow）在迅速贬值
- 新的瓶颈是**判断力**（该做什么）和**学习速率**（多快能验证一个假设）
- 真正稀缺的资源从"工程师时间"变成"方向选择的质量"

AIPM 需要重新定位为 **"学习速率管理系统"** —— 核心度量不是 velocity（完成多少任务），而是 **learning velocity（验证了多少假设）**。

### 1.4 不做会怎样

- **短期**：AIPM 仍然是"又一个 AI 时代的 Linear"，没有差异化
- **中期**：用户使用系统但看不到 OKR 进度，系统沦为任务流水账
- **长期**：被同类 AI 原生 PM 工具超车（市场上已经出现 early movers）

---

## 2. Goals & Non-Goals

### 2.1 Goals（P0 必达）

| # | Goal | Measurement | Target |
|---|---|---|---|
| G1 | 用户在系统里能把假设明确挂到 KR，从"任务管理"转变为"假设管理"心智 | 新建的 iteration 中有 hypothesisId 的比例 | > 80% in 2 weeks |
| G2 | 每个关闭的假设都有结构化的 result 数据 | 已 close 的 hypothesis 中 result 字段完整的比例 | 100%（强制校验）|
| G3 | KR 进度条由假设结果驱动，不再手填 | KR 进度计算输入来源 | 100% 来自 hypothesis_result.delta |
| G4 | AI Copilot 在 hypothesis close 时产出可读的 learning | Copilot 响应成功率 + 延迟 | > 95% 成功，p50 < 10s |
| G5 | 每日 digest 能捕捉"僵死 KR"和"跨假设失败规律" | digest 输出的 alert 数量 | 至少能产出非空告警 |
| **G6** | **假设可基于模板快速创建，降低上手门槛** | 使用模板创建的 hypothesis 比例 | > 30% |
| **G7** | **一个假设可以有 N 个变体（A/B），系统自动计算显著性** | 有 ≥ 2 个 variant 的 hypothesis 中显著性结论正确率 | 100%（单测验证）|
| **G8** | **KR 进度按时间维度计算（不是绝对百分比）** | `(kpiProgress / timeElapsed)` 比率算法 | 所有 KR |
| **G9** | **ICE / RICE 打分辅助 hypothesis 排序** | 有打分的 hypothesis 比例 | > 50% |
| **G10** | **跨项目对比看板**（ADMIN 专属）| 多项目聚合视图可用 | 1 个页面 |
| **G11** | **父子树形可视化**展示 parent chain | `/hypotheses/:id` 详情页的 tree tab 工作 | 交互式 |
| **G12** | **桌面 + 平板 + 手机**全 device 可用 | 375px / 768px / 1280px 三 breakpoint 全测 | 100% view |
| **G13** | **中英双语**完整支持 | 所有 UI 字符串走 `$t()` | 0 硬编码 |

### 2.2 非直接目标（衡量副作用）

- 不追求"AI Copilot 建议被采纳的比例"（Day 1 的建议质量会很低，需要数据积累）
- 不追求"Learning Dashboard 的 PV/UV"（首页强制切换，PV 是必然的）

### 2.3 Non-Goals（显式 Out-of-Scope）

**本次 scope 扩张后（2026-04-12 用户决策 D29），只保留 2 项 Out-of-Scope：**

| # | Non-Goal | 为什么 |
|---|---|---|
| N1 | **不接** Amplitude / GA4 / Mixpanel 等第三方分析 API | 需要外部埋点基建；用户手填 variant 数据跑通后再议 |
| N2 | **不做** Legacy experience miner (AI 回扫老 experience 数据) | 老数据结构化不足，Copilot 处理质量差；6 月后写专用 legacy prompt |
| N3 | **不动** 现有 iteration / feed / board 的流程 | 只加外键和视图，不改逻辑，避免回归 |

**以下项目原本在 v2 延后，现已全部进入 scope**（决策 D29）：
- ✅ Hypothesis 模板库（G6）
- ✅ Hypothesis Variants + 显著性检验（G7）——自实现 z-test / t-test，无需外部平台
- ✅ KR 时间维度进度（G8）
- ✅ ICE / RICE 打分（G9）
- ✅ 跨项目对比看板（G10）
- ✅ Parent 树形可视化（G11）
- ✅ 移动端响应式（G12）
- ✅ 中英双语 i18n（G13）

---

## 3. User Personas & Stories

### 3.1 Personas

| Persona | 角色 | 主要诉求 |
|---|---|---|
| **Hypothesis Owner** | 需求架构师 / 实施工程师 / 设计师 | 创建假设、执行、关闭时回填结果 |
| **KR Owner** | 团队 Lead / PM / Admin | 监控 KR 进度，发现僵死 KR，决策 pivot |
| **Admin** | 管理员 | 全局可见，可接管任何人的假设 |

### 3.2 User Stories

#### Epic 1：Hypothesis Lifecycle（P0）

**US-1.1** 作为 Hypothesis Owner，我想基于一个 KR 创建一个假设，以便让执行有明确目的。
- 我必须选择一个 KR（不允许没有 KR 的孤立假设）
- 我必须写明 statement（"如果做 X，则 Y 会变化 Z"）
- 我必须写明 mechanism（"为什么我认为这会有效"）
- 我必须写明 expectedImpact（"预期 KR 能推进 X%"）
- 可选：指定 parentId（上一版的假设，形成迭代链）

**US-1.2** 作为 Hypothesis Owner，我想把现有 iteration 关联到一个假设，以便让"执行"服务于"假设"。
- 创建 iteration 时可选填 hypothesisId
- 一个 hypothesis 可以有 0 到 N 个 iteration（iteration 是执行细节，可以拆分）
- iteration 关闭不等于 hypothesis 关闭

**US-1.3** 作为 Hypothesis Owner，我想在任何时间点关闭一个假设，并填入 result，以便产出学习。
- 关闭时强制填：metricType / baseline / actual / conclusion（胜出/失败/持平）
- 可选填：learningText（我的一句话教训）
- 关闭后 status 变为 `CLOSED_WIN` / `CLOSED_LOSS` / `CLOSED_FLAT`（根据 conclusion 自动选）
- 也支持 `ABANDONED`（放弃，没跑完就砍了）

**US-1.4** 作为 Hypothesis Owner，我想基于已关闭的 V1 假设创建一个 V2 假设，以便形成迭代链。
- 在 V1 详情页有"创建下一版"按钮
- 自动 prefill：krId / parentId / 部分 statement

#### Epic 2：Learning Dashboard（P0）

**US-2.1** 作为 KR Owner，我打开 `/dashboard`，第一眼看到的是 Learning Dashboard，而不是任务列表。
- 顶部：我负责的 KR 进度条（绿/黄/红三色根据目标达成度）
- 中部：本周所有 hypothesis 分三栏（已完成 / 跑中 / 待开始）
- 右侧：AI Copilot 建议流

**US-2.2** 作为 KR Owner，我想看到 KR 进度是怎么被假设推动的。
- 每个 KR 进度条下面有一个 "本 KR 已跑 X 个假设，胜 Y 个，贡献进度 +Z%" 的摘要
- 点击 KR 展开看贡献明细（每个 hypothesis 贡献了多少 delta）

**US-2.3** 作为 KR Owner，我想一眼看到"僵死的 KR"。
- 超过 7 天没有新假设开始跑的 KR 会在 Dashboard 顶部 alert
- AI Copilot 每日 digest 也会提醒

#### Epic 3：AI Copilot（P0）

**US-3.1** 作为 Hypothesis Owner，我关闭假设的瞬间，希望系统立即给我一段 learning。
- close 请求返回的响应中包含 AI 生成的 learning 文本
- learning 自动存入 learning 表，source=AI_GENERATED
- 如果 AI 调用失败，close 仍然成功，但 learning 为空（降级）

**US-3.2** 作为 KR Owner，我希望每天早晨有一份 Copilot digest 等我。
- 每日 9:00 local time 触发 job
- Output 存入 `copilot_digest` 表
- Dashboard 右侧展示最新一条 digest
- 前端有"重新生成"按钮，手动触发

**US-3.3** 作为 KR Owner，我希望 Copilot 发现跨假设的规律并告诉我。
- digest 里包含 `patterns` 数组（"XX 方向连 3 次失败，建议放弃"）
- 每个 pattern 关联 evidence hypothesis ids，点击可以看详情

#### Epic 4：Experience 迁移（P0）

**US-4.1** 作为 Admin，我希望旧的 experience 数据完整迁移到新 learning 表，不丢失历史。
- 所有 experience 记录 → learning 表，source=HUMAN
- 旧 `/experience` API 路由保留一个月，302 redirect 到 `/learnings`
- 旧 `/experience` 前端路由保留一个月

#### Epic 5：Hypothesis 模板库（G6，新增 P0）

**US-5.1** 作为 Hypothesis Owner 新手，我想从模板库选一个开始，而不是从空白页开始写假设。
- 访问 `/hypotheses/new` 看到"从模板开始 / 空白创建"两选项
- 模板按 category 分组（acquisition/activation/retention/revenue/referral）
- 每个模板可看 usageCount 和历史胜率（P1）

**US-5.2** 作为 Hypothesis Owner，我可以把一个成功的自建假设保存为模板供他人复用。
- Hypothesis 详情页"另存为模板"按钮
- 自动提取 statement / mechanism 里的变量作为 placeholder
- 保存后进入个人模板库（`isSystemDefault=false`）

**US-5.3** 作为 Admin，我可以管理系统默认模板库，新增/编辑系统级模板。
- `/hypothesis-templates` 管理页（Admin only）
- 系统默认模板的锁定图标标识

#### Epic 6：A/B Variants + 显著性检验（G7，新增 P0）

**US-6.1** 作为 Hypothesis Owner，我想给一个假设添加多个 variant 做 A/B 测试。
- Hypothesis 详情页"Variants" tab
- 第一个 variant 必须是 `type=CONTROL`
- 后续可添加 N 个 `type=TREATMENT`
- 每个 variant 有 name / description 两个字段

**US-6.2** 作为 Hypothesis Owner，我手填每个 variant 的样本量 + 转化数，系统自动算显著性。
- 录入 `sampleSize` + `conversionCount`
- 服务端自动算 `conversionRate / pValue / CI95 / isSignificant`
- 前端展示 p-value 条 + 置信区间图

**US-6.3** 作为 Hypothesis Owner，只有显著的 variant 才能被标记为 winner。
- `POST /variants/:id/mark-winner` 服务端校验 `isSignificant=true`
- 非显著时返回 warning，需要 `?force=true` 覆盖（记 audit log）

**US-6.4** 作为 KR Owner，我希望 Variants 场景的 hypothesis 结果能正确聚合到 KR 进度。
- KR 进度 delta 用胜出 variant 的 `(variantRate - controlRate)` 计算
- 没有 winner 的 hypothesis 不参与 KR 进度聚合

#### Epic 7：ICE / RICE 打分（G9，新增 P0）

**US-7.1** 作为 KR Owner，我想给 backlog 里的 hypothesis 打 ICE 或 RICE 分，便于排序决定先做哪个。
- Hypothesis 详情页"打分"section
- ICE: `impact` / `confidence` / `ease` 各 1-10 滑块
- RICE: `reach` / `impact` / `confidence` / `effort` 四字段
- 服务端自动计算并存储 `iceScore / riceScore`

**US-7.2** 作为 KR Owner，我可以按 ICE 或 RICE 分数排序 backlog。
- `/hypotheses?sortBy=iceScore&order=desc`
- Learning Dashboard 的"待开始"栏默认按 ICE 分降序

#### Epic 8：Parent 树形可视化（G11，新增 P0）

**US-8.1** 作为 Hypothesis Owner，查看假设详情时我能看到它的完整 parent chain tree。
- `/hypotheses/:id` 详情页"历史版本" tab
- 交互式树形图（@antv/g6 或 d3）
- 节点点击跳转到对应 hypothesis
- 节点颜色标识 status（绿 WIN / 红 LOSS / 灰 ABANDONED）

**US-8.2** 作为 KR Owner，从 KR 维度看某个方向迭代的全景树。
- KR 详情页"所有 hypothesis 树" tab
- 同一个 root 的多棵树并列

#### Epic 9：跨项目对比看板（G10，新增 P0，ADMIN only）

**US-9.1** 作为 Admin，我想在一个页面对比多个 project 的 learning 效率。
- `/dashboard/cross-project`
- 表格式展示每个 project 的：KR 达成率 / hypothesis 数 / 胜率 / learning velocity
- Copilot 的"跨项目 pattern"也聚合展示

**US-9.2** 作为 Admin，我想看到跨项目的共享 pattern。
- Copilot daily digest 扩展 scope=`global`，扫所有 project
- cross-project patterns section 独立展示

#### Epic 10：KR 时间维度进度（G8，新增 P0）

**US-10.1** 作为 KR Owner，我想按时间维度看 KR 进度（而不是纯百分比）。
- KR 创建 / 编辑时可填 `startDate` + `endDate`（可选）
- 进度条根据 `kpiProgress / timeElapsed` 比率显示 on_track / behind / critical
- 落后 KR 自动被 Copilot digest 告警

**US-10.2** 老 KR 默认 open-ended 视作已有行为。
- `endDate = null` 时退回绝对百分比算法（向后兼容）

#### Epic 11：响应式 + 移动端（G12，新增 P0）

**US-11.1** 作为用户，我在手机上也能看 Learning Dashboard。
- 375px / 768px / 1280px 三 breakpoint 全适配
- Dashboard 三栏在 375px 变成 tab 切换
- Hypothesis 列表表格在 375px 变成卡片视图
- Touch interactions：所有 drag/drop 降级为 tap

**US-11.2** 作为 KR Owner，我在平板上也能录 variant 数据。
- Variant form 在 768px+ 是双列，375px 单列
- 数字输入用 `inputmode="numeric"` 调起 iOS 数字键盘

#### Epic 12：中英双语 i18n（G13，新增 P0）

**US-12.1** 作为用户，我可以切换系统语言为英文。
- 设置页加"语言"选项：中文 / English
- 所有 UI 字符串走 `$t('key')`
- 用户偏好存 `user.preferredLocale`
- HTTP 请求带 `Accept-Language` header

**US-12.2** 作为开发者，我提交代码时 i18n linter 会阻止硬编码字符串。
- ESLint 规则 `vue-i18n/no-raw-text`
- CI 阶段校验

---

## 4. Solution Overview

### 4.1 概念模型

```
                    ┌────────────────────┐
                    │    OKR Objective   │
                    └──────────┬─────────┘
                               │
                        ┌──────┴──────┐
                        │  KeyResult  │
                        └──────┬──────┘
                               │ 1:N
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
        ┌──────────┐                    ┌──────────┐
        │ Hypothesis│ ◄──────────────── │ Hypothesis│  parent chain
        │    V1    │                    │    V2    │
        └─────┬────┘                    └──────────┘
              │ 0..N
              ▼
      ┌──────────────┐
      │  Iteration   │  （现有，加 hypothesisId 外键）
      └──────┬───────┘
             │
             ▼
      ┌──────────────┐
      │ FeedPackage  │  （现有，不变）
      └──────────────┘

        ┌──────────────────┐
        │ HypothesisResult │  1:1 with hypothesis（close 时产生）
        └────────┬─────────┘
                 │
                 ▼
          ┌────────────┐
          │  Learning  │   source=AI_GENERATED / HUMAN
          │  (原 experience)
          └────────────┘
```

### 4.2 用户旅程示例

**周一早上 9:00**（KR Owner Byron）
1. 打开 `/dashboard` → Learning Dashboard
2. 看到 OKR KR1（新用户留存）进度条 22%，离目标 30% 还差 8%
3. 右侧 Copilot digest："KR2 已 9 天无新假设，建议立即开启"
4. 点 Copilot 建议的"生成 3 个 KR2 的假设候选" → 快速创建 3 个 hypothesis

**周三晚上**（Hypothesis Owner 工程师）
1. 进 `/hypotheses/:id` 页面，看到自己在跑的一个假设
2. 数据已经出来了，点"关闭假设" → 弹 result form
3. 填：metricType=conversion_rate, baseline=3.2%, actual=3.9%, conclusion=WIN
4. 点确认 → 后端 close → AI Copilot 10s 内返回 learning："本次假设通过首屏社交证明让转化 +0.7%。我注意到这和 2 周前假设 #12 的成功模式相同：前 3 秒给用户社交信号。建议把此作为设计原则沉淀。"
5. 工程师点 "归档为原则" → learning 进入知识库

**周四早上 9:00**（Byron 再打开 Dashboard）
1. Copilot digest 已更新
2. 看到 KR1 进度从 22% → 22.7%（来自工程师昨天的假设结果）
3. 看到 pattern："'首屏社交证明' 方向连 2 次胜出，建议扩大投资"
4. 点 "基于此 pattern 生成新假设" → 又有 3 个候选待跑

### 4.3 AI Copilot 工作原理

Copilot 不是一个独立模块，而是两个触发时机的 AI 调用：

```
┌─────────────────────┐
│ hypothesis.close()  │
└──────────┬──────────┘
           │
           ▼
  ┌────────────────┐
  │ buildContext() │ ← 读 KR 列表 + 最近 30 天 hypothesis + 本次 hypothesis
  └────────┬───────┘
           │
           ▼
  ┌────────────────┐
  │ callClaudeAPI  │ ← 走现有 AI service 链路
  └────────┬───────┘
           │
           ▼
  ┌────────────────┐
  │ parseOutput()  │ ← 严格 JSON schema
  └────────┬───────┘
           │
           ▼
  ┌────────────────┐
  │ writeLearning  │ ← 入 learning 表
  └────────────────┘

定时触发（每日 9:00）：
  cron → scanAllActiveKRs() → buildDigestContext() → callClaudeAPI()
       → parse → writeCopilotDigest() → Dashboard 拉最新
```

---

## 5. Data Model

### 5.1 Prisma Schema Changes

```prisma
// ====== 新建 ======

enum HypothesisStatus {
  BACKLOG        // 待开始
  RUNNING        // 跑中
  CLOSED_WIN     // 胜出
  CLOSED_LOSS    // 失败
  CLOSED_FLAT    // 持平（统计上不显著）
  ABANDONED      // 放弃
}

model Hypothesis {
  id              String   @id @default(uuid())
  krId            String
  keyResult       KeyResult @relation(fields: [krId], references: [id])

  // 链式迭代：V1 → V2 → V3
  parentId        String?
  parent          Hypothesis? @relation("HypothesisChain", fields: [parentId], references: [id], onDelete: SetNull)
  children        Hypothesis[] @relation("HypothesisChain")

  // 假设内容
  statement       String   @db.Text  // "如果加欢迎弹窗,则首日留存会+3%"
  mechanism       String   @db.Text  // "因为用户不知道下一步做什么"
  expectedImpact  String   // "+3% 首日留存" 自由文本
  expectedImpactValue Float?  // 可选数值，用于对比
  expectedImpactUnit  String? // "%" / "个" / "元" 等

  status          HypothesisStatus @default(BACKLOG)

  // G6: 可选关联 template 来源
  templateId      String?
  template        HypothesisTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)

  // G9: ICE / RICE 打分（可选）
  iceImpact       Int?     // 1-10
  iceConfidence   Int?     // 1-10
  iceEase         Int?     // 1-10
  iceScore        Float?   // 服务端计算: (impact * confidence * ease) / 10，便于排序
  riceReach       Int?     // 触达用户数/周
  riceImpact      Float?   // 0.25 / 0.5 / 1 / 2 / 3
  riceConfidence  Int?     // 百分比 50/80/100
  riceEffort      Float?   // 人周
  riceScore       Float?   // 服务端计算: (reach * impact * confidence) / effort

  ownerId         String
  owner           User     @relation("HypothesisOwner", fields: [ownerId], references: [id])

  // 关联执行
  iterations      Iteration[]

  // G7: 变体（Variants）关联，一个 hypothesis 可以有 N 个 variant 并行跑 A/B
  variants        HypothesisVariant[]

  // 1:0..1 关联 result（close 时创建，单变体场景）
  result          HypothesisResult?

  // 1:N 关联 learnings（一个 hypothesis 可以产出多条 learning）
  learnings       Learning[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  closedAt        DateTime?
  deletedAt       DateTime?

  @@index([krId, status])
  @@index([ownerId, status])
  @@index([closedAt])
  @@index([iceScore])
  @@index([riceScore])
  @@map("hypotheses")
}

// ====== G6: Hypothesis Template 模板库 ======

model HypothesisTemplate {
  id                   String  @id @default(uuid())
  name                 String                  // "首屏转化优化模板"
  category             String                  // "acquisition" | "activation" | "retention" | "revenue" | "referral" | "custom"
  description          String  @db.Text

  // 模板插槽（用户创建假设时 prefill）
  statementTemplate    String  @db.Text        // "如果在 {{page}} 加 {{feature}}，则 {{metric}} 会 {{direction}} {{delta}}"
  mechanismTemplate    String  @db.Text
  suggestedMetricType  String?                 // hypothesis_result.metricType 的建议值
  suggestedMetricName  String?                 // "首日留存率"
  placeholders         Json                    // [{ key: "page", label: "页面", required: true }, ...]

  // 来源追溯
  createdById          String
  createdBy            User    @relation("TemplateAuthor", fields: [createdById], references: [id])
  isSystemDefault      Boolean @default(false) // 系统预置模板不可删除
  usageCount           Int     @default(0)     // 被使用次数，用于热度排序

  hypotheses           Hypothesis[]
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  deletedAt            DateTime?

  @@index([category, isSystemDefault])
  @@index([usageCount])
  @@map("hypothesis_templates")
}

// ====== G7: Hypothesis Variant + 显著性检验 ======

enum VariantStatus {
  CONTROL          // 对照组（A）
  TREATMENT        // 实验组（B/C/D...）
}

model HypothesisVariant {
  id              String   @id @default(uuid())
  hypothesisId    String
  hypothesis      Hypothesis @relation(fields: [hypothesisId], references: [id], onDelete: Cascade)

  name            String   // "A - 原版" / "B - 红色按钮" / "C - 左侧导航"
  description     String?  @db.Text
  type            VariantStatus @default(TREATMENT)

  // 样本 + 结果数据（手填，因为不接第三方 analytics）
  sampleSize      Int?     // 样本量
  conversionCount Int?     // 转化数（CONVERSION_RATE metric）
  metricValue     Float?   // 对其他 metricType 用
  metricUnit      String?

  // 服务端计算的统计量（不接受客户端传值）
  conversionRate  Float?   // 转化率（conversionCount / sampleSize）
  stdError        Float?   // 标准误差
  pValue          Float?   // 相对 control 的 p-value（control 自己为 null）
  confidenceInterval95Low  Float?
  confidenceInterval95High Float?
  isSignificant   Boolean? // p < 0.05 则为 true
  isWinner        Boolean  @default(false) // 用户最终选定的胜出 variant

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([hypothesisId, name])
  @@index([hypothesisId, type])
  @@map("hypothesis_variants")
}

enum MetricType {
  CONVERSION_RATE     // 转化率 (0.0-1.0)
  COUNT               // 绝对数量
  RATIO               // 比率
  REVENUE             // 收入金额
  DURATION_SECONDS    // 时长（秒）
  CUSTOM              // 自由数值
}

enum ResultConclusion {
  WIN
  LOSS
  FLAT
  INCONCLUSIVE
}

model HypothesisResult {
  id              String   @id @default(uuid())
  hypothesisId    String   @unique
  hypothesis      Hypothesis @relation(fields: [hypothesisId], references: [id], onDelete: Cascade)

  metricType      MetricType
  metricName      String   // 自由文本描述，比如"首日留存率"
  baseline        Float    // 实验前基线
  actual          Float    // 实验后实际值
  delta           Float    // actual - baseline，服务端计算存储（便于聚合）
  unit            String?  // "%" / "人" / "元"

  conclusion      ResultConclusion
  humanNote       String?  @db.Text  // 用户可选的一句话备注

  createdAt       DateTime @default(now())

  @@map("hypothesis_results")
}

// ====== 修改现有：experience → learning ======

enum LearningSource {
  HUMAN          // 用户手写（原 experience）
  AI_GENERATED   // AI Copilot 生成
}

// 原 Experience 表 rename 为 Learning
model Learning {
  id              String   @id @default(uuid())
  source          LearningSource @default(HUMAN)

  // 可选关联：如果是 hypothesis close 触发生成的，就有 hypothesisId
  hypothesisId    String?
  hypothesis      Hypothesis? @relation(fields: [hypothesisId], references: [id], onDelete: SetNull)

  // 原 experience 字段（保留兼容）
  title           String
  content         String   @db.Text
  linkedPromptId  String?  // 保留
  markdownContent String?  @db.Text
  markdownFileName String?
  problemDescription String? @db.Text

  createdById     String
  createdBy       User     @relation("LearningAuthor", fields: [createdById], references: [id])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@index([source, hypothesisId])
  @@index([createdById])
  @@map("learnings")
}

// ====== 新建：Copilot Digest 缓存 ======

model CopilotDigest {
  id              String   @id @default(uuid())
  scope           String   // "global" | "project:{id}" | "kr:{id}"
  triggerType     String   // "scheduled_daily" | "hypothesis_close" | "manual"

  // 完整 JSON，前端直接渲染
  payload         Json     // { learnings[], patterns[], nextHypothesisSuggestions[], alerts[] }

  createdAt       DateTime @default(now())

  @@index([scope, createdAt])
  @@map("copilot_digests")
}

// ====== 修改现有：Iteration 加外键 ======

model Iteration {
  // ... 现有字段全部保留 ...
  hypothesisId    String?
  hypothesis      Hypothesis? @relation(fields: [hypothesisId], references: [id], onDelete: SetNull)

  @@index([hypothesisId])
}

// ====== 修改现有：KeyResult 加时间维度 + 反向关联 ======

model KeyResult {
  // ... 现有字段保留 ...

  // G8: 时间维度进度算法需要
  startDate       DateTime? @default(now())  // 老 KR 默认 createdAt
  endDate         DateTime?                  // 截止日期，null = open-ended

  // 反向关联
  hypotheses      Hypothesis[]
}
```

### 5.2 Statistical Significance 自实现逻辑

因为不接外部实验平台（N1），变体的显著性计算在服务端自实现。Byron 不想再加一个依赖（比如 `jstat`），就用 2 个简单公式：

**Two-proportion z-test**（用于 `CONVERSION_RATE` metric）：
```typescript
// services/hypothesis/stats.ts
function zTestTwoProportion(
  control: { successes: number; n: number },
  treatment: { successes: number; n: number }
): { pValue: number; ciLow: number; ciHigh: number; significant: boolean } {
  const p1 = control.successes / control.n
  const p2 = treatment.successes / treatment.n
  const pPool = (control.successes + treatment.successes) / (control.n + treatment.n)
  const se = Math.sqrt(pPool * (1 - pPool) * (1/control.n + 1/treatment.n))
  const z = (p2 - p1) / se
  const pValue = 2 * (1 - normalCDF(Math.abs(z)))
  const seRaw = Math.sqrt(p2 * (1 - p2) / treatment.n)
  const margin = 1.96 * seRaw
  return {
    pValue,
    ciLow: p2 - margin,
    ciHigh: p2 + margin,
    significant: pValue < 0.05,
  }
}
```

**Welch's t-test**（用于其他连续型 metric）：用 degrees of freedom 近似即可。

**normalCDF** / **tCDF**：自己实现 Abramowitz-Stegun 多项式近似（~30 行代码），精度 < 1e-7，对 p-value 判断足够。

**不用第三方库**。代码量 ~150 行，单测覆盖 20+ cases。

### 5.3 Migration 顺序（Expand-Contract 两阶段，多表）

```sql
-- ===== Stage 1 (Day 1): Expand =====
-- 1. 新建表
CREATE TABLE hypotheses (...);
CREATE TABLE hypothesis_results (...);
CREATE TABLE hypothesis_templates (...);
CREATE TABLE hypothesis_variants (...);
CREATE TABLE copilot_digests (...);
CREATE TABLE learnings (...);  -- 不是 rename，是新建

-- 2. CHECK 约束（D24）
ALTER TABLE hypotheses ADD CONSTRAINT closed_at_matches_status CHECK (
  (status IN ('CLOSED_WIN','CLOSED_LOSS','CLOSED_FLAT','ABANDONED') AND closed_at IS NOT NULL) OR
  (status IN ('BACKLOG','RUNNING') AND closed_at IS NULL)
);

-- 3. 数据复制（one-shot 复制，之后 dual-write 维护）
INSERT INTO learnings (id, source, title, content, ...)
  SELECT id, 'HUMAN', title, content, ... FROM experiences;

-- 4. 给 iteration 加 hypothesisId 列（可空）
ALTER TABLE iterations ADD COLUMN hypothesis_id TEXT REFERENCES hypotheses(id);

-- 5. KR 加时间维度（G8）
ALTER TABLE key_results ADD COLUMN start_date TIMESTAMP DEFAULT NOW();
ALTER TABLE key_results ADD COLUMN end_date TIMESTAMP;
-- 老 KR 的 startDate = createdAt，endDate = NULL (open-ended)
UPDATE key_results SET start_date = created_at WHERE start_date IS NULL;

-- 6. 预置系统默认模板（G6）
INSERT INTO hypothesis_templates (id, name, category, is_system_default, ...)
VALUES (...);  -- 5-10 个标配模板

-- ===== Stage 2 (Day 14 after dual-write verification): Contract =====
-- 确认 learnings 行数 = experiences 行数
-- experience service 停止 dual-write
-- DROP TABLE experiences  或 rename → experiences_archived（保留 1 周备份）
```

### 5.4 关键约束与索引

- `hypothesis.krId` 必填（数据库 NOT NULL）——强制挂 KR 原则
- `hypothesis.status` 默认 `BACKLOG`
- `hypothesis_result.delta` 服务端计算写入，不接受客户端传值（防篡改）
- `hypothesis.iceScore` / `riceScore` 服务端计算写入（防篡改）
- `hypothesis_variant.pValue` / `isSignificant` / `conversionRate` 服务端计算写入
- `hypothesis` 关闭时必须同时创建 `hypothesis_result` 或 `hypothesis_variant` 有至少一个 winner，service 层在事务里做
- `learning.source` 不可空，迁移时全部填 `HUMAN`
- `copilot_digest.scope` 索引 + `createdAt` 降序，便于取最新一条
- `key_result.startDate / endDate` 索引（dashboard 时间窗过滤）

---

## 6. API Contract

### 6.1 Hypothesis CRUD

#### `POST /api/v1/hypotheses`

创建假设。必须挂 KR。

**Request**
```json
{
  "krId": "kr-uuid",
  "parentId": "hyp-uuid-or-null",
  "statement": "如果加欢迎弹窗，则首日留存会 +3%",
  "mechanism": "因为用户不知道下一步做什么",
  "expectedImpact": "+3% 首日留存",
  "expectedImpactValue": 3.0,
  "expectedImpactUnit": "%"
}
```

**Response 200**
```json
{
  "code": 0,
  "message": "Hypothesis created",
  "data": {
    "id": "hyp-uuid",
    "krId": "kr-uuid",
    "krName": "新用户首周留存 20% → 30%",
    "parentId": null,
    "statement": "如果加欢迎弹窗，则首日留存会 +3%",
    "mechanism": "因为用户不知道下一步做什么",
    "expectedImpact": "+3% 首日留存",
    "expectedImpactValue": 3.0,
    "expectedImpactUnit": "%",
    "status": "BACKLOG",
    "owner": { "id": "u-uuid", "name": "测试架构师" },
    "iterations": [],
    "result": null,
    "createdAt": 1760000000000,
    "closedAt": null
  },
  "timestamp": 1760000000000
}
```

**Error Cases**
- `20001` missing krId / statement / mechanism → 400
- `37002` KR not found → 404
- `20002` expectedImpactValue 不是数字 → 400

---

#### `GET /api/v1/hypotheses`

**Query Params**
- `krId` (optional): 按 KR 筛选
- `status` (optional, 可多选逗号分隔): `BACKLOG,RUNNING,CLOSED_WIN,CLOSED_LOSS,CLOSED_FLAT,ABANDONED`
- `ownerId` (optional): 按 owner 筛选
- `mine` (boolean): 是否只看自己创建的
- `page`, `pageSize`: 分页

**Response 200** （与现有 paginate 结构一致）
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [ { /* Hypothesis 摘要，同 POST 响应的 data 部分 */ } ],
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  },
  "timestamp": 1760000000000
}
```

---

#### `GET /api/v1/hypotheses/:id`

返回单个 hypothesis 的完整信息，包含关联的 iterations / result / learnings。

**Response 200**
```json
{
  "code": 0,
  "data": {
    "id": "hyp-uuid",
    "krId": "kr-uuid",
    "krName": "新用户首周留存",
    "parent": {
      "id": "hyp-parent-uuid",
      "statement": "V1 的 statement",
      "status": "CLOSED_LOSS"
    },
    "children": [
      { "id": "hyp-child-uuid", "statement": "V2", "status": "BACKLOG" }
    ],
    "statement": "...",
    "mechanism": "...",
    "expectedImpact": "+3% 首日留存",
    "status": "CLOSED_WIN",
    "owner": { "id": "u-uuid", "name": "..." },
    "iterations": [
      { "id": "iter-uuid", "name": "第 1 轮 实施", "status": "DONE" }
    ],
    "result": {
      "metricType": "CONVERSION_RATE",
      "metricName": "首日留存率",
      "baseline": 0.20,
      "actual": 0.23,
      "delta": 0.03,
      "unit": "%",
      "conclusion": "WIN",
      "humanNote": "超预期"
    },
    "learnings": [
      {
        "id": "learn-uuid",
        "source": "AI_GENERATED",
        "title": "首屏社交证明的价值",
        "content": "本次假设通过首屏社交证明让首日留存 +3%...",
        "createdAt": 1760000000000
      }
    ],
    "createdAt": 1760000000000,
    "closedAt": 1760000000000
  }
}
```

---

#### `PUT /api/v1/hypotheses/:id`

**Request**
```json
{
  "statement": "updated",
  "mechanism": "updated",
  "expectedImpact": "updated",
  "expectedImpactValue": 5.0
}
```

约束：
- **close 后的 hypothesis 不允许修改**（403）
- krId / parentId 不允许通过 PUT 修改（要改关系请删了重建）

---

#### `POST /api/v1/hypotheses/:id/close`

关闭假设，提交 result，触发 AI Copilot 生成 learning。

**Request**
```json
{
  "metricType": "CONVERSION_RATE",
  "metricName": "首日留存率",
  "baseline": 0.20,
  "actual": 0.23,
  "unit": "%",
  "conclusion": "WIN",
  "humanNote": "超预期"
}
```

**Response 200**
```json
{
  "code": 0,
  "message": "Hypothesis closed",
  "data": {
    "hypothesis": { /* 完整 hypothesis 对象，status=CLOSED_WIN */ },
    "result": { /* hypothesis_result 对象 */ },
    "aiLearning": {
      "id": "learn-uuid",
      "source": "AI_GENERATED",
      "content": "本次通过首屏社交证明让首日留存 +3%，和两周前 hyp #12 的胜出模式相同（都是前 3 秒社交信号）。建议把此作为设计原则归档。",
      "relatedPatternIds": ["hyp-12"],
      "createdAt": 1760000000000
    },
    "copilotStatus": "success"
  }
}
```

**降级响应**（AI 调用失败）
```json
{
  "code": 0,
  "data": {
    "hypothesis": { ... },
    "result": { ... },
    "aiLearning": null,
    "copilotStatus": "failed",
    "copilotError": "AI service timeout"
  }
}
```

**约束**：
- hypothesis 处于 CLOSED_* 状态时再调 close → 400
- baseline 和 actual 必填数字
- delta 由后端计算（`actual - baseline`），不接受客户端传值
- conclusion 必须是 enum 值之一

---

### 6.2 Learning（替代 Experience）

#### `GET /api/v1/learnings`

**Query Params**
- `source`: `HUMAN` | `AI_GENERATED`
- `hypothesisId`: 按 hypothesis 筛选
- `createdById`: 按作者筛选
- `page`, `pageSize`

**Response**
与现有 experience 列表接口结构一致，新增 `source` 和 `hypothesisId` 字段。

#### `POST /api/v1/learnings`

手动创建 learning（原 experience/feedbacks 接口）。`source` 自动设为 `HUMAN`。

#### 兼容层
- `GET /api/v1/experience/feedbacks` → 302 redirect to `GET /api/v1/learnings?source=HUMAN`（保留一个月，一个月后返回 410 Gone）
- `POST /api/v1/experience/feedbacks` → 等同 `POST /api/v1/learnings`（内部调用相同 service）

---

### 6.3 Learning Dashboard

#### `GET /api/v1/dashboard/learning`

首页数据聚合接口。

**Query Params**
- `projectId` (optional): 不传则返回当前用户可见的全部
- `scope`: `mine` | `all`（仅 ADMIN 可用）

**Response 200**
```json
{
  "code": 0,
  "data": {
    "activeKRs": [
      {
        "id": "kr-uuid",
        "name": "新用户首周留存 20% → 30%",
        "targetValue": 30,
        "currentValue": 22.5,
        "baseline": 20,
        "unit": "%",
        "progressPercent": 25,
        "progressStatus": "behind",
        "contributionCount": 3,
        "lastHypothesisAt": 1760000000000,
        "isStagnant": false
      }
    ],
    "thisWeekHypotheses": {
      "running": [ /* Hypothesis 摘要 */ ],
      "closedWins": [ /* */ ],
      "closedLosses": [ /* */ ],
      "backlog": [ /* */ ]
    },
    "latestCopilotDigest": {
      "id": "digest-uuid",
      "createdAt": 1760000000000,
      "payload": { /* 见 6.4 copilot digest schema */ }
    },
    "summary": {
      "totalHypothesesThisWeek": 8,
      "winRate": 0.375,
      "learningVelocity": 5
    }
  }
}
```

**字段说明**
- `progressStatus`: `on_track` (绿) | `behind` (黄) | `critical` (红)
  - 算法：`(currentValue - baseline) / (targetValue - baseline)` 对比"到今天应该达到的进度百分比"
- `isStagnant`: 超过 7 天没有新 hypothesis 开始跑
- `learningVelocity`: 本周闭环的 hypothesis 数（无论胜败）

---

#### `POST /api/v1/dashboard/learning/digest`

手动触发 Copilot digest 重新生成。

**Request**
```json
{
  "scope": "global"
}
```

**Response** 同 `latestCopilotDigest.payload`。

---

### 6.4 Copilot Output JSON Schema

这是 AI Copilot 必须严格遵守的输出格式（用于 parse 和前端渲染）：

```json
{
  "learnings": [
    {
      "hypothesisId": "hyp-uuid",
      "text": "一段话说清楚这次学到了什么（50-150 字）"
    }
  ],
  "patterns": [
    {
      "title": "首屏社交证明持续有效",
      "description": "过去 4 个带'社交证明'标签的假设，3 个 WIN 1 个 FLAT，平均 delta +2.3%",
      "evidenceHypothesisIds": ["hyp-a", "hyp-b", "hyp-c"],
      "recommendation": "建议在所有新功能的第一屏都加入社交证明元素",
      "confidence": "high"
    }
  ],
  "nextHypothesisSuggestions": [
    {
      "krId": "kr-uuid",
      "statement": "如果在登录后第 3 天推送个性化推荐，则 7 日留存会 +5%",
      "mechanism": "已知首日留存是关键，第 3 天是流失峰值",
      "expectedImpact": "+5% 7 日留存",
      "expectedImpactValue": 5.0,
      "expectedImpactUnit": "%"
    }
  ],
  "alerts": [
    {
      "type": "stagnant_kr",
      "krId": "kr-uuid",
      "krName": "付费转化率 3% → 5%",
      "message": "此 KR 已 9 天无新假设开始跑，建议立即开启",
      "severity": "warning"
    },
    {
      "type": "dead_direction",
      "message": "'弹窗引导' 方向连续 3 次失败（hyp #5 #11 #17），建议放弃此方向",
      "severity": "warning",
      "evidenceHypothesisIds": ["hyp-5", "hyp-11", "hyp-17"]
    }
  ]
}
```

**alert.type 枚举**
- `stagnant_kr`: KR 超过 7 天无新 hypothesis
- `behind_schedule`: KR 进度落后于预期线
- `dead_direction`: 某类假设连续失败
- `winning_streak`: 某类假设连续胜出（正向信号）

---

### 6.5 Hypothesis Template 模板库（G6）

#### `GET /api/v1/hypothesis-templates`

**Query Params**
- `category`: `acquisition` / `activation` / `retention` / `revenue` / `referral` / `custom`
- `isSystemDefault`: boolean
- `sortBy`: `usage` / `createdAt`
- `page` / `pageSize`

**Response**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "tpl-uuid",
        "name": "首屏转化优化模板",
        "category": "activation",
        "description": "针对首屏引导降低跳出率的一组假设模板",
        "statementTemplate": "如果在首屏 {{feature}}，则首屏跳出率会从 {{baseline}}% 降低 {{delta}}%",
        "mechanismTemplate": "因为用户在首屏 {{reason}}",
        "suggestedMetricType": "conversion_rate",
        "suggestedMetricName": "首屏跳出率",
        "placeholders": [
          { "key": "feature", "label": "新增功能", "required": true },
          { "key": "baseline", "label": "基线值", "required": true, "type": "number" }
        ],
        "isSystemDefault": true,
        "usageCount": 42,
        "createdAt": 1760000000000
      }
    ],
    "total": 10, "page": 1, "pageSize": 20, "totalPages": 1
  }
}
```

#### `POST /api/v1/hypothesis-templates`
创建自定义模板。Non-admin 可创建，仅创建人 + ADMIN 可编辑/删除。系统默认模板 `isSystemDefault=true` 不可编辑/删除。

#### `POST /api/v1/hypotheses/from-template`
基于模板创建 hypothesis，填入 placeholder values。**会自动 +1 template.usageCount**。

**Request**
```json
{
  "templateId": "tpl-uuid",
  "krId": "kr-uuid",
  "placeholderValues": {
    "feature": "欢迎视频引导",
    "baseline": 40,
    "delta": 5
  }
}
```

Response 同 `POST /hypotheses`。

### 6.6 Hypothesis Variants + 显著性检验（G7）

#### `POST /api/v1/hypotheses/:id/variants`
给一个 hypothesis 添加 variant（必须先有一个 `type=CONTROL`，再加任意 TREATMENT）。

**Request**
```json
{
  "name": "B - 红色按钮",
  "description": "把注册按钮从蓝色换成红色",
  "type": "TREATMENT"
}
```

**Response**
```json
{
  "code": 0,
  "data": {
    "id": "var-uuid",
    "hypothesisId": "hyp-uuid",
    "name": "B - 红色按钮",
    "type": "TREATMENT",
    "sampleSize": null,
    "conversionCount": null,
    "conversionRate": null,
    "pValue": null,
    "isSignificant": null,
    "createdAt": 1760000000000
  }
}
```

#### `PUT /api/v1/hypotheses/:id/variants/:variantId/results`
录入 variant 的样本 + 转化数据。**服务端自动重算所有 variant 的 p-value**（相对 CONTROL）和置信区间。

**Request**
```json
{
  "sampleSize": 1000,
  "conversionCount": 47,
  "metricValue": null,
  "metricUnit": null
}
```

**Response**（包含重算后的所有 variants，便于前端一次性更新）
```json
{
  "code": 0,
  "data": {
    "variants": [
      {
        "id": "var-control",
        "type": "CONTROL",
        "sampleSize": 1000,
        "conversionCount": 38,
        "conversionRate": 0.038,
        "pValue": null,
        "isSignificant": null
      },
      {
        "id": "var-treatment-b",
        "type": "TREATMENT",
        "sampleSize": 1000,
        "conversionCount": 47,
        "conversionRate": 0.047,
        "pValue": 0.032,
        "confidenceInterval95Low": 0.034,
        "confidenceInterval95High": 0.060,
        "isSignificant": true,
        "isWinner": false
      }
    ]
  }
}
```

#### `POST /api/v1/hypotheses/:id/variants/:variantId/mark-winner`
标记某 variant 为胜出。**只能有一个 winner**。服务端校验 `isSignificant=true` 才允许（非显著时抛 warning，需 `?force=true` override）。

### 6.7 Hypothesis Tree（G11）

#### `GET /api/v1/hypotheses/:id/tree`
返回以该 hypothesis 为根的完整 subtree，用于前端 `<HypothesisTreeViz>` 组件。深度上限 20（与循环检测一致）。

**Response**
```json
{
  "code": 0,
  "data": {
    "root": {
      "id": "hyp-v1",
      "statement": "V1 假设",
      "status": "CLOSED_LOSS",
      "delta": -0.008,
      "children": [
        {
          "id": "hyp-v2a",
          "statement": "V2a 假设",
          "status": "CLOSED_WIN",
          "delta": 0.032,
          "children": []
        },
        {
          "id": "hyp-v2b",
          "statement": "V2b 假设",
          "status": "ABANDONED",
          "delta": null,
          "children": []
        }
      ]
    },
    "depth": 2,
    "totalNodes": 3
  }
}
```

### 6.8 Cross-Project Dashboard（G10）

#### `GET /api/v1/dashboard/cross-project` — ADMIN only

**Response**
```json
{
  "code": 0,
  "data": {
    "projects": [
      {
        "projectId": "p1",
        "projectName": "增长项目",
        "activeKRCount": 5,
        "kpiAchievementRate": 0.68,
        "hypothesisCount": 32,
        "winRate": 0.43,
        "learningVelocity": 4.2,
        "stagnantKRs": 1
      }
    ],
    "crossPatterns": [
      {
        "title": "弹窗引导 3 项目都失败",
        "description": "项目 A/B/C 的弹窗引导类假设胜率均 < 20%",
        "evidenceProjectIds": ["p1", "p2", "p3"],
        "recommendation": "公司层面放弃弹窗方向"
      }
    ],
    "generatedAt": 1760000000000
  }
}
```

### 6.9 ICE/RICE 打分（G9）

#### `PUT /api/v1/hypotheses/:id/scoring`
更新 hypothesis 的 ICE 或 RICE 打分。**服务端自动计算 score**，不接受客户端传值。

**Request**
```json
{
  "iceImpact": 8,
  "iceConfidence": 6,
  "iceEase": 9
}
```
或
```json
{
  "riceReach": 5000,
  "riceImpact": 2,
  "riceConfidence": 80,
  "riceEffort": 2
}
```

**Response** 包含计算后的 `iceScore` 或 `riceScore`。

### 6.10 KR 时间维度进度（G8 API 调整）

`GET /api/v1/dashboard/learning` 响应中 `activeKRs[]` 新增字段：

```typescript
interface ActiveKRSummary {
  // ... 原有字段
  startDate: number           // timestamp ms
  endDate: number | null      // null = open-ended
  daysElapsed: number
  daysTotal: number | null    // null = open-ended
  daysLeft: number | null     // null = open-ended
  timeElapsedRatio: number    // daysElapsed / daysTotal，0-1
  kpiProgressRatio: number    // (current - baseline) / (target - baseline)，0-1+
  progressStatus: 'on_track' | 'behind' | 'critical'
  // 算法：
  //   ratio = kpiProgressRatio / timeElapsedRatio
  //   >= 0.9 → on_track
  //   >= 0.6 → behind
  //   <  0.6 → critical
  //   如 endDate = null（open-ended）则退回绝对百分比算法
}
```

---

## 7. UI Wireframe 文字说明

### 7.1 Learning Dashboard (`/dashboard`)

```
┌─────────────────────────────────────────────────────────────────────┐
│ AIPM                                                    [管理员 ▼]  │
├─────┬───────────────────────────────────────────────────────────────┤
│     │                                                               │
│ 侧边│  ┌──────────────────────────────────────────┐  ┌────────────┐│
│ 菜单│  │ 🎯 活跃 KR                               │  │🤖 Copilot  ││
│     │  ├──────────────────────────────────────────┤  │            ││
│ 📊  │  │ KR1: 新用户首周留存                      │  │ 今早建议: ││
│ 📋  │  │ ██████████░░░░░░░░░░░ 22.5 / 30 %        │  │            ││
│ 💡  │  │ [▲ 黄色进度条] Behind                    │  │ ✅ 首屏社  ││
│ 📦  │  │ 3 个假设贡献 +2.5%, 最近活跃 2h 前       │  │ 交证明连   ││
│ 📚  │  │                                          │  │ 2 次胜出   ││
│ 📖  │  │ KR2: 付费转化率 (⚠ 9 天无新假设)         │  │ [扩大试]  ││
│     │  │ ██░░░░░░░░░░░░░░░░░░░ 3.2 / 5 %          │  │            ││
│     │  │ [▲ 红色] Critical, Stagnant              │  │ ⚠ KR2 已   ││
│     │  │                                          │  │ 9 天僵死   ││
│     │  └──────────────────────────────────────────┘  │ [生成候选] ││
│     │                                                │            ││
│     │  ┌──────────────────────────────────────────┐  │ ❌ "弹窗引 ││
│     │  │ 📅 本周假设                              │  │ 导" 连 3 次││
│     │  ├───────────┬───────────┬──────────────────┤  │ 失败,建议  ││
│     │  │ 跑中 (3)  │ 已完成(5) │ 待开始 (7)       │  │ 放弃方向   ││
│     │  │           │           │                  │  │            ││
│     │  │ 假设 A    │ ✅ 假设 X │ 📝 假设 P        │  │ [查看详情] ││
│     │  │ 假设 B    │ ✅ 假设 Y │ 📝 假设 Q        │  │            ││
│     │  │ 假设 C    │ ❌ 假设 Z │ ...              │  └────────────┘│
│     │  └───────────┴───────────┴──────────────────┘                 │
│     │                                                               │
│     │  本周学习速率: 5 个假设闭环  胜率: 60%                        │
└─────┴───────────────────────────────────────────────────────────────┘
```

**关键交互**
- KR 进度条点击 → 展开贡献明细（每个 hypothesis 的 delta）
- "跑中" 列的假设点击 → 进入 `/hypotheses/:id`
- "已完成" 列的假设显示 WIN/LOSS 徽章
- Copilot 建议每条右上角有 `X` 可以 dismiss
- Copilot 区右上角有 🔄 按钮手动重新生成 digest
- 底部状态栏始终显示 "learning velocity"

### 7.2 Hypothesis 列表 (`/hypotheses`)

- 左侧 filter 栏：KR / status / owner / parent
- 主区域表格：id / krName / statement / status / owner / createdAt / actions
- 右上角 "新建假设" 按钮
- 每行 hover 显示"关闭"和"创建下一版"快捷按钮

### 7.3 Hypothesis 详情 (`/hypotheses/:id`)

- 顶部：面包屑 `OKR > KR > Hypothesis`
- 主内容分 Tab：
  - **概览**：statement / mechanism / expectedImpact / status / parent 链接 / children 列表
  - **执行**：关联的 iterations 列表（点进去走现有 iteration UI）
  - **结果**：result 数据 + AI learning 展示 + 手动添加 learning 按钮
  - **历史版本**：parent 链（V0 → V1 → V2）
- 底部 action 区：
  - status=RUNNING 时显示 "关闭假设" 主按钮
  - status=CLOSED_* 时显示 "创建下一版" 按钮
  - status=BACKLOG 时显示 "标记开跑" 按钮

### 7.4 关闭假设 Dialog

```
┌───────────────────────────────────────┐
│ 关闭假设：加欢迎弹窗                  │
├───────────────────────────────────────┤
│ 指标类型 *   [转化率 ▼]               │
│ 指标名称 *   [首日留存率            ] │
│ 基线值 *     [0.20                  ] │
│ 实际值 *     [0.23                  ] │
│ 单位        [%                      ] │
│                                       │
│ 结论 *                                │
│ ( ) 胜出 WIN                          │
│ (•) 失败 LOSS                         │
│ ( ) 持平 FLAT                         │
│ ( ) 证据不足 INCONCLUSIVE             │
│                                       │
│ 备注 (可选)                           │
│ [                                   ] │
│ [                                   ] │
│                                       │
│           [取消]  [确认关闭并生成学习]│
└───────────────────────────────────────┘
```

---

## 8. AI Copilot 实现细节

### 8.1 Prompt 模板

```
你是 AI-Native 项目管理系统的 Learning Copilot。

你的工作：读用户的 OKR 进度 + 最近 30 天的所有 hypothesis 结果，产出 4 类输出：
1. learnings - 每个新关闭的 hypothesis 写一段学习笔记
2. patterns - 识别跨假设的规律（最重要）
3. nextHypothesisSuggestions - 建议下一批可以试的假设
4. alerts - 主动告警（僵死 KR / 连续失败方向）

## 输入数据

### 活跃 KR 列表
{{#each krs}}
- KR {{id}}: {{name}}
  - 目标: {{target}} {{unit}}
  - 当前: {{current}} {{unit}}
  - 基线: {{baseline}} {{unit}}
  - 剩余时间: {{daysLeft}} 天
{{/each}}

### 最近 30 天 Hypothesis（{{count}} 个）
{{#each hypotheses}}
- [{{id}}] status={{status}} kr={{krName}}
  statement: {{statement}}
  mechanism: {{mechanism}}
  {{#if result}}
  result: delta={{delta}} conclusion={{conclusion}}
  learning: {{learningText}}
  {{/if}}
{{/each}}

{{#if triggerHypothesisId}}
### 本次触发的 hypothesis
{{triggerHypothesis}}

重点：为这一个 hypothesis 生成 learnings[0]，其余字段仍然可以包含其他假设。
{{/if}}

## 输出要求

严格按以下 JSON schema 输出，不要 markdown 代码块：

{
  "learnings": [
    { "hypothesisId": "...", "text": "50-150 字的学习笔记" }
  ],
  "patterns": [
    {
      "title": "简短标题 (<20 字)",
      "description": "规律描述",
      "evidenceHypothesisIds": ["..."],
      "recommendation": "建议动作",
      "confidence": "high|medium|low"
    }
  ],
  "nextHypothesisSuggestions": [
    {
      "krId": "...",
      "statement": "如果...则...会...",
      "mechanism": "因为...",
      "expectedImpact": "文字描述",
      "expectedImpactValue": 数字,
      "expectedImpactUnit": "单位"
    }
  ],
  "alerts": [
    {
      "type": "stagnant_kr|behind_schedule|dead_direction|winning_streak",
      "krId": "可选",
      "message": "告警描述",
      "severity": "info|warning|critical",
      "evidenceHypothesisIds": ["可选"]
    }
  ]
}

## 硬性约束

1. learnings 每条 50-150 字
2. patterns 只在证据 ≥ 3 个 hypothesis 时生成
3. nextHypothesisSuggestions 最多 3 个
4. alerts 里 severity=critical 只用于 "KR 进度严重落后" 场景
5. 不要生成任何假的 hypothesisId，只能引用输入数据里出现过的 id
6. 不要泛泛而谈，每条建议都要有数据支持
```

### 8.2 触发逻辑

#### 事件驱动：hypothesis close
- 触发点：`feed.service.closeHypothesis()` 事务提交后
- 异步：不阻塞 close 响应超过 15s
- 失败处理：Copilot 调用失败不阻塞 close，返回 `copilotStatus=failed`
- 去重：同一 hypothesis 5 分钟内重复 close 只触发一次

#### 定时驱动：每日 digest
- 触发点：每日 09:00 local time (Asia/Shanghai)
- 实现：使用现有的 node-cron 或轻量 interval 任务
- 并发：一次只跑一个实例（数据库锁）
- 范围：scope=`global` 全公司视图 + 每个 project 单独一份
- 存储：写入 `copilot_digests` 表
- 前端：`GET /dashboard/learning` 返回最新一条

#### 手动触发
- 前端按钮 → `POST /dashboard/learning/digest`
- 只有 ADMIN 或 KR Owner 可触发
- 每小时限速 3 次（防刷 AI API）

### 8.3 降级策略

| 失败场景 | 行为 |
|---|---|
| AI API 超时 (>15s) | close 成功，aiLearning=null，前端显示"AI 学习生成中，稍后刷新" |
| AI 返回非法 JSON | 记 log，aiLearning=null |
| AI 返回不在输入中的 hypothesisId | 剔除该条 learning |
| 数据库写 learning 失败 | close 已提交不回滚，报 warn log，让用户手动补 |

---

## 9. Acceptance Criteria

### 9.1 Hypothesis CRUD (P0)

- [ ] **AC-1.1** Given 用户已登录，When 创建假设但未选 KR，Then 返回 400 with `missing krId`
- [ ] **AC-1.2** Given 用户创建假设 Then 默认 status=BACKLOG
- [ ] **AC-1.3** Given 假设已 CLOSED_WIN，When 调用 PUT，Then 返回 403
- [ ] **AC-1.4** Given hypothesis V1 存在，When 基于它创建 V2（parentId=V1.id），Then V2.krId 自动继承
- [ ] **AC-1.5** Given hypothesis 被软删，When 列表查询，Then 不返回

### 9.2 Close + Copilot (P0)

- [ ] **AC-2.1** Given hypothesis status=RUNNING，When 调用 /close 并提供 baseline=20 actual=23，Then hypothesis_result.delta=3 自动计算
- [ ] **AC-2.2** Given /close 调用成功，Then 返回的 response 包含 hypothesis + result + aiLearning 三个字段
- [ ] **AC-2.3** Given AI 在 15s 内返回，Then response.aiLearning 非空 + 已写入 learning 表
- [ ] **AC-2.4** Given AI 超时，Then response.copilotStatus="failed" + close 本身成功
- [ ] **AC-2.5** Given conclusion=WIN，Then hypothesis.status=CLOSED_WIN
- [ ] **AC-2.6** Given conclusion=LOSS，Then hypothesis.status=CLOSED_LOSS
- [ ] **AC-2.7** Given close 后立即再调 /close，Then 返回 400 "already closed"

### 9.3 Learning Dashboard (P0)

- [ ] **AC-3.1** Given 用户访问 /dashboard，Then 加载 Learning Dashboard（不是原 my-tasks）
- [ ] **AC-3.2** Given 访问 /dashboard/my-tasks，Then 返回 404
- [ ] **AC-3.3** Given KR 当前值 22.5 目标 30 基线 20，Then progressPercent = (22.5-20)/(30-20) = 25
- [ ] **AC-3.4** Given KR 超过 7 天无新 hypothesis RUNNING，Then isStagnant=true
- [ ] **AC-3.5** Given 页面加载，Then 调用一次 `GET /dashboard/learning` 返回全部数据（不分多次请求）
- [ ] **AC-3.6** Given latestCopilotDigest 存在，Then 显示在右侧 Copilot 区；不存在时显示 "暂无 digest"

### 9.4 Experience 迁移 (P0)

- [ ] **AC-4.1** Given 数据库有 N 条 experience，When 运行 migration，Then learning 表有 N 条 source=HUMAN 记录
- [ ] **AC-4.2** Given 旧代码调用 GET /experience/feedbacks，Then 返回 302 redirect to /learnings?source=HUMAN
- [ ] **AC-4.3** Given 迁移后，Then 原 experience 前端路由自动 redirect 到 /learnings

### 9.5 Copilot 行为 (P0)

- [ ] **AC-5.1** Given 触发 digest job，Then 15s 内生成 payload 并写入 copilot_digests
- [ ] **AC-5.2** Given 30 天内有 ≥3 个同方向失败的 hypothesis，Then Copilot 输出包含 pattern.type="dead_direction"
- [ ] **AC-5.3** Given 某 KR 无 RUNNING hypothesis 超 7 天，Then Copilot 输出包含 alert.type="stagnant_kr"
- [ ] **AC-5.4** Given Copilot 返回非法 JSON，Then 不影响主流程，写 warn log
- [ ] **AC-5.5** Given 手动触发 digest，Then 每小时最多 3 次

### 9.6 Hypothesis 模板库 (P0，G6)

- [ ] **AC-6.1** Given 有 5+ 系统默认模板 seeded，When 访问 /hypothesis-templates，Then 按 category 分组展示
- [ ] **AC-6.2** Given 用户基于模板创建 hypothesis，Then `template.usageCount +1`
- [ ] **AC-6.3** Given 系统默认模板，When 非 ADMIN 用户尝试删除，Then 返回 403
- [ ] **AC-6.4** Given placeholder values 缺少 required 字段，Then 创建 400 error

### 9.7 A/B Variants + 显著性 (P0，G7)

- [ ] **AC-7.1** Given 一个 hypothesis 没有 variant，When 添加第一个 variant，Then 必须 `type=CONTROL`
- [ ] **AC-7.2** Given CONTROL: 38/1000，TREATMENT B: 47/1000，Then 服务端算 `pValue ≈ 0.032`，`isSignificant=true`
- [ ] **AC-7.3** Given variant 数据更新，Then 所有 variants 的 pValue 和 CI 重算
- [ ] **AC-7.4** Given variant `isSignificant=false`，When mark-winner，Then 返回 warning 除非 `?force=true`
- [ ] **AC-7.5** Given hypothesis 有 winner variant，Then KR 进度用 winner.delta 聚合，不用 hypothesis_result
- [ ] **AC-7.6** Given `conversionCount > sampleSize`，Then 服务端 400 校验
- [ ] **AC-7.7** Given 客户端传 `pValue`，Then 服务端忽略重算（防篡改）
- [ ] **AC-7.8** z-test 公式单测 20+ cases（边界、极端比例、0 样本等）

### 9.8 ICE/RICE 打分 (P0，G9)

- [ ] **AC-8.1** Given ICE scores impact=8, confidence=6, ease=9，Then `iceScore = 4.32`（48/10 * 0.9）
- [ ] **AC-8.2** Given RICE scores reach=5000, impact=2, confidence=80, effort=2，Then `riceScore = 4000`（5000*2*0.8/2）
- [ ] **AC-8.3** Given ICE 字段超范围（>10 或 <1），Then 400 error
- [ ] **AC-8.4** Given `sortBy=iceScore&order=desc`，Then 列表按分数降序

### 9.9 Parent 树形可视化 (P0，G11)

- [ ] **AC-9.1** Given `/hypotheses/:id/tree` 请求，Then 返回 root + children recursive，深度上限 20
- [ ] **AC-9.2** Given 树深度 > 20，Then 只返回前 20 层 + `truncated=true` flag
- [ ] **AC-9.3** Given 前端渲染树形图，Then 每个节点 click 跳转正确
- [ ] **AC-9.4** Given hypothesis 已软删，Then 树中该节点显示"已删除"占位但仍展示结构

### 9.10 跨项目对比看板 (P0，G10)

- [ ] **AC-10.1** Given 非 ADMIN 访问 /dashboard/cross-project，Then 返回 403
- [ ] **AC-10.2** Given 3 个项目各有假设数据，Then response.projects 数组长度 = 3
- [ ] **AC-10.3** Given Copilot digest scope=global，Then crossPatterns 可以跨项目 evidence

### 9.11 KR 时间维度 (P0，G8)

- [ ] **AC-11.1** Given KR startDate=2026-01-01, endDate=2026-04-01, current=22.5, target=30, baseline=20，在 2026-03-01 时，Then `timeElapsedRatio ≈ 0.667, kpiProgressRatio = 0.25, ratio ≈ 0.375`, status=critical
- [ ] **AC-11.2** Given `endDate=null`，Then 退回绝对百分比算法
- [ ] **AC-11.3** Given 老 KR 无 startDate 字段，Then 默认等于 createdAt（migration）
- [ ] **AC-11.4** Given `timeElapsedRatio = 0`（startDate 未到），Then `ratio = Infinity`，status=on_track

### 9.12 响应式 + 移动端 (P0，G12)

- [ ] **AC-12.1** Given 视口 375px，When 访问 /dashboard，Then 三栏布局变成 tab 切换
- [ ] **AC-12.2** Given 视口 375px，When 访问 /hypotheses 列表，Then 表格变成卡片视图
- [ ] **AC-12.3** Given 视口 768px，When 打开 variant 录入表单，Then 双列布局
- [ ] **AC-12.4** Given 所有数字输入，Then 在 mobile 有 `inputmode="numeric"` 属性
- [ ] **AC-12.5** Given 所有 drag/drop 交互，Then 在 touch device 降级为 tap

### 9.13 中英双语 i18n (P0，G13)

- [ ] **AC-13.1** Given 用户设置语言=English，Then 所有 UI 切换到英文
- [ ] **AC-13.2** Given 所有 Vue 文件，Then ESLint `vue-i18n/no-raw-text` 通过（0 硬编码）
- [ ] **AC-13.3** Given 未翻译的 key，Then 退回中文（不显示 key 名）
- [ ] **AC-13.4** Given `Accept-Language: en`，Then 后端错误消息也返回英文

### 9.14 非回归 (P0)

- [ ] **AC-14.1** 现有 iteration CRUD 不受影响
- [ ] **AC-14.2** 现有 feed package 流程不受影响
- [ ] **AC-14.3** 现有 board 功能不受影响
- [ ] **AC-14.4** 现有 OKR 页面不受影响（只多"查看假设"入口 + 新时间字段）
- [ ] **AC-14.5** 现有 experience 路由 302 redirect 正常

---

## 10. Milestones

**Scope 扩张后时间窗：7 周（非 3 周）。** 不是 v1/v2 分期，而是一次完整交付里的 Tracks 并行 + 串行。

### Track 结构

```
Track I (Infra)         : Week 1 数据模型 + BullMQ + i18n/responsive 框架（不能后做）
Track B (Backend)       : Week 2-3 业务 services + routes + 显著性检验 + Copilot
Track F (Frontend)      : Week 3-5 Dashboard 重构 + Hypothesis UI + Variants UI + Template UI
Track P (Polish)        : Week 5-6 响应式细化 + i18n 翻译 + 跨项目看板 + 树形图
Track Q (Quality)       : Week 6-7 测试补齐 + E2E + 性能基准 + Copilot prompt 调优
```

### Week 1：Infra 基座（Day 1-5）

| Day | 任务 | Owner | Deliverable |
|---|---|---|---|
| D1 | 装依赖 + Redis + BullMQ smoke test | infra-agent | 环境验证 |
| D1 | **vue-i18n 框架初始化 + locale/zh.json / locale/en.json 骨架** | infra-agent | i18n 框架（Day 1 建立避免后期 refactor）|
| D1 | **Tailwind / CSS breakpoints + responsive utilities** | infra-agent | 375/768/1280 breakpoints |
| D2 | Prisma schema 完整改动（含 Template / Variant / KR 时间字段 / ICE-RICE） | infra-agent | `schema.prisma` |
| D2 | Migration Stage 1 expand + dual-write | infra-agent | migration sql + CHECK 约束 |
| D3 | contracts/* 全部新建（4 新 + 2 修改） | infra-agent | 完整 TS 类型 |
| D3 | `services/stats.ts` 写 z-test + t-test + normalCDF 近似 | backend-hypothesis | 20+ 单测 |
| D4 | `services/ai/client.ts` 抽底层 + `services/sop-split/` 重构 | backend-copilot | SOP regression test 必过 |
| D4 | Zod schema 骨架（Hypothesis / Variant / Copilot output） | backend-copilot | schema.ts |
| D5 | Hypothesis service CRUD + 循环检测 + 权限 + 单测 | backend-hypothesis | `services/hypothesis/*` |
| D5 | Template service CRUD + seed 5 系统默认模板 | backend-hypothesis | seed script |

**W1 验收**：schema 全通，contracts 全绿，i18n + responsive 框架就位，stats.ts 单测 100% 通过。

### Week 2：业务 backend + 基础 UI（Day 6-10）

| Day | 任务 | Owner | Deliverable |
|---|---|---|---|
| D6 | POST /close + hypothesis_result / variants 事务 | backend-hypothesis | service + 事务测试 |
| D6 | Variants CRUD + 显著性自动重算 | backend-hypothesis | service + 20+ stats 测试 |
| D7 | Learning service + Expand-Contract dual-write | backend-learning | 两表同步 |
| D7 | `/hypothesis-templates` routes + `/from-template` | backend-hypothesis | routes 全套 |
| D8 | ICE/RICE scoring service + routes | backend-hypothesis | service |
| D8 | `/hypotheses/:id/tree` API + 深度保护 | backend-hypothesis | 递归 + truncate |
| D9 | Dashboard service + KR 时间维度算法 | backend-dashboard | 并行查询 + 索引验证 |
| D9 | Cross-project aggregation service（ADMIN only） | backend-dashboard | service |
| D10 | BullMQ queue setup + copilot worker + Redis SETNX 锁 | backend-copilot | queue 基建 |

**W2 验收**：所有 backend API curl 可通，显著性算得对，Redis + BullMQ 跑通。

### Week 3：Copilot + 前端基础（Day 11-15）

| Day | 任务 | Owner | Deliverable |
|---|---|---|---|
| D11 | Copilot prompt + buildContext + 30 天预过滤 | backend-copilot | prompt.ts + context.ts |
| D11 | runCopilotOnClose + Zod safeParse + 降级 | backend-copilot | agent.ts |
| D12 | Daily digest job + CopilotDigest 表 + Cost log | backend-copilot | jobs/ + budget.ts |
| D12 | `stores/hypothesis.ts` + `api/hypothesis.ts` + `api/learning.ts` | frontend-hypothesis | store + api 层 |
| D13 | `/dashboard` 重构成 Learning Dashboard（**i18n 全部 `$t()`**） | frontend-dashboard | index.vue（375px test）|
| D13 | 删除 /dashboard/my-tasks + 加 NotFound redirect | frontend-dashboard | router |
| D14 | `/hypotheses` 列表页 + ICE/RICE sort + 响应式卡片降级 | frontend-hypothesis | index.vue |
| D14 | `/hypotheses/:id` 详情页 + 关闭 dialog（轮询 AI learning） | frontend-hypothesis | detail.vue |
| D15 | `<CopilotPanel>` 组件 + pattern 匿名化过滤 | frontend-copilot | 组件 + MarkdownRenderer |

**W3 验收**：端到端 happy path 跑通：创建假设 → close → Copilot 异步生成 learning → Dashboard 展示。手机视口可用。

### Week 4：模板库 + Variants UI + 树形图（Day 16-20）

| Day | 任务 | Owner | Deliverable |
|---|---|---|---|
| D16 | `/hypothesis-templates` 管理页（ADMIN）+ 模板选择器组件 | frontend-hypothesis | template-library.vue |
| D16 | 创建假设时"从模板开始"流程 + placeholder 填充 | frontend-hypothesis | create-from-template.vue |
| D17 | `<HypothesisVariantsPanel>` 组件（在详情页的 Variants tab） | frontend-hypothesis | variants-panel.vue |
| D17 | Variant 录入 form + 显著性展示（p-value 条 + CI 图） | frontend-hypothesis | variant-form.vue |
| D18 | `<HypothesisTreeViz>` 组件（@antv/g6）+ 交互式节点 | frontend-hypothesis | tree-viz.vue |
| D18 | 树形图节点颜色 + 状态图标 + 跳转 | frontend-hypothesis | 同上 |
| D19 | `/dashboard/cross-project` 页面（ADMIN）+ 表格组件 | frontend-dashboard | cross-project.vue |
| D19 | KR 时间维度 progress bar + tooltip 显示剩余天数 | frontend-dashboard | kr-progress-bar.vue |
| D20 | ICE/RICE 打分 dialog + 分数展示 card | frontend-hypothesis | scoring-dialog.vue |

**W4 验收**：所有新 UI 组件可交互，功能走通，但未做细节 polish。

### Week 5：Polish 前半 - 响应式 + i18n 翻译（Day 21-25）

| Day | 任务 | Owner | Deliverable |
|---|---|---|---|
| D21 | 所有 view 的 375px 视口过一遍 + bug fix | frontend-全员 | responsive gaps 报告 |
| D21 | Touch interaction 降级（drag→tap）| frontend-hypothesis | mobile-interactions.ts |
| D22 | 768px tablet 布局验证 | frontend-全员 | tablet 截图 |
| D22 | Variants 录入表单的移动端优化（numeric keyboard 等） | frontend-hypothesis | form 优化 |
| D23 | locale/en.json 完整翻译（~300 keys） | Byron + frontend | en.json |
| D23 | ESLint vue-i18n/no-raw-text 跑通 + 修所有硬编码 | frontend-全员 | 0 raw text |
| D24 | 语言切换器 + user.preferredLocale 保存 | frontend-dashboard | settings UI |
| D24 | Accept-Language header 后端错误消息 | backend-全员 | i18n 中间件 |
| D25 | 设计师 review + 视觉细节调整（padding, color, typography） | frontend-全员 | design polish |

**W5 验收**：375/768/1280 三视口都过，中英双语全切，0 硬编码字符串。

### Week 6：Polish 后半 - Copilot 质量 + 测试补齐（Day 26-30）

| Day | 任务 | Owner | Deliverable |
|---|---|---|---|
| D26 | Copilot prompt 迭代（基于真实数据跑 20 次观察输出质量） | Byron | prompt v2 |
| D26 | pattern recognition 输出质量 eval 套件 | backend-copilot | evals/*.test.ts |
| D27 | 所有 P0 单测补齐（目标：新代码 100% 覆盖） | 全员 | coverage 报告 |
| D27 | Stats.ts 边界 case 单测（0 样本、100% 转化、大样本等） | backend-hypothesis | 完整 |
| D28 | E2E 测试 happy path（Vitest 或 Playwright） | 全员 | e2e/*.spec.ts |
| D28 | 性能基准测试（seed 500 假设 + 50 KR）Dashboard p50 < 200ms | backend-dashboard | 基准 |
| D29 | 无障碍（a11y）扫一遍 + 键盘导航 | frontend-全员 | axe 报告 |
| D29 | Redis / BullMQ 故障演练（手动 kill redis，验证 fallback） | backend-copilot | CG1 验证 |
| D30 | Migration dual-write 1 周数据一致性验证 | infra-agent | 行数对比报告 |

**W6 验收**：测试覆盖达标，Critical Gaps 全部验证，性能基准达 SLO。

### Week 7：灰度 + 上线（Day 31-35）

| Day | 任务 | Owner | Deliverable |
|---|---|---|---|
| D31 | 内部 dogfood 2 天（你自己用） | Byron | bug 清单 |
| D31 | 高优 bug 修 | 全员 | — |
| D32 | `/design-review` skill 跑一遍（可选） | frontend-全员 | UI polish list |
| D33 | 文档 + CHANGELOG + Release notes | 全员 | docs update |
| D33 | install.sh 更新（Redis / BullMQ worker / env vars） | infra-agent | deploy script |
| D34 | 生产数据库 migration dry-run + rollback 演练 | infra-agent | 演练日志 |
| D34 | 灰度上线（scope=Byron only，其他用户仍看 my-tasks） | 全员 | 灰度 flag |
| D35 | 全量上线 + Migration Stage 2 contract（drop experiences 表） | 全员 | production |

**W7 验收**：生产上线，Migration contract 完成，Byron 开始用 Learning Copilot 替代 my-tasks。

---

## 11. Migration Plan

### 11.1 数据库迁移

```
Step 1: DDL
  - CREATE TABLE hypotheses
  - CREATE TABLE hypothesis_results
  - CREATE TABLE copilot_digests
  - ALTER TABLE iterations ADD COLUMN hypothesis_id
  - ALTER TABLE experiences RENAME TO learnings
  - ALTER TABLE learnings ADD COLUMN source (default 'HUMAN')
  - ALTER TABLE learnings ADD COLUMN hypothesis_id
  - CREATE VIEW experiences AS SELECT * FROM learnings WHERE source = 'HUMAN'  -- 临时兼容

Step 2: 数据迁移
  - UPDATE learnings SET source = 'HUMAN' WHERE source IS NULL

Step 3: 验证
  - SELECT COUNT(*) FROM learnings WHERE source IS NULL  -- 必须 = 0
  - SELECT COUNT(*) FROM learnings  -- 必须 = 原 experience 行数
```

### 11.2 API 兼容层

保留一个月的兼容期：
- `GET /api/v1/experience/feedbacks` → 302 → `/learnings?source=HUMAN`
- `POST /api/v1/experience/feedbacks` → 内部调 learnings service
- `DELETE /api/v1/experience/feedbacks/:id` → 内部调 learnings service

一个月后：
- 上述旧路径改返回 410 Gone，附带迁移说明
- 三个月后彻底删除

### 11.3 前端兼容

- 原 `/experience` 路由 → 组件内 `useRoute()` 检测到访问后 `router.replace('/learnings')`
- 侧边菜单 rename："经验沉淀" → "学习库"

### 11.4 回滚策略

如果上线后严重问题：
```sql
-- 回滚：learning 表不变（向后兼容），只把 view 改回去
DROP VIEW IF EXISTS experiences;
ALTER TABLE learnings RENAME TO experiences;
ALTER TABLE experiences DROP COLUMN source;
ALTER TABLE experiences DROP COLUMN hypothesis_id;
```

---

## 12. Success Metrics

### 12.1 Leading Indicators（1-2 周内可见）

| 指标 | 目标 | 测量方式 |
|---|---|---|
| Hypothesis 创建数/周 | > 10 | DB count |
| close 时的 result 完整率 | 100% | DB: result 表非空 |
| Hypothesis 挂 KR 的比例 | 100% | DB: krId NOT NULL |
| AI learning 生成成功率 | > 95% | copilot_status=success 比例 |
| AI learning 响应 p50 延迟 | < 10s | log 统计 |
| Daily digest 生成成功率 | > 99% | job log |
| Dashboard PV | > 100/day | 前端埋点 |

### 12.2 Lagging Indicators（1-3 月可见）

| 指标 | 目标 | 测量方式 |
|---|---|---|
| 每周 learning velocity | 单调增长 | count(closed hypothesis) |
| KR 进度驱动数据化比例 | 100% 的 KR 进度来自 hypothesis_result | |
| Pattern 被采纳率 | > 30% 的 pattern 被点击查看 | 埋点 |
| nextHypothesisSuggestions 被采纳率 | > 10% 转成真实 hypothesis | DB 链路 |
| experience/learning 被检索次数 | 上升趋势 | 搜索日志 |

### 12.3 Qualitative Signals

- 团队成员开始用"这个假设"而不是"这个任务"描述工作 → **心智转换成功**
- 周会上有人引用 Copilot digest 作为决策依据 → **Copilot 进入工作流**
- 有人主动把 hypothesis pattern 沉淀到设计原则 → **知识飞轮启动**

---

## 13. Open Questions → **全部 RESOLVED (2026-04-12)**

> 以下 10 条原 Open Questions 已在 2026-04-12 的产品评审中全部解决，答案和理由见下。
> 如果后续实现中发现答案不对，请更新本节并同步到决策日志。

### OQ-1 ✅ Copilot service 架构（原阻塞项）

**答案**：新建 `services/copilot/`，复用底层 AI client，业务逻辑独立。

**架构**：
```
services/
├── ai/                  # 共享底层
│   ├── client.ts        # HTTP client + 重试
│   ├── config.ts        # key / baseUrl / org
│   ├── errors.ts
│   └── types.ts
├── copilot/             # Learning Copilot（新建）
│   ├── index.ts         # runCopilotOnClose / runDailyDigest
│   ├── prompt.ts        # prompt 模板
│   ├── context.ts       # buildContext
│   ├── schema.ts        # Zod validator
│   ├── agent.ts         # 主调用 + 降级
│   └── __tests__/
└── sop-split/           # 重构现有 ai.service 搬入
    ├── index.ts
    └── prompt.ts
```

**理由**：SOP 拆解和 Learning Copilot 是两个完全不同的 agent，prompt 演化独立、测试面独立、未来扩展独立。现有 `ai.service.ts` 保留一个月作为 facade（re-export），避免 Week 1 改动面积过大。

### OQ-2 ✅ Daily digest scope（原阻塞项）

**答案**：Generate 时 project-level，展示时按用户 squad 过滤，ADMIN 可切换全局视图。

**数据模型调整**：`copilot_digests.payload` 内部每条 alerts / learnings / patterns / suggestions 都带 `squadId` 标签，前端根据当前用户的 squadId 默认过滤。

**理由**：
- Project-level 生成才能发现**跨 squad 的规律**（这是 killer feature）
- Squad-level 展示保证日常聚焦，不信息过载
- ADMIN 切"全局视图"可以看大盘

### OQ-3 ✅ Markdown 支持

**答案**：学习笔记文本允许 Markdown，结构化字段（title / message / recommendation）纯文本。

| 字段 | 格式 |
|---|---|
| `learnings[].text` | Markdown |
| `patterns[].title` | 纯文本（≤20 字）|
| `patterns[].description` | Markdown |
| `patterns[].recommendation` | 纯文本 |
| `alerts[].message` | 纯文本 |
| `nextHypothesisSuggestions[].statement` | 纯文本 |

**前端**：新建 `<MarkdownRenderer>` 组件包 `marked + DOMPurify`，只对明确允许的字段使用。**Prompt 里必须明确告诉 Claude 哪些字段允许 Markdown**，否则 LLM 会在所有字段都写。

### OQ-4 ✅ 手动触发 digest 权限

**答案**：ADMIN + KR Owner（objective.ownerId = self）可触发，每小时限速 3 次/用户。

**理由**：KR Owner 最关心本 KR 进度，不该等 admin 批。限速防刷 AI API。

### OQ-5 ✅ 老 experience 数据不进 Copilot

**答案**：v1 不做。老 experience 迁移到 learning 表（source=HUMAN），仍然在 `/learnings` 页面可搜索，但**不进 Copilot 上下文**。v2 再写"legacy experience miner"单独扫。

**理由**：老 experience 没有 `metricType / baseline / actual / conclusion` 结构化字段，Copilot 的 pattern recognition 依赖定量对比，定性文本会产生空洞泛化污染 MVP 期质量观察。

### OQ-6 ✅ 软删 hypothesis 剔除 Copilot 上下文

**答案**：默认剔除（`deletedAt IS NULL`）。ADMIN 手动触发 digest 时可选 `?includeDeleted=true`（审计场景）。

### OQ-7 ✅ parentId 循环检测

**答案**：必须做，service 层拦截。在 `createHypothesis` 和 `updateHypothesis(parentId change)` 都调用 `validateNoCycleAndDepth(newParentId, currentId, maxDepth=20)`。

**算法**：DFS 从 newParentId 往上走，若遇到 currentId 或超过深度 20 → 抛 AppError。

### OQ-8 ✅ Copilot 上下文时间窗

**答案**：默认 30 天，写入 `systemConfig` 表 key=`copilot.contextDays`，用户可在 AI 配置页调整。

**理由**：30 天 ≈ 4 周 ≈ 4 次假设批次，样本数 30-50 个足够 pattern recognition；GPT-4o 128k context 绰绰有余。

### OQ-9 ✅ KR 进度阈值

**答案**：v1 用绝对百分比（`(current - baseline) / (target - baseline)`）：
- `≥ 0.8` → on_track（绿）
- `≥ 0.5` → behind（黄）
- `< 0.5` → critical（红）

**理由**：现有 `KeyResult` 模型无 deadline 字段，时间比率算法需要先加字段 + 迁移。v2 给 KR 加 startDate + endDate 后升级到"时间进度 vs KR 进度"的比率算法。

### OQ-10 ✅ 多 iteration UI

**答案**：详情页"执行" tab 简单列表，每行 `name + status + assignee + closedAt`，点击跳现有 iteration 详情页。**不做** 树 / Gantt / timeline。

**理由**：PRD 已明确 iteration 降级为执行容器，不是用户心智中心。

---

## 14. Risks & Mitigations

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | Copilot 输出质量差，变成噪音 | 中 | 高 | 灰度一周后人工审核 10 条，调 prompt |
| R2 | 用户不适应"假设"心智，继续当任务用 | 高 | 中 | 删除 my-tasks 路由强制切换；UI 文案避免"任务" |
| R3 | AI API 费用超预算 | 中 | 中 | D27：COPILOT_MAX_CONTEXT_HYPOTHESIS=30 + 500/月 cap + cost_log |
| R4 | experience 迁移丢数据 | 低 | 高 | D22：Expand-Contract 两阶段 + dual-write + 行数对比 |
| R5 | hypothesis_result delta 计算错 | 低 | 高 | 单测覆盖 + 服务端计算不接受客户端传值 |
| R6 | Dashboard 加载慢（聚合查询多） | 中 | 中 | D23：并行 query + in-memory join + 索引 + p95 SLO |
| R7 | Copilot JSON schema 不稳定（LLM 飘） | 中 | 中 | D21：Zod safeParse + 失败降级 + log 采样观察 |
| R8 | 现有用户对 experience→learning 改名抵触 | 低 | 低 | 保留旧路径 1 月 + 侧边菜单双名 "学习库 (原经验沉淀)" |
| **R9** | **i18n 非 Day 1 建立会导致 Week 4-5 大规模 refactor** | 高 | 高 | **Week 1 Day 1 必须把 vue-i18n 框架装好**，所有新写的 UI 从第一行就用 `$t()`。ESLint rule 拦住硬编码 |
| **R10** | **移动端非 Day 1 考虑导致 Week 5 重写布局** | 高 | 高 | **Week 1 Day 1 定 breakpoints + responsive utilities**。所有 view 从第一版就要用 responsive class |
| **R11** | **A/B Variants 的样本数据手填，用户积极性不足** | 中 | 中 | 文案强调"手填 30 秒，获得显著性检验"；Week 5 如果使用率低，加"仅单 variant 模式"逃逸门 |
| **R12** | **自实现统计公式精度不够，给出错误显著性结论** | 中 | 高 | Stats.ts 单测 20+ 边界 case；与 scipy/R 的 p-value 对比 10 个参考样本，误差 < 1e-4 |
| **R13** | **@antv/g6 依赖 bundle size 过大（~300KB）** | 低 | 中 | 用动态 import + route-level code split，仅树形图页加载 |
| **R14** | **跨项目看板在 project = 1 时价值低** | 低 | 低 | 只有 ADMIN 可见；project = 1 时显示 empty state |

### 🚨 Critical Gaps — Must Fix in Week 1（Eng Review 2026-04-12 新增）

这 3 条不是 risks，是**必须在 Week 1 解决的架构漏洞**。不修好不能进 Week 2。

| # | Critical Gap | 失败模式 | 必要修复 |
|---|---|---|---|
| **CG1** | **Redis 宕机 close service fallback 缺失** | Redis 挂 → BullMQ enqueue 500 → 所有 close 请求失败 | close service 必须 try/catch BullMQ enqueue：失败时写 warn log 并返回 `copilotStatus: 'unavailable'`（close 本身成功）。用户看到"AI 暂时不可用，结果已保存"。加 health check + alert |
| **CG2** | **Expand-Contract Stage 1 dual-write 事务性** | 新老表写入非原子 → 任一表写失败 → 数据不一致 → rollback 需要手动补齐 | 两表写入必须在同一 `prisma.$transaction([...])` 内。写入后 service 层立即 `SELECT COUNT(*)` 对比两表等行性。不一致时抛 500 + 告警 |
| **CG3** | **BullMQ retry 条件性** | Zod schema 失败/4xx 被当成可重试错误 → 烧 3 倍 token + 日志噪声 | Worker 内分类错误：`retryable` (5xx/timeout/network) → 交给 BullMQ 自动 retry；`non_retryable` (4xx/Zod/quota) → 手动 `throw new UnrecoverableError(err)` 立即进 DLQ |

### ⚠️ Should Fix — Week 2-3（Eng Review 2026-04-12 新增）

| # | 问题 | 缓解 |
|---|---|---|
| SF1 | pm2 重启可能错过 daily digest | 加"重新生成"按钮（手动触发）+ 启动时检测昨日是否有 digest，缺失则补跑一次 |
| SF2 | 孤儿 hypothesisId（Learning 指向软删 hypothesis）静默失联 | 每日汇报 job 扫 `Learning.hypothesisId != null AND hypothesis.deletedAt IS NOT NULL`，输出 count 到 admin log |

---

## 15. Explicit Out-of-Scope (Scope 扩张后只剩 4 项)

**经 2026-04-12 用户决策 D29，原 Out-of-Scope 的 8 项全部进入 scope（见 §2.3）。本节只列真正不做的**：

1. ❌ **不接** Amplitude / GA4 / Mixpanel / 任何第三方 analytics API
   - 原因：需要外部埋点基建 + 用户账号配置，超出代码层面
   - Variant 数据手填已能验证显著性价值，自动化数据源是下一步产品
2. ❌ **不做** Legacy experience AI 回扫（不把老 experience 喂给 Copilot）
   - 原因：老数据结构化不足，Copilot 处理质量差
   - 6 月后写专用 legacy prompt + 一次性 migration 脚本
3. ❌ **不动** 现有 iteration / feed / board 核心流程
   - 原因：只加外键和视图，不改逻辑，避免回归
4. ❌ **不做** SSO / 新权限系统
   - 原因：现有 JWT + role 权限够用，不值得改

**任何想把 N1-N4 塞进 scope 的讨论都应该被 PRD owner 拒绝**。

**✅ 以下项目原在 Out-of-Scope，现已进入 scope**（Epic 5-12，G6-G13）：
- Hypothesis 模板库
- Hypothesis Variants + 显著性检验（自实现）
- ICE / RICE 打分
- 跨项目对比看板
- Parent 树形可视化
- KR 时间维度进度
- 移动端响应式（375/768/1280）
- 中英双语 i18n

---

## 16. Appendix

### A. 决策日志

| # | 决策 | 日期 | 决策人 | 原因 |
|---|---|---|---|---|
| D1 | experience 合并到 learning，加 source 字段 | 2026-04-11 | Byron | 两者本质是同一件事，合并消除二元性 |
| D2 | Copilot 双触发（close 事件 + 每日 digest） | 2026-04-11 | Byron | 即时反馈建立习惯，digest 捕捉规律 |
| D3 | 删除 /dashboard/my-tasks 首页 | 2026-04-11 | Byron | 强制心智转换，不留退路 |
| D4 | 3 周 MVP，不接任何第三方 analytics | 2026-04-11 | Byron | 先验证心智模型，数据源 Day 2 |
| D5 | Killer feature 是跨假设 pattern recognition | 2026-04-11 | Brainstorm | 这是现有 PM 工具做不到的差异化 |
| D6 | Hypothesis 作为一等公民，iteration 作为执行容器 | 2026-04-11 | Byron | 让"假设"取代"任务"成为用户心智核心 |
| D7 | Copilot 独立 service：`services/copilot/`，复用底层 AI client | 2026-04-12 | Eng Review | SOP 拆解和 Copilot 是两个独立 agent，prompt 演化独立 |
| D8 | Digest generate 时 project-level，展示时按 squad 过滤 | 2026-04-12 | Byron | 兼顾跨组 pattern recognition 和日常聚焦 |
| D9 | Markdown 只允许 learnings.text 和 patterns.description；其他字段纯文本 | 2026-04-12 | Frontend | Element Plus 组件限制 + 可预测性 |
| D10 | 手动触发 digest：ADMIN + KR Owner 可用，每小时 3 次/人限速 | 2026-04-12 | Byron | 赋能 + 防刷 |
| D11 | 老 experience 数据不进 Copilot 上下文（v1），v2 单独扫 | 2026-04-12 | Byron | 结构化不足，会污染质量观察 |
| D12 | 软删 hypothesis 默认剔除 Copilot 上下文，admin 可强制包含 | 2026-04-12 | Engineering | 尊重用户意图 + 审计通道 |
| D13 | parentId 链循环检测在 service 层拦截，深度限制 20 | 2026-04-12 | Engineering | DB 约束不够 |
| D14 | Copilot 上下文默认 30 天，通过 systemConfig 可调整 | 2026-04-12 | Byron | 平衡样本量和 context 污染 |
| D15 | KR 进度阈值 v1 用绝对百分比（80/50/50），v2 加 deadline 后用时间比率 | 2026-04-12 | Byron | 现模型无时间字段 |
| D16 | Hypothesis 详情页 iteration 用简单列表，不做树/Gantt | 2026-04-12 | Design | iteration 是执行容器不是心智中心 |
| **D17** | Scope 解读：**质量优先**（非功能扩张）——25 文件范围，100% 测试覆盖 + 异步 AI + 完整 edge case + 安全 migration | 2026-04-12 | Eng Review | 用户说"不分 v1/v2"有两种解读，只选"不偷质量"这一种。v2 新功能（模板库/树图/跨项目）仍然 defer |
| **D18** | Async AI = **BullMQ + Redis 队列 + 前端 3s polling**（不用 SSE / WebSocket）| 2026-04-12 | Eng Review | 工业级 queue 保证重试+DLQ+backoff，前端保持简单轮询。Redis 还能顺便做 digest 分布式锁 + dashboard cache |
| **D19** | `services/copilot/` + `services/ai/` + `services/sop-split/` **三向拆分**（重构 ai.service.ts）| 2026-04-12 | Eng Review | 接受 1 天重构成本换长期架构清洁。SOP regression test 必跑 |
| **D20** | 跨 squad pattern = **匿名化展示**（本组 evidence 可点，他组 evidence 灰化）| 2026-04-12 | Eng Review | Copilot payload 每条带 squadId 标签，前端 render 时 filter |
| **D21** | **加 Zod 依赖**用于 Copilot 输出 runtime 校验 + 以后 route 输入校验 | 2026-04-12 | Eng Review | AIPM 现 0 validator 库，Zod 是单一真源选择 |
| **D22** | Migration = **Expand-Contract 两阶段**（dual-write 2 周 → contract）| 2026-04-12 | Eng Review | ALTER TABLE RENAME 风险高。Expand-Contract 多 1 天代码换安全 rollback |
| **D23** | Dashboard 聚合用 **并行 query + in-memory join**，不用深层 Prisma include。SLO p95 < 500ms | 2026-04-12 | Eng Review | 避免 N+1 和 over-fetch。先测量再决定是否加 Redis cache |
| **D24** | `hypothesis.closedAt` 一致性靠 **DB CHECK 约束** 强制 `status ∈ CLOSED_* ⟺ closedAt IS NOT NULL` | 2026-04-12 | Eng Review | Schema 层防漂移，Service 层 closeHypothesis() 是唯一写入口 |
| **D25** | `metricType` 从 Prisma enum 改为 **string + white-list registry**（服务端常量）| 2026-04-12 | Eng Review | 现实指标分类 open-ended，enum 会不停 migration |
| **D26** | Learning 孤儿防御：service 层 join 时 **filter deletedAt IS NULL**，孤儿 hypothesisId 返回 null | 2026-04-12 | Eng Review | 全模型软删 + SetNull 外键引发的孤儿情况 |
| **D27** | Token 预算：**COPILOT_MAX_CONTEXT_HYPOTHESIS = 30** + **500/月 cap** + cost_log 表 | 2026-04-12 | Eng Review | 估算：60 次/月 × $0.05 = $3/月，cap 防 bug 烧钱 |
| **D28** | Daily cron 用 **Redis SETNX 分布式锁**（5 分钟 TTL）+ BullMQ 重试 = **3 次 exponential backoff + 条件性**（Zod/4xx 不重试）| 2026-04-12 | Eng Review | 防 pm2 重启时 cron 并发 + 无效重试 |
| **D29** | **Scope 扩张**：8 项原 v2 延后功能全部进入 scope（模板库 / Variants / KR 时间维度 / ICE-RICE / 跨项目 / 树形图 / 移动端 / i18n）| 2026-04-12 | Byron | 用户明确 "不分 v1/v2，都要做"。时间线从 3 周扩张到 7 周 |
| **D30** | **i18n 和移动端必须 Day 1 建立框架**，不能后期 refactor | 2026-04-12 | Eng | 这两项是 cross-cutting concern，后做成本 3-5x |
| **D31** | **显著性检验自实现**（不引入 jstat / simple-statistics 依赖） | 2026-04-12 | Eng | 核心只用 2 个公式 + normalCDF 近似，~150 行 |
| **D32** | **Variant 数据手填**（不接外部 analytics） | 2026-04-12 | Byron | 用户手填 30 秒即可获得显著性检验，先验证价值再谈自动化 |
| **D33** | **vue-i18n 框架 Week 1 Day 1 装好**，ESLint `no-raw-text` 从第一行代码生效 | 2026-04-12 | Eng | 防止后期 refactor |
| **D34** | **响应式 breakpoints 375/768/1280** + Element Plus + Tailwind responsive utilities | 2026-04-12 | Eng | 三档覆盖 mobile/tablet/desktop |
| **D35** | **@antv/g6 动态 import** for 树形图，仅 `/hypotheses/:id` 详情页加载 | 2026-04-12 | Frontend | bundle size 优化 |
| **D36** | **时间线从 3 周扩张到 7 周**，按 Track 并行而非 v1/v2 分期 | 2026-04-12 | Byron | 8 项新功能 × 平均 3 天 = ~24 天额外，按 Track 并行压到 4 周 |

### B. 对照表：旧概念 → 新概念

| 旧（传统 PM） | 新（Learning Copilot） |
|---|---|
| Sprint | Hypothesis Batch（本周要验证的假设集合）|
| Task | Hypothesis（有明确可验证的预期）|
| Done | CLOSED_WIN / CLOSED_LOSS / CLOSED_FLAT |
| Velocity | Learning Velocity（本周闭环的 hypothesis 数）|
| Retrospective | Copilot Daily Digest（自动化 retro）|
| Product Roadmap | KR-driven Hypothesis Tree |
| Postmortem | AI-generated Learning |

### C. 引用

- Marty Cagan, "Continuous Discovery Habits"
- Teresa Torres, Opportunity Solution Trees
- Basecamp Shape Up（部分借鉴 betting table 的精神）
- YC Office Hours on Forcing Questions

### D. 术语表

- **Hypothesis**：一个可验证的预期，形式为"如果做 X，则 Y 会变化 Z"
- **Learning Velocity**：单位时间内闭环的 hypothesis 数量
- **Copilot Digest**：AI 定期生成的 KR 状态 + 跨假设规律 + 下一步建议
- **Pattern Recognition**：跨 hypothesis 的规律识别（某方向连续胜/败）
- **Stagnant KR**：超过 7 天无新 hypothesis 开跑的 KR

### E. Contracts 变更（按 AIPM 项目规范）

按 `CLAUDE.md` 的要求，跨模块依赖必须通过 `contracts/` 下的类型定义对齐。本 PRD 涉及以下 contract 新增 / 修改：

#### 新建 `contracts/api-hypothesis.ts`

```typescript
import type { UserBrief, PaginationQuery, PaginationResponse } from './common'

export type HypothesisStatus =
  | 'BACKLOG'
  | 'RUNNING'
  | 'CLOSED_WIN'
  | 'CLOSED_LOSS'
  | 'CLOSED_FLAT'
  | 'ABANDONED'

export type MetricType =
  | 'CONVERSION_RATE'
  | 'COUNT'
  | 'RATIO'
  | 'REVENUE'
  | 'DURATION_SECONDS'
  | 'CUSTOM'

export type ResultConclusion = 'WIN' | 'LOSS' | 'FLAT' | 'INCONCLUSIVE'

export interface HypothesisBrief {
  id: string
  krId: string
  krName: string
  parentId: string | null
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue: number | null
  expectedImpactUnit: string | null
  status: HypothesisStatus
  owner: UserBrief
  createdAt: number
  closedAt: number | null
}

export interface HypothesisResult {
  id: string
  hypothesisId: string
  metricType: MetricType
  metricName: string
  baseline: number
  actual: number
  delta: number
  unit: string | null
  conclusion: ResultConclusion
  humanNote: string | null
  createdAt: number
}

export interface HypothesisDetail extends HypothesisBrief {
  parent: HypothesisBrief | null
  children: HypothesisBrief[]
  iterations: Array<{
    id: string
    name: string
    status: string
    assigneeId: string | null
    closedAt: number | null
  }>
  result: HypothesisResult | null
  learnings: LearningBrief[]
}

export interface CreateHypothesisRequest {
  krId: string
  parentId?: string | null
  statement: string
  mechanism: string
  expectedImpact: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
}

export interface UpdateHypothesisRequest {
  statement?: string
  mechanism?: string
  expectedImpact?: string
  expectedImpactValue?: number
  expectedImpactUnit?: string
  status?: Extract<HypothesisStatus, 'BACKLOG' | 'RUNNING' | 'ABANDONED'>
}

export interface CloseHypothesisRequest {
  metricType: MetricType
  metricName: string
  baseline: number
  actual: number
  unit?: string
  conclusion: ResultConclusion
  humanNote?: string
}

export interface CloseHypothesisResponse {
  hypothesis: HypothesisDetail
  result: HypothesisResult
  aiLearning: LearningBrief | null
  copilotStatus: 'success' | 'failed' | 'skipped'
  copilotError?: string
}

export interface ListHypothesisQuery extends PaginationQuery {
  krId?: string
  status?: HypothesisStatus | HypothesisStatus[]
  ownerId?: string
  mine?: boolean
}

export type ListHypothesisResponse = PaginationResponse<HypothesisBrief>

// 由下方的 learning contract 引入
import type { LearningBrief } from './api-learning'
```

#### 新建 `contracts/api-learning.ts`

```typescript
import type { UserBrief, PaginationQuery, PaginationResponse } from './common'

export type LearningSource = 'HUMAN' | 'AI_GENERATED'

export interface LearningBrief {
  id: string
  source: LearningSource
  hypothesisId: string | null
  title: string
  content: string  // Markdown 允许
  linkedPromptId: string | null
  createdBy: UserBrief
  createdAt: number
  updatedAt: number
}

export interface CreateLearningRequest {
  title: string
  content: string
  hypothesisId?: string | null
  linkedPromptId?: string | null
  markdownContent?: string | null
  markdownFileName?: string | null
  problemDescription?: string | null
}

export interface ListLearningQuery extends PaginationQuery {
  source?: LearningSource
  hypothesisId?: string
  createdById?: string
  search?: string
}

export type ListLearningResponse = PaginationResponse<LearningBrief>
```

#### 新建 `contracts/api-copilot.ts`

```typescript
export type CopilotAlertType =
  | 'stagnant_kr'
  | 'behind_schedule'
  | 'dead_direction'
  | 'winning_streak'

export type CopilotAlertSeverity = 'info' | 'warning' | 'critical'

export type CopilotConfidence = 'high' | 'medium' | 'low'

export interface CopilotLearning {
  hypothesisId: string
  text: string          // Markdown 允许
  squadId: string | null
}

export interface CopilotPattern {
  title: string         // 纯文本，≤20 字
  description: string   // Markdown 允许
  evidenceHypothesisIds: string[]
  recommendation: string  // 纯文本
  confidence: CopilotConfidence
  relatedSquadIds: string[]
}

export interface CopilotNextHypothesisSuggestion {
  krId: string
  statement: string     // 纯文本
  mechanism: string
  expectedImpact: string
  expectedImpactValue: number | null
  expectedImpactUnit: string | null
  targetSquadId: string | null
}

export interface CopilotAlert {
  type: CopilotAlertType
  krId?: string
  krName?: string
  message: string       // 纯文本
  severity: CopilotAlertSeverity
  evidenceHypothesisIds?: string[]
  squadId: string | null
}

export interface CopilotPayload {
  learnings: CopilotLearning[]
  patterns: CopilotPattern[]
  nextHypothesisSuggestions: CopilotNextHypothesisSuggestion[]
  alerts: CopilotAlert[]
}

export interface CopilotDigest {
  id: string
  scope: 'global' | `project:${string}`
  triggerType: 'scheduled_daily' | 'hypothesis_close' | 'manual'
  payload: CopilotPayload
  createdAt: number
}
```

#### 修改 `contracts/api-dashboard.ts`（新增 Learning Dashboard）

```typescript
// 追加到现有 api-dashboard.ts

import type { CopilotDigest } from './api-copilot'
import type { HypothesisBrief } from './api-hypothesis'

export interface ActiveKRSummary {
  id: string
  name: string
  targetValue: number
  currentValue: number
  baseline: number
  unit: string
  progressPercent: number
  progressStatus: 'on_track' | 'behind' | 'critical'
  contributionCount: number
  lastHypothesisAt: number | null
  isStagnant: boolean
}

export interface LearningDashboardResponse {
  activeKRs: ActiveKRSummary[]
  thisWeekHypotheses: {
    running: HypothesisBrief[]
    closedWins: HypothesisBrief[]
    closedLosses: HypothesisBrief[]
    backlog: HypothesisBrief[]
  }
  latestCopilotDigest: CopilotDigest | null
  summary: {
    totalHypothesesThisWeek: number
    winRate: number
    learningVelocity: number
  }
}
```

#### 修改 `contracts/api-feedback.ts`（兼容 deprecation）

```typescript
// 顶部加注释
/**
 * @deprecated 使用 api-learning.ts 替代。
 * 原 experience/feedback 模块已合并到 learning，source=HUMAN。
 * 本文件保留一个月作为兼容层，2026-05-12 后移除。
 */
```

#### 修改 `contracts/api-okr.ts`

```typescript
// 在 KeyResult 类型上加反向关联字段
export interface KeyResultDetail extends KeyResult {
  hypotheses: HypothesisBrief[]  // 新增
  contributionCount: number      // 新增
}
```

### F. 按 Agent 分工的文件变更清单

按 AIPM 项目规则，每个 agent 只能改自己范围的文件。本 PRD 的实施涉及：

| Agent | 负责文件 | 变更类型 |
|---|---|---|
| **infra-agent** | `contracts/api-hypothesis.ts` / `api-learning.ts` / `api-copilot.ts` / `api-dashboard.ts` / `api-okr.ts` | 新建 + 修改 |
| **infra-agent** | `packages/server/prisma/schema.prisma` | 加表 + rename experiences → learnings |
| **infra-agent** | `packages/server/prisma/migrations/*` | 迁移脚本 |
| **backend-hypothesis** | `packages/server/src/routes/hypotheses/*` | 新建 |
| **backend-hypothesis** | `packages/server/src/services/hypothesis/*` | 新建 |
| **backend-learning** | `packages/server/src/routes/learnings/*` | 新建 |
| **backend-learning** | `packages/server/src/services/learning/*` | 新建（原 experience service 搬迁）|
| **backend-learning** | `packages/server/src/routes/experience/*` | 改为兼容层 302 redirect |
| **backend-copilot** | `packages/server/src/services/copilot/*` | 新建 |
| **backend-copilot** | `packages/server/src/services/ai/*` | 新建共享底层 |
| **backend-copilot** | `packages/server/src/services/sop-split/*` | 重构搬迁 |
| **backend-copilot** | `packages/server/src/jobs/copilot-daily-digest.ts` | 新建 cron job |
| **backend-dashboard** | `packages/server/src/routes/dashboard/learning.ts` | 新建 |
| **frontend-dashboard** | `packages/web/src/views/dashboard/*` | 重构首页 |
| **frontend-dashboard** | `packages/web/src/router/index.ts` | 删除 /dashboard/my-tasks，新增 /hypotheses |
| **frontend-hypothesis** | `packages/web/src/views/hypotheses/*` | 新建 |
| **frontend-hypothesis** | `packages/web/src/stores/hypothesis.ts` | 新建 |
| **frontend-hypothesis** | `packages/web/src/api/hypothesis.ts` | 新建 |
| **frontend-learning** | `packages/web/src/views/learnings/*` | rename experience |
| **frontend-learning** | `packages/web/src/views/experience/*` | 删除 + redirect |
| **frontend-copilot** | `packages/web/src/components/CopilotPanel.vue` | 新建 |
| **frontend-copilot** | `packages/web/src/components/MarkdownRenderer.vue` | 新建（marked + DOMPurify）|

**每个 agent 结束后必须通过 `npx tsc --noEmit` 类型检查**（CLAUDE.md 硬性要求）。

---

## 17. Approval

| 角色 | 姓名 | 状态 | 日期 |
|---|---|---|---|
| Product Owner | Byron | ✅ Approved v2.0 (D29 scope 扩张) | 2026-04-12 |
| Engineering Review | plan-eng-review (Opus 4.6) | ✅ DONE_WITH_CONCERNS (3 critical gaps) | 2026-04-12 |
| Engineering Lead | TBD | ⏳ Pending | |
| Design Lead | TBD — 强烈建议跑 `/plan-design-review`（scope 扩张后 UI 面积翻倍） | ⏳ Pending | |

---

## 18. Week 1 Day 1 Kickoff Checklist (Scope 扩张后)

所有架构决策已锁。Scope 扩张后 **Day 1 负担比原 PRD 大**，需要多做 i18n + responsive 框架初始化。

### Step 1. 依赖与环境（1 小时）

```bash
cd /Users/byron/Documents/claude/aipm

# 后端依赖
pnpm --filter @aipm/server add zod ioredis bullmq

# 前端依赖（scope 扩张后新增）
pnpm --filter @aipm/web add zod vue-i18n@^9 @antv/g6@^5
# Tailwind 如未装则装：
pnpm --filter @aipm/web add -D tailwindcss postcss autoprefixer

# 启动 Redis
brew install redis && brew services start redis

# 连通性验证
npx tsx -e "import('ioredis').then(({default: R}) => new R().ping().then(r => console.log('Redis:', r)))"
# 期望输出：Redis: PONG
```

### Step 2. Contracts（infra-agent，~2 小时）

按本 PRD §5 + §6 扩展后的 schema 写入：

- [ ] `contracts/api-hypothesis.ts`（~600 行，含 Template + Variant + ICE/RICE + Tree 类型）
- [ ] `contracts/api-hypothesis-template.ts`（~150 行）
- [ ] `contracts/api-learning.ts`（~150 行）
- [ ] `contracts/api-copilot.ts`（~200 行）
- [ ] 修改 `contracts/api-dashboard.ts` 加 `LearningDashboardResponse` / `ActiveKRSummary` (含 KR 时间维度字段) / `CrossProjectDashboardResponse`
- [ ] 修改 `contracts/api-okr.ts` 加 `hypotheses` 反向关联 + `startDate / endDate` on KeyResult
- [ ] 在 `contracts/api-feedback.ts` 顶部加 `@deprecated` 注释
- [ ] 更新 `contracts/index.ts` export 新文件

### Step 3. Prisma Schema 改动（infra-agent，~2.5 小时）

按 §5.1 扩展后的 schema 写入：

- [ ] 新增 enum：`HypothesisStatus` / `ResultConclusion` / `LearningSource` / `VariantStatus`
- [ ] 新 model：`Hypothesis`（含 ICE/RICE 字段 + templateId + variants relation）
- [ ] 新 model：`HypothesisResult`
- [ ] 新 model：`HypothesisTemplate`（G6）
- [ ] 新 model：`HypothesisVariant`（G7）
- [ ] 新 model：`CopilotDigest`
- [ ] 新 model：`Learning`（新建，expand-contract）
- [ ] 修改 `Iteration` 加 `hypothesisId`
- [ ] 修改 `KeyResult` 加 `startDate` / `endDate` + `hypotheses` 反向

### Step 4. Migration（infra-agent，~1.5 小时）

```bash
cd packages/server
npx prisma migrate dev --create-only --name add_learning_copilot_full

# 手改 migration.sql 加：
#   1. CHECK 约束 closed_at_matches_status（D24）
#   2. CHECK 约束 metric_type_whitelist（D25）
#   3. ICE/RICE score 自动计算 generated column
#   4. INSERT INTO learnings FROM experiences（复制不删）
#   5. key_results 加 start_date (default created_at) / end_date
#   6. 预置 5 个系统默认 hypothesis_templates
#   7. 完整索引

npx prisma migrate dev
npx prisma generate
```

### Step 5. **i18n 框架初始化**（frontend-agent，~1.5 小时，Scope 扩张新增）

```bash
# vue-i18n setup
# 1. 创建 src/i18n/index.ts
# 2. 创建 src/i18n/locales/zh.json 和 en.json
# 3. main.ts 注入 i18n 实例
# 4. 测试 $t('hello') 在一个页面上工作
# 5. 加 ESLint rule vue-i18n/no-raw-text

# 成功标志：一个 demo 页面可以切换中英双语
```

### Step 6. **响应式 breakpoints 初始化**（frontend-agent，~1 小时，Scope 扩张新增）

```bash
# 如未装 Tailwind 则 init:
npx tailwindcss init -p
# tailwind.config.js 设定 breakpoints:
#   sm: 375px  (mobile)
#   md: 768px  (tablet)
#   lg: 1280px (desktop)

# 创建 src/styles/breakpoints.scss + responsive mixin
# 测试一个容器在不同视口的表现
```

### Step 7. **Statistics 库**（backend-hypothesis，~2 小时，Scope 扩张新增）

创建 `packages/server/src/services/hypothesis/stats.ts`：

- [ ] `zTestTwoProportion(control, treatment)` 函数
- [ ] `welchTTest(control, treatment)` 函数
- [ ] `normalCDF(z)` 函数（Abramowitz-Stegun 近似）
- [ ] 单测 20+ cases 与 Python scipy.stats 参考值对比，误差 < 1e-4

```bash
cd packages/server
npx vitest run src/services/hypothesis/stats.test.ts
# 期望：20+ 测试全过
```

### Step 8. TypeScript 全绿 + BullMQ Smoke Test

```bash
# TS check
cd packages/server && npx tsc --noEmit
cd /Users/byron/Documents/claude/aipm && npx tsc --noEmit

# BullMQ smoke
cd packages/server
npx tsx -e "
import { Queue, Worker } from 'bullmq';
const q = new Queue('test', { connection: { host: 'localhost', port: 6379 } });
const w = new Worker('test', async (job) => console.log('Processing:', job.data), { connection: { host: 'localhost', port: 6379 } });
q.add('hello', { msg: 'world' }).then(() => console.log('Enqueued'));
setTimeout(() => { w.close(); q.close(); process.exit(0); }, 2000);
"
```

### Step 9. Commit 基线

```bash
git add contracts/ packages/server/prisma/ packages/server/src/services/hypothesis/stats.ts \
        packages/server/package.json packages/web/package.json pnpm-lock.yaml \
        packages/web/src/i18n/ packages/web/tailwind.config.js \
        packages/server/src/services/hypothesis/
git commit -m "feat(learning-copilot): day 1 foundations — schema, contracts, stats, i18n, responsive"
```

**Day 1 成功标志**（所有 9 步必须通过）：
- ✅ Redis + BullMQ 本地跑通
- ✅ 新 Prisma schema 在 dev DB 生效（含 Template/Variant/ICE/RICE/KR 时间字段）
- ✅ 4 个新 contract 文件 + 2 个修改完整
- ✅ **vue-i18n 框架就绪，一个 demo 页面双语可切**
- ✅ **Tailwind breakpoints 配好，一个 demo 容器三视口响应式**
- ✅ **stats.ts 单测 20+ cases 全过**
- ✅ `npx tsc --noEmit` 两侧全绿
- ✅ 零业务逻辑改动

**Day 1 预计 10-12 小时**（比原 PRD 多 5-6 小时，因 Scope 扩张）。

**任意一步 FAIL 都不能进 Day 2**。特别注意 i18n 和 responsive：如果 Day 1 不建好框架，Week 5 要把前面的 UI 全部 refactor 一遍。

### Day 2-35 Track 并行视图

参考 §10 Milestones 的 7 周详细计划。核心依赖链：

```
Week 1 [Infra]          → schema / stats / i18n / responsive 框架
   ↓
Week 2 [Backend 主线]   → hypothesis + template + variant services
   ↓
Week 3 [Backend Copilot + 前端基础] → BullMQ worker + Dashboard 重构
   ↓
Week 4 [前端扩展]       → 模板 UI + Variants UI + 树形图 + 跨项目看板
   ↓
Week 5 [Polish 上半]    → 响应式细化 + i18n 翻译 + 设计 review
   ↓
Week 6 [Polish 下半]    → 测试补齐 + Copilot 质量 + 故障演练
   ↓
Week 7 [灰度 + 上线]    → dogfood + migration contract + 生产
```

---

## 19. Eng Review Summary（2026-04-12）

本次 engineering review 由 plan-eng-review skill 执行，13 个决策已定，3 个 critical gaps 已识别。

### 决策统计
- **Scope**: 质量优先（A），25 文件范围
- **Architecture**: 12 个 issues → 全部 resolved（D17-D28）
- **Code Quality**: 3 个 stated fixes
- **Performance**: 3 个 stated fixes
- **Test Coverage**: 80+ paths 识别，100% 新代码需覆盖
- **Lake Score**: 12/12 recommendations 选择 complete option

### 交付物
- ✅ PRD 更新（本文档）
- ✅ `/Users/byron/Documents/claude/aipm/TODOS.md`（7 项 deferred items）
- ✅ `~/.gstack/projects/aipm/byron-main-eng-review-test-plan-20260412-002726.md`（Test Plan artifact）
- ✅ Eureka moment 记录：low-volume async AI 用 in-process background 胜过 BullMQ（虽然最终仍选 BullMQ 因为用户要工业级）

### Critical Gaps（Week 1 Must Fix）
1. **CG1** Redis 宕机 close service fallback
2. **CG2** Expand-Contract dual-write 事务性
3. **CG3** BullMQ retry 条件性（non-retryable 立即 DLQ）

### Should Fix（Week 2-3）
- SF1 Daily digest pm2 重启补偿
- SF2 孤儿 hypothesisId 每日告警

---

**PRD End**

> 下一步：infra-agent 按 §18 Kickoff Checklist 立即开工 Week 1 Day 1

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | **DONE_WITH_CONCERNS** | 12 issues resolved · 3 critical gaps · 80 test paths identified · Lake Score 12/12 |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**UNRESOLVED:** 0 decisions（全部 12 issues 已决策）

**CRITICAL GAPS (Must Fix Week 1)**:
- CG1: Redis 宕机 close service fallback
- CG2: Expand-Contract dual-write 事务性
- CG3: BullMQ retry 条件性

**VERDICT:** ENG REVIEW CLEARED with 3 critical gaps tracked in §14 of this PRD. 可以开工 Week 1 Day 1。建议后续按需添加 `/plan-design-review` for Learning Dashboard UI，但非强制。
