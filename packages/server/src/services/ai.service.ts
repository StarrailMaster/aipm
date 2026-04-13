import OpenAI from 'openai'
import { getAiApiKey, getAiModel, getAiBaseUrl, getAiOrganization } from './settings.service'
import { createClient, callWithFallback } from './ai-config.service'
import prisma from '../prisma/client'

async function getClient(): Promise<OpenAI> {
  const apiKey = await getAiApiKey()
  if (!apiKey) {
    throw new Error('AI API Key 未配置，请在设置 → AI 配置中填写')
  }
  const baseUrl = await getAiBaseUrl()
  const organization = await getAiOrganization()
  return createClient({ apiKey, baseUrl, organization })
}

async function getModelName(): Promise<string> {
  return getAiModel()
}

async function getTemperature(): Promise<number> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'ai_temperature' } })
  return parseFloat(row?.value ?? '0.7')
}

// Convert OpenAI SDK errors into user-friendly messages
function formatAiError(err: unknown, model: string): string {
  const e = err as { status?: number; message?: string; code?: string }
  const status = e?.status
  const msg = e?.message ?? '未知错误'

  if (status === 401) {
    return `AI API Key 无效（401）。请检查「设置 → AI 配置」中的 Key 是否正确、是否过期。原始信息：${msg}`
  }
  if (status === 404 || (msg && msg.includes('model'))) {
    return `AI 模型「${model}」不存在或不可用。请在「设置 → AI 配置」修改为有效的模型名（如 gpt-4o、gpt-4-turbo）。原始信息：${msg}`
  }
  if (status === 429) {
    return `AI API 限流（429）。请稍后重试或检查账户额度。`
  }
  if (status === 400) {
    return `AI 请求参数错误：${msg}`
  }
  return `AI 调用失败（${status ?? '?'}）：${msg}`
}

// ========== AI 总结：分析反馈，生成结构化摘要 ==========

interface AiSummaryResult {
  problemCategory: string
  problemSummary: string
  suggestedConstraint: string
  relatedPromptKeywords: string[]
}

export async function generateAiSummary(rawDescription: string): Promise<AiSummaryResult> {
  const client = await getClient()
  const model = await getModelName()
  const temperature = await getTemperature()

  const systemPrompt = `你是一个项目管理平台的 AI 助手，负责分析用户提交的反馈/问题。
请对以下反馈进行结构化分析，返回 JSON 格式：

{
  "problemCategory": "分类（只能是以下之一：UI/交互、性能、缺陷修复、代码质量、安全、提示词优化、通用改进）",
  "problemSummary": "问题摘要（一句话总结核心问题，不超过100字）",
  "suggestedConstraint": "建议约束条件（针对此类问题，建议在提示词中添加的约束规则，具体可执行）",
  "relatedPromptKeywords": ["关键词1", "关键词2"]（用于匹配相关提示词的关键词，2-4个）
}

只返回 JSON，不要任何其他文字。`

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: rawDescription },
    ],
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content)

  return {
    problemCategory: String(parsed.problemCategory ?? '通用改进'),
    problemSummary: String(parsed.problemSummary ?? rawDescription.slice(0, 100)),
    suggestedConstraint: String(parsed.suggestedConstraint ?? ''),
    relatedPromptKeywords: Array.isArray(parsed.relatedPromptKeywords)
      ? parsed.relatedPromptKeywords.map(String)
      : [],
  }
}

// ========== 投喂包生成：从白板内容自动生成结构化投喂包 ==========

interface FeedGenerationResult {
  content: string
}

export async function generateFeedPackageFromContent(
  taskName: string,
  targetPhase: string,
  rawContent: string,
): Promise<FeedGenerationResult> {
  const apiKey = await getAiApiKey()
  if (!apiKey) throw new Error('AI API Key 未配置')
  const baseUrl = await getAiBaseUrl()
  const organization = await getAiOrganization()
  const defaultModel = await getModelName()
  const temperature = await getTemperature()

  const MAX_CHUNK_SIZE = 80000

  const systemPrompt = `你是一个 AI 项目管理专家，负责将白板工作台的原始材料组装成可直接投喂给 AI 编码助手（Claude / Codex）的结构化投喂包。

任务名称：${taskName}
当前推进阶段：${targetPhase}

你的目标：
1. 阅读原始材料（包含提示词、SOP 规范、补充上下文）
2. 整理成清晰的、可执行的投喂包格式
3. 投喂包结构：
   - ## 任务目标（简明的一段话说明要做什么）
   - ## 执行指令（从提示词中提取的核心 AI 指令）
   - ## 技术规范（从 SOP 中提取的必须遵守的约束）
   - ## 参考上下文（补充信息、文件结构、注意事项）
4. 每个章节的内容必须具体、可操作、不遗漏原始材料中的关键信息
5. 用 Markdown 格式输出，直接可粘贴到 AI 工具中使用

只输出投喂包内容，不要加任何额外说明。`

  // 单轮
  if (rawContent.length <= MAX_CHUNK_SIZE) {
    const result = await callWithFallback({
      apiKey,
      baseUrl,
      organization,
      defaultModel,
      systemPrompt,
      messages: [{ role: 'user', content: rawContent }],
      temperature,
    })
    return { content: result.content }
  }

  // 多轮：按 --- 切片
  const chunks: string[] = []
  let remaining = rawContent
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining)
      break
    }
    const cutPoint = remaining.lastIndexOf('\n---\n', MAX_CHUNK_SIZE)
    const splitAt = cutPoint > MAX_CHUNK_SIZE / 2 ? cutPoint : MAX_CHUNK_SIZE
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt)
  }

  const partialResults: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1
    const chunkPrompt = isLast
      ? `这是最后一部分原始材料（第 ${i + 1}/${chunks.length} 部分）。请基于所有材料生成最终的完整投喂包。\n\n${chunks[i]}`
      : `这是第 ${i + 1}/${chunks.length} 部分原始材料，请提取关键信息并摘要。后续还有更多材料。\n\n${chunks[i]}`

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const prev of partialResults) {
      messages.push({ role: 'assistant', content: prev })
    }
    messages.push({ role: 'user', content: chunkPrompt })

    const result = await callWithFallback({
      apiKey,
      baseUrl,
      organization,
      defaultModel,
      systemPrompt,
      messages,
      temperature,
    })
    partialResults.push(result.content)
  }

  return { content: partialResults[partialResults.length - 1] }
}

// ========== 仓库 Agent：质量审核 + 去重 + 分类 ==========

interface WarehouseAiResult {
  qualityCheck: 'pass' | 'fail'
  qualityNote: string
  isDuplicateLikely: boolean
  duplicateReason: string | null
  suggestedTags: string[]
  targetSection: string | null
}

export async function warehouseReview(
  rawDescription: string,
  aiSummary: { problemCategory: string; problemSummary: string; suggestedConstraint: string },
  existingFeedbacks: { id: string; description: string }[],
): Promise<WarehouseAiResult> {
  const client = await getClient()
  const model = await getModelName()
  const temperature = await getTemperature()

  const existingList = existingFeedbacks.length > 0
    ? existingFeedbacks.map((f, i) => `${i + 1}. [${f.id.slice(0, 8)}] ${f.description.slice(0, 80)}`).join('\n')
    : '（暂无历史反馈）'

  const systemPrompt = `你是项目管理平台的仓库管理 Agent，负责对经过 AI 总结的反馈进行质量审核。

你需要完成以下任务：
1. 质量审核：判断反馈描述是否清晰、完整、有可操作性。不合格的情况：描述过于模糊、缺少具体场景、无法据此采取行动。
2. 去重检测：对比已有反馈列表，判断是否重复。
3. 标签建议：根据内容生成 2-5 个分类标签。
4. 目标章节：建议这个约束条件应该放在提示词的哪个章节。

已有反馈列表：
${existingList}

请返回 JSON：
{
  "qualityCheck": "pass" 或 "fail",
  "qualityNote": "审核说明（通过理由/不通过原因）",
  "isDuplicateLikely": true/false,
  "duplicateReason": "与哪条类似，为什么（如果不重复则为null）",
  "suggestedTags": ["标签1", "标签2"],
  "targetSection": "建议放置的提示词章节名称"
}

只返回 JSON。`

  const userContent = `反馈原文：${rawDescription}

AI 总结：
- 分类：${aiSummary.problemCategory}
- 摘要：${aiSummary.problemSummary}
- 建议约束：${aiSummary.suggestedConstraint}`

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(content)

  return {
    qualityCheck: parsed.qualityCheck === 'fail' ? 'fail' : 'pass',
    qualityNote: String(parsed.qualityNote ?? ''),
    isDuplicateLikely: Boolean(parsed.isDuplicateLikely),
    duplicateReason: parsed.duplicateReason ? String(parsed.duplicateReason) : null,
    suggestedTags: Array.isArray(parsed.suggestedTags)
      ? parsed.suggestedTags.map(String).slice(0, 6)
      : [],
    targetSection: parsed.targetSection ? String(parsed.targetSection) : null,
  }
}

// ========== SOP 拆解 Agent：文件分组 Agent（不是内容生成 Agent） ==========
//
// ✨ 核心架构（Byron 确认版）
// ---
// 用户的 SOP 文件是**固定资产**，Agent 的唯一工作是：
//   "这 N 份 SOP 文档分别应该放到哪几轮、每轮用哪几份"
//
// Agent 只做**文件分配**，不重写/不生成 md 文档内容。
// 每一轮 = 一个文件夹，里面放的就是用户原始 SOP 文件（按 Agent 的分组结果复制进来）
// 再加一个 `00-Prompt（复制这段给 AI）.md` 入口文件（由后端按模板本地生成，基于 Agent 返回的
// instructions + notes + 文件清单）。
//
// 为什么？Byron 原话：
//   "我的 sop 文件是固定的，你需要做的是先读取文件知道这个文件是干什么用的，
//    你只是把我的文件重新放到每一轮的文件夹中，因为我的投喂包，并没有改变 md 文档的内容，
//    只是每一轮用哪个 md 文件投喂"
//   "因为第一轮可能是每个文件夹找一个文件，非常不好操作"
//
// 所以 Agent 省的是 Byron 手动从 7 个 SOP 分类文件夹里挑文件的体力活。
//
// === 输入 ===
// documents: [{ id, title, layer, excerpt (first ~500 chars), fullLength }]
// ↑ 只传 metadata，不传全文。33 份 SOP × 500 ≈ 16.5k chars，Agent 能轻松处理
//
// === 输出 ===
// { reasoning, rounds: [{ title, phase, tool, instructions, notes, documentIds, ... }] }
//
// === 性能 ===
// 只有 1 次 AI 调用，典型 5-15s（比旧架构 60-120s 快一个数量级）
// =========================================================================

export interface SopDocumentInput {
  id: string
  title: string
  /** SopLayer enum value: PRODUCT_REQ | CONTENT | DESIGN_SYSTEM | ... */
  layer: string
  /** 首 N 个字符摘要，让 Agent 理解这份文件讲什么 */
  excerpt: string
  /** 原文总字符数，帮 Agent 判断文件大小 */
  fullLength: number
}

export interface AssignedRound {
  roundNumber: number
  title: string
  phase: 'DESIGN' | 'IMPLEMENT'
  /** 建议使用的工具，比如 "Figma Make" / "Codex / Cursor" / "Claude Code" */
  tool: string
  /** 本轮核心任务（一句话） */
  focus: string
  /** 本轮具体产出 */
  deliverable: string
  /** 复制给 AI 的 prompt 正文（1 段或多段） */
  instructions: string
  /** 注意事项列表（会变成 Markdown bullet） */
  notes: string[]
  /** 本轮分配到的 SOP 文档 ID 列表（从输入 documents 的 id 里选） */
  documentIds: string[]
  /** 依赖的前置轮次编号（1-based） */
  dependsOnRounds: number[]
}

export interface SopSplitResult {
  /** Agent 的分组思路说明 */
  reasoning: string
  /** 所有轮次（已按 roundNumber 排序） */
  rounds: AssignedRound[]
  /** 所有文档都被分配了吗？如果有未分配的，列出 ID 给上层决定怎么处理 */
  unassignedDocumentIds: string[]
}

const SOP_LAYER_LABELS: Record<string, string> = {
  PRODUCT_REQ: '产品需求',
  CONTENT: '内容/文案',
  DESIGN_SYSTEM: '设计系统',
  FRONTEND_ARCH: '前端架构',
  BACKEND_ARCH: '后端架构',
  AI_PROMPTS: 'AI 提示词',
  ACCEPTANCE: '验收标准',
  APPENDIX: '附录',
}

/**
 * SOP 拆解 Agent：单次 AI 调用，把 N 份固定的 SOP 文件分配到 M 轮投喂包
 *
 * Agent 看到的是 metadata（title + layer + 前 500 字），基于这些信息决定分组。
 * Agent 不返回 md 内容，只返回"这一轮用哪几份文件 + 配套的 prompt / notes"。
 *
 * 注意：本函数**不接收** iteration.status / currentPhase 等任务阶段信息。
 * Agent 应一次性产出从设计到实施到验收的完整推进计划，不要让"当前在哪一步"
 * 影响分组决策（Fix C — 取消阶段偏见）。
 */
export async function runSopSplitAgent(
  taskName: string,
  documents: SopDocumentInput[],
): Promise<SopSplitResult> {
  if (documents.length === 0) {
    throw new Error('白板上没有可供拆解的 SOP 文档')
  }

  const apiKey = await getAiApiKey()
  if (!apiKey) throw new Error('AI API Key 未配置')
  const baseUrl = await getAiBaseUrl()
  const organization = await getAiOrganization()
  const defaultModel = await getModelName()
  // Fix D: 分组任务必须稳定可复现，温度硬编码为 0，忽略 systemConfig 里的配置

  const totalExcerptChars = documents.reduce((n, d) => n + d.excerpt.length, 0)
  console.log(
    `[SOP-Agent] 任务 "${taskName}" | ${documents.length} 份文档 | 摘要合计 ${totalExcerptChars} 字符`,
  )

  // === 构造 documents 清单（给 Agent 看的） ===
  const docsSection = documents
    .map((d, i) => {
      const layerLabel = SOP_LAYER_LABELS[d.layer] ?? d.layer
      return `### 文档 ${i + 1} [ID: ${d.id}]
- 标题: ${d.title}
- 层级: ${layerLabel} (${d.layer})
- 原文长度: ${d.fullLength} 字符
- 内容摘要（前 ${d.excerpt.length} 字符）:
\`\`\`
${d.excerpt}
\`\`\``
    })
    .join('\n\n')

  const systemPrompt = `你是 AI-Native 项目管理平台的 **SOP 文件分组 Agent**。

用户有一个固定的 SOP 文档库（PRD、设计系统、文案、技术架构、验收标准等），每份文档都是**不可修改的固定资产**。
你的唯一工作是：把这些文档**分配到多轮可独立执行的 AI 交互中**。每一轮 = 一次用户复制粘贴给 AI 的完整会话。

⚠️ 关键：你**不需要也不应该**生成或修改任何 SOP 文档内容。你只是在决定"第 N 轮用哪几份文件"。

## ⚠️ 铁律（违反任何一条都属于错误输出）

1. **完整覆盖（最重要）**：输入的每一份 SOP 文档都**必须**至少出现在一轮的 documentIds 里。宁可让同一份文档同时出现在多轮中，也**绝不允许**任何一份被遗漏。
2. **不要筛选**：不要以"这份文档和任务关系不大"为理由跳过任何文档。用户在白板上选过的每一份都已经是有意选择的，你的工作是**分组**而不是**筛选**。
3. **强制生成 IMPLEMENT 轮次**：只要输入中存在以下任一条件的文档，就**必须**生成至少一个 phase=IMPLEMENT 的轮次并把相关文档放进去：
   - layer = FRONTEND_ARCH（前端架构）
   - layer = BACKEND_ARCH（后端架构）
   - layer = AI_PROMPTS 且标题或摘要包含"开发/实施/build/implement/前后端/联调/接口/api"等实施关键词
4. **多页面 → 多轮**：如果输入中 layer=PRODUCT_REQ 的文档超过一份（通常代表多个独立页面），**为每一份 PRD 单独生成至少一轮 DESIGN + 一轮 IMPLEMENT**。不允许把多个页面塞进同一轮。
5. **documentIds 只能来自输入**：每个 ID 必须精确匹配输入文档清单里的 id 字段，不允许任何形式的编造、改写、截短或拼接。
6. **不要推测任务阶段**：不要假设"现在只是设计阶段所以只做设计"。你的任务是一次性产出从设计 → 实施 → 验收的**完整**推进计划，用户会按顺序一轮一轮执行。

## 分组原则

1. **每一轮独立可执行** — 用户在一次 AI 会话中完成这一轮所需的所有事
2. **设计先行、开发在后**：
   - DESIGN = 设计阶段，工具用 "Figma Make" 或 "Figma"
   - IMPLEMENT = 开发阶段，工具用 "Codex / Cursor" 或 "Claude Code"
3. **文件搭配合理** — 每一轮应该包含这一轮真正需要的所有文档：
   - 设计轮次通常需要：对应页面的 PRD + 文案 + 设计系统（Token/排版/组件/动画 相关的）
   - 开发轮次通常需要：对应页面的 PRD + 文案 + 技术架构 + 禁止清单 + 路由结构 等
4. **一份文档可以被多轮复用** — 比如"设计系统总览.md"可以同时出现在多个设计轮次
5. **粒度适中** — 不要把 20 份文件塞一轮，也不要为 1 份文件单独开一轮。常见每轮 4-8 份
6. **轮数参考**：
   - 简单项目：3-5 轮
   - 中等项目：6-10 轮
   - 复杂项目（整站）：10-15 轮
7. **依赖关系** — 第 N 轮如果需要前面轮次的产出，通过 dependsOnRounds 声明（1-based 轮次编号）

## instructions 字段的写法

这是用户**直接复制给 AI** 的 prompt 正文。要求：
- 2-5 句话，给出明确的任务目标
- 不要重复文件内容（文件会一起上传，AI 自己会读）
- 要点出本轮的特别注意事项、质量标准、产出形式
- 参考范例（设计轮）："你是一位资深 SaaS UIUX 设计师。请根据以下设计系统和产品需求文档设计首页。先设计 Hero 区域让我确认风格，确认后再继续。"
- 参考范例（开发轮）："按照 PRD 和设计系统实现首页所有模块。所有文案使用中英双语，通过 useLang() 读取。严格遵守技术禁止清单。"

## notes 字段的写法

这是"注意事项"清单（会变成 Markdown bullet 点）。每条 1 句话，写清楚这一轮容易踩的坑或必须做的事。
3-6 条即可。不要重复 instructions 已经说过的话。

## 输出格式（严格 JSON，不要 markdown 代码块）

{
  "reasoning": "一段话说明你怎么分组（<200 字）",
  "rounds": [
    {
      "title": "首页设计",
      "phase": "DESIGN",
      "tool": "Figma Make",
      "focus": "设计官网首页 Hero 区域，确认整体风格",
      "deliverable": "首页 Hero 设计稿",
      "instructions": "你是一位资深 SaaS UIUX 设计师。请根据...",
      "notes": ["只做 Hero 区域", "配色遵循品牌色 #7357EB", "..."],
      "documentIds": ["uuid-of-doc-1", "uuid-of-doc-2"],
      "dependsOnRounds": []
    }
  ]
}

**只输出 JSON，不要任何其他文字或代码块。documentIds 中的每个值必须来自输入文档清单中的 ID，不要编造。**`

  const userMessage = `# 任务信息

- 任务名称: ${taskName}
- SOP 文档总数: ${documents.length}（**全部 ${documents.length} 份都必须被分配，一份都不能少**）

# 可用 SOP 文档清单

${docsSection}

---

请基于上述文档清单，把它们分配到合适的轮次。再次提醒：
1. 你是在**分组**文件，不是生成内容，也不是筛选
2. documentIds 里只能用上面清单里真实存在的 ID
3. **输入的 ${documents.length} 份文档必须全部出现在某一轮中**（完整覆盖，铁律第 1 条）
4. 只要输入中有 FRONTEND_ARCH / BACKEND_ARCH / 开发类 AI_PROMPTS，就必须生成 IMPLEMENT 轮次
5. 多个页面的 PRD → 每个页面各一轮设计 + 一轮开发
6. 尊重原始 SOP 结构 — 如果文档标题里已有"第 N 轮"字样或明显的阶段划分，请按那个结构分组
7. 输出严格 JSON`

  const result = await callWithFallback({
    apiKey,
    baseUrl,
    organization,
    defaultModel,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    temperature: 0, // Fix D：分组任务必须稳定，用最低温度
    jsonMode: true,
  })

  let parsed: { reasoning?: string; rounds?: unknown[] }
  try {
    parsed = JSON.parse(result.content)
  } catch {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error(`AI 返回的不是合法 JSON：${result.content.slice(0, 200)}`)
    }
    parsed = JSON.parse(jsonMatch[0])
  }

  if (!Array.isArray(parsed.rounds)) {
    throw new Error('AI 返回缺少 rounds 数组')
  }

  const validDocIds = new Set(documents.map((d) => d.id))
  const rawRoundsRaw = parsed.rounds as Array<Record<string, unknown>>

  // Safety cap：30 轮（非破坏性 slice，不改动原 parsed 对象）
  const rawRounds =
    rawRoundsRaw.length > 30 ? rawRoundsRaw.slice(0, 30) : rawRoundsRaw
  if (rawRoundsRaw.length > 30) {
    console.warn(
      `[SOP-Agent] 轮次数 ${rawRoundsRaw.length} 超过上限 30，已截断（可能意味着输入过大或 Agent 过度拆分）`,
    )
  }

  // 幻觉 ID 收集（Agent 编造的、拼错的、不在输入里的 documentId）
  const hallucinatedIds = new Set<string>()

  const rounds: AssignedRound[] = rawRounds.map((r, idx) => {
    const roundNumber = idx + 1

    // phase：优先读 r.phase，如果缺失 / 不合法，根据 title/tool 关键词兜底推断
    let phase: 'DESIGN' | 'IMPLEMENT'
    const rawPhase = String(r.phase ?? '').toUpperCase()
    if (rawPhase === 'DESIGN' || rawPhase === 'IMPLEMENT') {
      phase = rawPhase
    } else {
      const titleLower = String(r.title ?? '').toLowerCase()
      const toolLower = String(r.tool ?? '').toLowerCase()
      const looksDesign =
        /设计|design|figma|ui|ux|hero|视觉|精修|风格/.test(titleLower) ||
        /figma/.test(toolLower)
      phase = looksDesign ? 'DESIGN' : 'IMPLEMENT'
    }

    // documentIds：校验有效性 + 同轮去重 + 收集幻觉 ID
    const rawDocIds = Array.isArray(r.documentIds) ? (r.documentIds as unknown[]) : []
    const seenInRound = new Set<string>()
    const documentIds: string[] = []
    for (const x of rawDocIds) {
      const id = String(x).trim()
      if (!id) continue
      if (!validDocIds.has(id)) {
        hallucinatedIds.add(id)
        continue
      }
      if (seenInRound.has(id)) continue
      seenInRound.add(id)
      documentIds.push(id)
    }

    const rawNotes = Array.isArray(r.notes) ? (r.notes as unknown[]) : []
    const notes = rawNotes
      .map((n) => String(n).trim())
      .filter((n) => n.length > 0)

    // dependsOnRounds：1-based；只允许指向前面的轮次；去重；过滤非法值
    const rawDeps = Array.isArray(r.dependsOnRounds) ? (r.dependsOnRounds as unknown[]) : []
    const dependsOnRounds = Array.from(
      new Set(
        rawDeps
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0 && n < roundNumber),
      ),
    )

    const rawTitle = String(r.title ?? '').trim()
    const title = rawTitle.length > 0 ? rawTitle : `第 ${roundNumber} 轮`

    return {
      roundNumber,
      title,
      phase,
      tool: String(r.tool ?? (phase === 'DESIGN' ? 'Figma Make' : 'Codex / Cursor')).trim(),
      focus: String(r.focus ?? '').trim(),
      deliverable: String(r.deliverable ?? '').trim(),
      instructions: String(r.instructions ?? '').trim(),
      notes,
      documentIds,
      dependsOnRounds,
    }
  })

  if (rounds.length === 0) {
    throw new Error('Agent 未能规划出任何轮次，请检查白板内容')
  }

  if (hallucinatedIds.size > 0) {
    const preview = [...hallucinatedIds].slice(0, 5).join(', ')
    console.warn(
      `[SOP-Agent] Agent 返回 ${hallucinatedIds.size} 个不存在的 documentId（已忽略）：${preview}${hallucinatedIds.size > 5 ? '...' : ''}`,
    )
  }

  // ========== Fix B：兜底补全未分配的文档 ==========
  // Agent 即使加了硬约束，仍可能因各种原因（幻觉 ID / 遗漏 / 过度筛选）漏掉部分文档。
  // 这里按 layer 自动把漏掉的文档补回合适的轮次，保证 100% 覆盖率。
  const assignedSet = new Set<string>()
  for (const r of rounds) {
    for (const id of r.documentIds) assignedSet.add(id)
  }
  const unassignedDocs = documents.filter((d) => !assignedSet.has(d.id))

  if (unassignedDocs.length > 0) {
    console.warn(
      `[SOP-Agent] Agent 遗漏 ${unassignedDocs.length} 份文档，执行兜底补全：` +
        unassignedDocs.map((d) => `${d.layer}/${d.title}`).join(' | '),
    )

    const designRounds = rounds.filter((r) => r.phase === 'DESIGN')
    const implementRounds = rounds.filter((r) => r.phase === 'IMPLEMENT')

    for (const doc of unassignedDocs) {
      let targetRound: AssignedRound | null = null

      switch (doc.layer) {
        case 'PRODUCT_REQ':
        case 'CONTENT':
        case 'DESIGN_SYSTEM':
          // 产品需求 / 文案 / 设计系统 → 第一个设计轮（设计阶段必备）
          targetRound = designRounds[0] ?? rounds[0]
          break

        case 'FRONTEND_ARCH':
        case 'BACKEND_ARCH': {
          // 技术架构 → 最后一个开发轮；若没有开发轮则新建一个
          if (implementRounds.length === 0) {
            const newRound: AssignedRound = {
              roundNumber: rounds.length + 1,
              title: '技术实施',
              phase: 'IMPLEMENT',
              tool: 'Codex / Cursor',
              focus: '根据技术架构文档实施前后端代码',
              deliverable: '可运行的前后端代码',
              instructions:
                '按照附带的 PRD、设计系统与技术架构文档实施前后端代码。严格遵守所有禁止清单和架构约束，产出应能直接运行。',
              notes: [
                '严格遵守技术禁止清单',
                '前后端接口结构必须与 PRD 保持一致',
                '所有文案使用双语并通过 useLang() 读取',
              ],
              documentIds: [],
              dependsOnRounds: designRounds.map((r) => r.roundNumber),
            }
            rounds.push(newRound)
            implementRounds.push(newRound)
            targetRound = newRound
          } else {
            targetRound = implementRounds[implementRounds.length - 1]
          }
          break
        }

        case 'AI_PROMPTS': {
          // 按标题关键词判断归属
          const titleLower = doc.title.toLowerCase()
          const looksDesign = /设计|ui|ux|hero|视觉|figma|风格|精修/.test(titleLower)
          const looksImpl = /开发|实施|build|implement|前后端|联调|后端|前端|接口|api/.test(
            titleLower,
          )
          if (looksDesign) {
            targetRound = designRounds[0] ?? rounds[0]
          } else if (looksImpl) {
            targetRound =
              implementRounds[implementRounds.length - 1] ?? rounds[rounds.length - 1]
          } else {
            targetRound = rounds[rounds.length - 1]
          }
          break
        }

        case 'ACCEPTANCE': {
          // 验收标准 → 已存在的验收轮就追加；否则新建一个专门的验收轮
          const existing = rounds.find((r) => /验收|acceptance/i.test(r.title))
          if (existing) {
            targetRound = existing
          } else {
            const newRound: AssignedRound = {
              roundNumber: rounds.length + 1,
              title: '验收',
              phase: 'IMPLEMENT',
              tool: 'Codex / Cursor',
              focus: '按验收标准检查前面轮次的交付产出',
              deliverable: '验收报告（列出达标 / 未达标项）',
              instructions:
                '按照附带的验收标准文档，逐项检查前面轮次的交付物。对每一项给出"通过 / 未通过"判断，未通过的要说明原因和可执行的修复建议。',
              notes: [
                '逐项对照验收清单',
                '未通过项必须给出可执行的修复建议',
                '保持客观中立，不放低标准',
              ],
              documentIds: [],
              dependsOnRounds: rounds.map((r) => r.roundNumber),
            }
            rounds.push(newRound)
            targetRound = newRound
          }
          break
        }

        case 'APPENDIX': {
          // 附录 → 加到每一轮（同一份可在多轮复用）
          for (const r of rounds) {
            if (!r.documentIds.includes(doc.id)) {
              r.documentIds.push(doc.id)
            }
          }
          assignedSet.add(doc.id)
          continue // 已处理，跳过单目标写入
        }

        default:
          targetRound = rounds[rounds.length - 1]
          break
      }

      if (targetRound && !targetRound.documentIds.includes(doc.id)) {
        targetRound.documentIds.push(doc.id)
      }
      assignedSet.add(doc.id)
    }

    // 如果 push 过新轮次，重新归一 roundNumber
    rounds.forEach((r, i) => {
      r.roundNumber = i + 1
    })
  }

  // 防御性清理：过滤掉经过补全后仍然 0 文档的空壳轮次
  const nonEmptyRounds = rounds.filter((r) => r.documentIds.length > 0)
  if (nonEmptyRounds.length === 0) {
    throw new Error('所有轮次在补全后依然没有任何文档，请检查输入')
  }

  // 如果过滤掉了轮次，需要重映射 dependsOnRounds（老 → 新编号）
  let finalRounds: AssignedRound[]
  if (nonEmptyRounds.length !== rounds.length) {
    const oldToNew = new Map<number, number>()
    nonEmptyRounds.forEach((r, i) => {
      oldToNew.set(r.roundNumber, i + 1)
    })
    nonEmptyRounds.forEach((r, i) => {
      const newNumber = i + 1
      r.dependsOnRounds = r.dependsOnRounds
        .map((n) => oldToNew.get(n))
        .filter((n): n is number => n !== undefined && n > 0 && n < newNumber)
      r.roundNumber = newNumber
    })
    finalRounds = nonEmptyRounds
  } else {
    finalRounds = rounds
  }

  // 最终未分配的 ID（经过兜底后理论上应为空）
  const finalAssignedSet = new Set<string>()
  for (const r of finalRounds) {
    for (const id of r.documentIds) finalAssignedSet.add(id)
  }
  const unassignedDocumentIds = documents
    .filter((d) => !finalAssignedSet.has(d.id))
    .map((d) => d.id)

  console.log(
    `[SOP-Agent] 分组结果：${finalRounds.length} 轮，已分配 ${finalAssignedSet.size}/${documents.length} 份文档` +
      (unassignedDocumentIds.length > 0
        ? `，未分配 ${unassignedDocumentIds.length} 份`
        : '（100% 覆盖）'),
  )
  console.log(
    `[SOP-Agent] 轮次：${finalRounds
      .map((r) => `第${r.roundNumber}轮·${r.title}(${r.documentIds.length}份)`)
      .join(' / ')}`,
  )

  return {
    reasoning: String(parsed.reasoning ?? ''),
    rounds: finalRounds,
    unassignedDocumentIds,
  }
}

/**
 * 根据 Agent 的分配结果 + 对应的原始 SOP 文档，生成入口文件
 * `00-Prompt（复制这段给 AI）.md` 的 markdown 内容。
 *
 * 这是**本地模板渲染**，不调用 AI。跟参考投喂包 1.0 的格式完全一致。
 */
export function buildRoundEntryMarkdown(
  taskName: string,
  round: AssignedRound,
  roundDocuments: Array<{ id: string; title: string; layer: string }>,
): string {
  const lines: string[] = []

  // 标题
  lines.push(`# 第 ${round.roundNumber} 轮 · ${round.title}`)
  lines.push('')

  // Meta 引用块
  lines.push(`> 任务：${taskName}`)
  lines.push(`> 工具：${round.tool}`)
  if (round.focus) lines.push(`> 目标：${round.focus}`)
  if (round.deliverable) lines.push(`> 产出：${round.deliverable}`)
  lines.push('')

  // Prompt 部分
  lines.push('## Prompt（复制下面这段给 AI）')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(round.instructions || '（请在这里补充本轮的 AI 指令）')
  lines.push('')
  lines.push('---')
  lines.push('')

  // 文件清单
  if (roundDocuments.length > 0) {
    lines.push('## 本轮附带文件清单')
    lines.push('')
    lines.push('| 文件 | 层级 | 说明 |')
    lines.push('|------|------|------|')
    for (const doc of roundDocuments) {
      const layerLabel = SOP_LAYER_LABELS[doc.layer] ?? doc.layer
      const fileName = `${doc.title}.md`
      lines.push(`| ${fileName} | ${layerLabel} | ${doc.title} |`)
    }
    lines.push('')
  }

  // 注意事项
  if (round.notes.length > 0) {
    lines.push('## 注意事项')
    lines.push('')
    for (const note of round.notes) {
      lines.push(`- ${note}`)
    }
    lines.push('')
  }

  // 前置依赖
  if (round.dependsOnRounds.length > 0) {
    lines.push('## 前置依赖')
    lines.push('')
    lines.push('执行本轮前，请先完成以下前置轮次：')
    lines.push('')
    for (const depNum of round.dependsOnRounds) {
      lines.push(`- 第 ${depNum} 轮`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}
