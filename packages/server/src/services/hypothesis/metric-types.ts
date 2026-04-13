/**
 * Metric Type Whitelist (D25 决策)
 *
 * 不用 Prisma enum，用 string + service 层白名单校验。
 * 优势：加新指标类型不需要 DB migration，改常量文件即可。
 *
 * 每个 metric type 定义：
 *   code: 存库的 string
 *   label: 中文标签
 *   labelEn: 英文标签（i18n）
 *   unit: 默认单位
 *   valueHint: 合法值范围提示（给表单 validation + Copilot prompt）
 */

export interface MetricTypeDef {
  code: string
  label: string
  labelEn: string
  defaultUnit: string
  valueHint: string
  /** 数值约束：null = 无约束 */
  min?: number
  max?: number
}

export const METRIC_TYPE_REGISTRY: readonly MetricTypeDef[] = [
  {
    code: 'conversion_rate',
    label: '转化率',
    labelEn: 'Conversion Rate',
    defaultUnit: '%',
    valueHint: '0-100 之间的百分数',
    min: 0,
    max: 100,
  },
  {
    code: 'count',
    label: '数量',
    labelEn: 'Count',
    defaultUnit: '次',
    valueHint: '非负整数',
    min: 0,
  },
  {
    code: 'ratio',
    label: '比率',
    labelEn: 'Ratio',
    defaultUnit: '',
    valueHint: '无量纲比值',
    min: 0,
  },
  {
    code: 'revenue_cny',
    label: '收入（人民币）',
    labelEn: 'Revenue (CNY)',
    defaultUnit: '¥',
    valueHint: '非负金额',
    min: 0,
  },
  {
    code: 'revenue_usd',
    label: '收入（美元）',
    labelEn: 'Revenue (USD)',
    defaultUnit: '$',
    valueHint: '非负金额',
    min: 0,
  },
  {
    code: 'duration_seconds',
    label: '时长（秒）',
    labelEn: 'Duration (s)',
    defaultUnit: 's',
    valueHint: '非负秒数',
    min: 0,
  },
  {
    code: 'duration_ms',
    label: '时长（毫秒）',
    labelEn: 'Duration (ms)',
    defaultUnit: 'ms',
    valueHint: '非负毫秒数',
    min: 0,
  },
  {
    code: 'latency_ms',
    label: '延迟（毫秒）',
    labelEn: 'Latency (ms)',
    defaultUnit: 'ms',
    valueHint: '非负毫秒数',
    min: 0,
  },
  {
    code: 'score',
    label: '评分',
    labelEn: 'Score',
    defaultUnit: '分',
    valueHint: '0-10 或 NPS -100 ~ 100',
  },
  {
    code: 'percentage',
    label: '百分比',
    labelEn: 'Percentage',
    defaultUnit: '%',
    valueHint: '0-100 百分数',
    min: 0,
    max: 100,
  },
  {
    code: 'user_count',
    label: '用户数',
    labelEn: 'User Count',
    defaultUnit: '人',
    valueHint: '非负整数',
    min: 0,
  },
  {
    code: 'custom',
    label: '自定义',
    labelEn: 'Custom',
    defaultUnit: '',
    valueHint: '无约束',
  },
]

const CODE_SET = new Set(METRIC_TYPE_REGISTRY.map((m) => m.code))

export function isValidMetricType(code: string): boolean {
  return CODE_SET.has(code)
}

export function getMetricTypeDef(code: string): MetricTypeDef | undefined {
  return METRIC_TYPE_REGISTRY.find((m) => m.code === code)
}

export function listAllMetricTypes(): readonly MetricTypeDef[] {
  return METRIC_TYPE_REGISTRY
}

/**
 * 校验指标值是否合法（根据 metric type 的 min/max 约束）
 * @throws never，返回错误消息 or null
 */
export function validateMetricValue(
  code: string,
  value: number,
): string | null {
  const def = getMetricTypeDef(code)
  if (!def) return `unknown metric type: ${code}`
  if (!Number.isFinite(value)) return `value must be finite, got ${value}`
  if (def.min !== undefined && value < def.min) {
    return `${def.label} must be >= ${def.min}, got ${value}`
  }
  if (def.max !== undefined && value > def.max) {
    return `${def.label} must be <= ${def.max}, got ${value}`
  }
  return null
}
