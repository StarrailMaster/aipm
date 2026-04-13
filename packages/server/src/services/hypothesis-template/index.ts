/**
 * Hypothesis Template Service — G6 Epic 5
 *
 * CRUD for hypothesis templates + from-template hypothesis creation.
 *
 * 决策（PRD §6.5）：
 *   - 系统默认模板（isSystemDefault=true）不可编辑/删除
 *   - 用户自建模板可由创建人 + ADMIN 编辑/删除
 *   - placeholder 替换：模板的 {{key}} 占位符由前端传 placeholderValues 填充
 */
import type {
  HypothesisTemplate as PrismaHypothesisTemplate,
  User as PrismaUser,
} from '@prisma/client'
import prisma from '../../prisma/client'
import { AppError, ErrorCodes } from '../../utils/errors'
import * as hypothesisService from '../hypothesis'

type PlaceholderDef = {
  key: string
  label: string
  labelEn?: string
  required: boolean
  type?: 'string' | 'number' | 'date'
  defaultValue?: string | number
  enumOptions?: Array<{ value: string; label: string }>
}

function userBrief(user: PrismaUser | null) {
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    legacyRoles: user.legacyRoles,
  }
}

function mapTemplate(
  t: PrismaHypothesisTemplate & { createdBy?: PrismaUser | null },
) {
  return {
    id: t.id,
    name: t.name,
    nameEn: t.nameEn,
    category: t.category,
    description: t.description,
    descriptionEn: t.descriptionEn,
    statementTemplate: t.statementTemplate,
    statementTemplateEn: t.statementTemplateEn,
    mechanismTemplate: t.mechanismTemplate,
    mechanismTemplateEn: t.mechanismTemplateEn,
    suggestedMetricType: t.suggestedMetricType,
    suggestedMetricName: t.suggestedMetricName,
    placeholders: t.placeholders as unknown as PlaceholderDef[],
    isSystemDefault: t.isSystemDefault,
    usageCount: t.usageCount,
    createdBy: userBrief(t.createdBy ?? null),
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  }
}

function mapTemplateBrief(t: PrismaHypothesisTemplate) {
  return {
    id: t.id,
    name: t.name,
    nameEn: t.nameEn,
    category: t.category,
    description: t.description,
    isSystemDefault: t.isSystemDefault,
    usageCount: t.usageCount,
    placeholderCount: Array.isArray(t.placeholders)
      ? (t.placeholders as unknown as PlaceholderDef[]).length
      : 0,
    createdAt: t.createdAt.getTime(),
  }
}

// ============================================================
// CRUD
// ============================================================

type ListQuery = {
  page: number
  pageSize: number
  skip: number
  category?: string
  isSystemDefault?: boolean
  search?: string
  sortBy?: 'usage' | 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
}

export async function listTemplates(query: ListQuery) {
  const where: Record<string, unknown> = { deletedAt: null }
  if (query.category) where.category = query.category
  if (query.isSystemDefault !== undefined) where.isSystemDefault = query.isSystemDefault
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const sortBy = query.sortBy ?? 'usage'
  const order = query.order ?? 'desc'
  const orderBy =
    sortBy === 'usage'
      ? [{ usageCount: order as 'asc' | 'desc' }, { createdAt: 'desc' as const }]
      : [{ [sortBy]: order }]

  const [items, total] = await Promise.all([
    prisma.hypothesisTemplate.findMany({
      where,
      orderBy,
      skip: query.skip,
      take: query.pageSize,
    }),
    prisma.hypothesisTemplate.count({ where }),
  ])

  return {
    items: items.map(mapTemplateBrief),
    total,
  }
}

export async function getTemplate(id: string) {
  const t = await prisma.hypothesisTemplate.findFirst({
    where: { id, deletedAt: null },
    include: { createdBy: true },
  })
  if (!t) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_TEMPLATE_NOT_FOUND,
      '模板不存在',
      404,
    )
  }
  return mapTemplate(t)
}

type CreateInput = {
  name: string
  nameEn?: string
  category: string
  description: string
  descriptionEn?: string
  statementTemplate: string
  statementTemplateEn?: string
  mechanismTemplate: string
  mechanismTemplateEn?: string
  suggestedMetricType?: string
  suggestedMetricName?: string
  placeholders: PlaceholderDef[]
}

export async function createTemplate(data: CreateInput, actorUserId: string) {
  // 校验 placeholder 定义合法
  if (!Array.isArray(data.placeholders)) {
    throw new AppError(
      ErrorCodes.INVALID_FORMAT,
      'placeholders 必须是数组',
    )
  }
  const t = await prisma.hypothesisTemplate.create({
    data: {
      name: data.name,
      nameEn: data.nameEn,
      category: data.category,
      description: data.description,
      descriptionEn: data.descriptionEn,
      statementTemplate: data.statementTemplate,
      statementTemplateEn: data.statementTemplateEn,
      mechanismTemplate: data.mechanismTemplate,
      mechanismTemplateEn: data.mechanismTemplateEn,
      suggestedMetricType: data.suggestedMetricType,
      suggestedMetricName: data.suggestedMetricName,
      placeholders: data.placeholders as unknown as object,
      isSystemDefault: false, // 用户创建永远不是 system default
      createdById: actorUserId,
    },
    include: { createdBy: true },
  })
  return mapTemplate(t)
}

export async function updateTemplate(
  id: string,
  data: Partial<CreateInput>,
  actor: { userId: string; role: string },
) {
  const t = await prisma.hypothesisTemplate.findFirst({
    where: { id, deletedAt: null },
  })
  if (!t) {
    throw new AppError(ErrorCodes.HYPOTHESIS_TEMPLATE_NOT_FOUND, '模板不存在', 404)
  }
  if (t.isSystemDefault && actor.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_TEMPLATE_SYSTEM_LOCKED,
      '系统预置模板不可编辑',
      403,
    )
  }
  if (
    !t.isSystemDefault &&
    t.createdById !== actor.userId &&
    actor.role !== 'ADMIN'
  ) {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只能编辑自己创建的模板',
      403,
    )
  }

  const updated = await prisma.hypothesisTemplate.update({
    where: { id },
    data: {
      name: data.name,
      nameEn: data.nameEn,
      category: data.category,
      description: data.description,
      descriptionEn: data.descriptionEn,
      statementTemplate: data.statementTemplate,
      statementTemplateEn: data.statementTemplateEn,
      mechanismTemplate: data.mechanismTemplate,
      mechanismTemplateEn: data.mechanismTemplateEn,
      suggestedMetricType: data.suggestedMetricType,
      suggestedMetricName: data.suggestedMetricName,
      placeholders: data.placeholders as unknown as object | undefined,
    },
    include: { createdBy: true },
  })
  return mapTemplate(updated)
}

export async function deleteTemplate(
  id: string,
  actor: { userId: string; role: string },
) {
  const t = await prisma.hypothesisTemplate.findFirst({
    where: { id, deletedAt: null },
  })
  if (!t) {
    throw new AppError(ErrorCodes.HYPOTHESIS_TEMPLATE_NOT_FOUND, '模板不存在', 404)
  }
  if (t.isSystemDefault) {
    throw new AppError(
      ErrorCodes.HYPOTHESIS_TEMPLATE_SYSTEM_LOCKED,
      '系统预置模板不可删除',
      403,
    )
  }
  if (t.createdById !== actor.userId && actor.role !== 'ADMIN') {
    throw new AppError(
      ErrorCodes.PERMISSION_DENIED,
      '只能删除自己创建的模板',
      403,
    )
  }
  await prisma.hypothesisTemplate.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

// ============================================================
// Create hypothesis from template
// ============================================================

export async function createHypothesisFromTemplate(
  templateId: string,
  data: {
    krId: string
    parentId?: string | null
    placeholderValues: Record<string, string | number>
  },
  actorUserId: string,
) {
  const t = await prisma.hypothesisTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
  })
  if (!t) {
    throw new AppError(ErrorCodes.HYPOTHESIS_TEMPLATE_NOT_FOUND, '模板不存在', 404)
  }

  // 校验 required placeholder 都有值
  const placeholders = t.placeholders as unknown as PlaceholderDef[]
  for (const p of placeholders) {
    if (
      p.required &&
      (data.placeholderValues[p.key] === undefined ||
        data.placeholderValues[p.key] === null ||
        data.placeholderValues[p.key] === '')
    ) {
      throw new AppError(
        ErrorCodes.HYPOTHESIS_TEMPLATE_MISSING_PLACEHOLDER,
        `模板占位符 "${p.label}" (${p.key}) 必填`,
      )
    }
  }

  // 替换 {{key}} 占位符
  const statement = renderTemplate(t.statementTemplate, data.placeholderValues)
  const mechanism = renderTemplate(t.mechanismTemplate, data.placeholderValues)
  const expectedImpact = t.suggestedMetricName
    ? `改善 ${t.suggestedMetricName}`
    : '待填写'

  return hypothesisService.createHypothesis(
    {
      krId: data.krId,
      parentId: data.parentId ?? null,
      statement,
      mechanism,
      expectedImpact,
      templateId: t.id,
    },
    actorUserId,
  )
}

function renderTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => {
    const v = values[key]
    if (v === undefined || v === null) return `{{${key}}}`
    return String(v)
  })
}

// ============================================================
// Seed system default templates (5 个预置)
// ============================================================

export const SYSTEM_DEFAULT_TEMPLATES: readonly CreateInput[] = [
  {
    name: '首屏转化优化',
    nameEn: 'Landing Page Conversion',
    category: 'activation',
    description: '降低首屏跳出率，通过新元素或文案让用户进入下一步',
    descriptionEn: 'Reduce landing page bounce rate with new elements or copy',
    statementTemplate: '如果在 {{page}} 加 {{element}}，则 {{metric}} 会从 {{baseline}}% 改善到 {{target}}%',
    statementTemplateEn:
      'If we add {{element}} to {{page}}, {{metric}} will improve from {{baseline}}% to {{target}}%',
    mechanismTemplate: '因为用户{{reason}}，这个元素能让他们{{action}}',
    mechanismTemplateEn: 'Because users {{reason}}, this element will help them {{action}}',
    suggestedMetricType: 'conversion_rate',
    suggestedMetricName: '首屏转化率',
    placeholders: [
      { key: 'page', label: '页面', required: true },
      { key: 'element', label: '新增元素', required: true },
      { key: 'metric', label: '衡量指标', required: true, defaultValue: '首屏点击率' },
      { key: 'baseline', label: '当前值(%)', required: true, type: 'number' },
      { key: 'target', label: '目标值(%)', required: true, type: 'number' },
      { key: 'reason', label: '用户行为原因', required: false },
      { key: 'action', label: '期望动作', required: false },
    ],
  },
  {
    name: '新手留存优化',
    nameEn: 'New User Retention',
    category: 'retention',
    description: '通过引导、提醒或价值传递提升首周留存',
    descriptionEn: 'Improve first-week retention via onboarding, reminders, or value delivery',
    statementTemplate: '如果给新用户在 {{day}} 推送 {{notification}}，则首周留存会从 {{baseline}}% 改善 {{delta}}%',
    statementTemplateEn:
      'If we notify new users with {{notification}} on day {{day}}, first-week retention will improve by {{delta}}%',
    mechanismTemplate: '因为新用户在 {{day}} 容易流失，{{notification}} 能提供及时价值',
    mechanismTemplateEn: 'Because new users churn on day {{day}}, {{notification}} provides timely value',
    suggestedMetricType: 'conversion_rate',
    suggestedMetricName: '首周留存率',
    placeholders: [
      { key: 'day', label: '触发日', required: true, type: 'number', defaultValue: 3 },
      { key: 'notification', label: '通知内容', required: true },
      { key: 'baseline', label: '当前留存率(%)', required: true, type: 'number' },
      { key: 'delta', label: '预期提升(%)', required: true, type: 'number' },
    ],
  },
  {
    name: '付费转化优化',
    nameEn: 'Payment Conversion',
    category: 'revenue',
    description: '通过定价、折扣或文案调整提升付费率',
    descriptionEn: 'Improve payment rate via pricing, discount, or copy changes',
    statementTemplate: '如果把 {{product}} 的定价从 {{oldPrice}} 改为 {{newPrice}}，付费转化率会提升 {{delta}}%',
    statementTemplateEn:
      'If we change pricing for {{product}} from {{oldPrice}} to {{newPrice}}, payment rate will improve by {{delta}}%',
    mechanismTemplate: '因为 {{reason}}，新价格更符合用户心理预期',
    mechanismTemplateEn: 'Because {{reason}}, the new price matches user expectations better',
    suggestedMetricType: 'conversion_rate',
    suggestedMetricName: '付费转化率',
    placeholders: [
      { key: 'product', label: '产品/方案', required: true },
      { key: 'oldPrice', label: '原价', required: true },
      { key: 'newPrice', label: '新价', required: true },
      { key: 'delta', label: '预期提升(%)', required: true, type: 'number' },
      { key: 'reason', label: '理由', required: false },
    ],
  },
  {
    name: '功能使用频次提升',
    nameEn: 'Feature Usage Frequency',
    category: 'activation',
    description: '通过入口优化、教育、提醒提升核心功能使用频次',
    descriptionEn: 'Improve core feature usage frequency via entry, education, or reminders',
    statementTemplate: '如果把 {{feature}} 的入口从 {{currentLocation}} 改到 {{newLocation}}，周活跃使用次数会增加 {{delta}}',
    statementTemplateEn:
      'If we move {{feature}} entry from {{currentLocation}} to {{newLocation}}, weekly active usage will increase by {{delta}}',
    mechanismTemplate: '因为 {{newLocation}} 曝光更高，用户更容易发现',
    mechanismTemplateEn: 'Because {{newLocation}} is more prominent, users find it more easily',
    suggestedMetricType: 'count',
    suggestedMetricName: '周使用次数',
    placeholders: [
      { key: 'feature', label: '功能', required: true },
      { key: 'currentLocation', label: '当前位置', required: true },
      { key: 'newLocation', label: '新位置', required: true },
      { key: 'delta', label: '预期增量(次/周)', required: true, type: 'number' },
    ],
  },
  {
    name: '分享传播提升',
    nameEn: 'Referral Amplification',
    category: 'referral',
    description: '通过激励或社交入口提升分享率',
    descriptionEn: 'Improve share rate via incentive or social entry',
    statementTemplate: '如果在 {{trigger}} 后提供 {{incentive}} 激励，分享率会从 {{baseline}}% 提升 {{delta}}%',
    statementTemplateEn:
      'If we offer {{incentive}} after {{trigger}}, share rate will improve from {{baseline}}% by {{delta}}%',
    mechanismTemplate: '因为 {{trigger}} 时用户处于情感高峰，更容易触发传播',
    mechanismTemplateEn: 'Because users are emotionally peaked after {{trigger}}, sharing is more likely',
    suggestedMetricType: 'conversion_rate',
    suggestedMetricName: '分享率',
    placeholders: [
      { key: 'trigger', label: '触发场景', required: true },
      { key: 'incentive', label: '激励内容', required: true },
      { key: 'baseline', label: '当前分享率(%)', required: true, type: 'number' },
      { key: 'delta', label: '预期提升(%)', required: true, type: 'number' },
    ],
  },
]

/**
 * 幂等 seed：已存在同名系统模板则跳过。
 * 用途：初次启动 / migration 后调用确保默认模板存在。
 */
export async function seedSystemDefaultTemplates(): Promise<{
  created: number
  skipped: number
}> {
  let created = 0
  let skipped = 0
  for (const tpl of SYSTEM_DEFAULT_TEMPLATES) {
    const exists = await prisma.hypothesisTemplate.findFirst({
      where: { name: tpl.name, isSystemDefault: true },
    })
    if (exists) {
      skipped += 1
      continue
    }
    await prisma.hypothesisTemplate.create({
      data: {
        name: tpl.name,
        nameEn: tpl.nameEn,
        category: tpl.category,
        description: tpl.description,
        descriptionEn: tpl.descriptionEn,
        statementTemplate: tpl.statementTemplate,
        statementTemplateEn: tpl.statementTemplateEn,
        mechanismTemplate: tpl.mechanismTemplate,
        mechanismTemplateEn: tpl.mechanismTemplateEn,
        suggestedMetricType: tpl.suggestedMetricType,
        suggestedMetricName: tpl.suggestedMetricName,
        placeholders: tpl.placeholders as unknown as object,
        isSystemDefault: true,
        createdById: null, // system default
      },
    })
    created += 1
  }
  return { created, skipped }
}
