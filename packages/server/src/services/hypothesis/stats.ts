/**
 * Statistical Significance Calculator for Hypothesis Variants
 *
 * 本模块自实现两种假设检验，不引入外部依赖（jstat / simple-statistics）：
 *   1. Two-proportion z-test   —— 用于 CONVERSION_RATE metric（转化率）
 *   2. Welch's t-test           —— 用于其他连续型 metric（response time / revenue）
 *
 * 精度约束：normalCDF 使用 Abramowitz-Stegun 多项式近似，误差 < 7.5e-8。
 * 对 p-value 显著性判断（< 0.05）足够精确。
 *
 * 单测对照：Python scipy.stats 的参考值，误差 < 1e-4。
 *
 * 决策依据：PRD §5.2 决策 D31
 */

// ============================================================
// Basic helpers
// ============================================================

/**
 * Standard normal CDF (cumulative distribution function).
 * Abramowitz & Stegun 26.2.17 rational approximation.
 * Max error: 7.5e-8
 *
 * @param z — standardized variable
 * @returns P(Z <= z), range [0, 1]
 */
export function normalCDF(z: number): number {
  if (!Number.isFinite(z)) {
    if (z === Number.POSITIVE_INFINITY) return 1
    if (z === Number.NEGATIVE_INFINITY) return 0
    return NaN
  }

  // Exact center (避免 Abramowitz-Stegun 近似在 z=0 的浮点误差)
  if (z === 0) return 0.5

  const a1 = 0.31938153
  const a2 = -0.356563782
  const a3 = 1.781477937
  const a4 = -1.821255978
  const a5 = 1.330274429
  const p = 0.2316419

  const absZ = Math.abs(z)
  const k = 1 / (1 + p * absZ)
  const k2 = k * k
  const k3 = k2 * k
  const k4 = k3 * k
  const k5 = k4 * k

  // Standard normal PDF: phi(z) = (1 / sqrt(2*pi)) * exp(-z^2 / 2)
  const pdf = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-(absZ * absZ) / 2)

  const cdfUpper = pdf * (a1 * k + a2 * k2 + a3 * k3 + a4 * k4 + a5 * k5)
  // cdfUpper is P(Z > |z|)

  return z >= 0 ? 1 - cdfUpper : cdfUpper
}

/**
 * Two-tailed p-value for a given z-statistic.
 * p = 2 * (1 - Phi(|z|))
 */
export function twoTailedPValue(z: number): number {
  if (!Number.isFinite(z)) return NaN
  const absZ = Math.abs(z)
  return 2 * (1 - normalCDF(absZ))
}

// ============================================================
// Two-proportion z-test
// ============================================================

export interface ProportionGroup {
  successes: number
  n: number
}

export interface ProportionTestResult {
  /** Treatment rate - Control rate (positive = treatment better) */
  delta: number
  /** Pooled standard error */
  stdError: number
  /** z-statistic */
  zScore: number
  /** Two-tailed p-value (相对 control 的差异是否显著) */
  pValue: number
  /** 95% 置信区间下界 (treatment rate) */
  ciLow95: number
  /** 95% 置信区间上界 (treatment rate) */
  ciHigh95: number
  /** Treatment group observed conversion rate */
  treatmentRate: number
  /** Control group observed conversion rate */
  controlRate: number
  /** 是否显著（p < 0.05） */
  significant: boolean
}

/**
 * Two-proportion z-test for A/B testing conversion rates.
 *
 * 算法：
 *   1. 合并样本算 pooled proportion: p̂ = (x1 + x2) / (n1 + n2)
 *   2. Standard error: SE = √(p̂(1-p̂)(1/n1 + 1/n2))
 *   3. Z-score: z = (p2 - p1) / SE
 *   4. P-value: 2 * (1 - Φ(|z|))   (two-tailed)
 *   5. CI (Wald 95% on treatment proportion):
 *        SE_treatment = √(p2(1-p2)/n2)
 *        CI = [p2 - 1.96*SE_treatment, p2 + 1.96*SE_treatment]
 *
 * 参考：Hypothesis Testing for Proportions (Casella & Berger)
 *
 * @throws RangeError 如果任一组的 n <= 0 或 successes < 0 或 successes > n
 */
export function zTestTwoProportion(
  control: ProportionGroup,
  treatment: ProportionGroup,
): ProportionTestResult {
  validateProportionGroup(control, 'control')
  validateProportionGroup(treatment, 'treatment')

  const p1 = control.successes / control.n
  const p2 = treatment.successes / treatment.n
  const delta = p2 - p1

  const pPool = (control.successes + treatment.successes) / (control.n + treatment.n)
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / control.n + 1 / treatment.n))

  // If SE == 0 (all samples same outcome), z is infinite or undefined
  let zScore: number
  let pValue: number
  if (se === 0) {
    if (delta === 0) {
      // 完全相等（两边都是 0% 或都是 100%）
      zScore = 0
      pValue = 1
    } else {
      // 极端情况：不应发生于正常数据，保护一下
      zScore = delta > 0 ? Infinity : -Infinity
      pValue = 0
    }
  } else {
    zScore = delta / se
    pValue = twoTailedPValue(zScore)
  }

  // Treatment group's 95% CI (Wald interval on proportion)
  const seTreatment = Math.sqrt((p2 * (1 - p2)) / treatment.n)
  const ciMargin = 1.96 * seTreatment
  const ciLow95 = p2 - ciMargin
  const ciHigh95 = p2 + ciMargin

  return {
    delta,
    stdError: se,
    zScore,
    pValue,
    ciLow95,
    ciHigh95,
    treatmentRate: p2,
    controlRate: p1,
    significant: pValue < 0.05,
  }
}

function validateProportionGroup(g: ProportionGroup, label: string): void {
  if (!Number.isFinite(g.n) || g.n <= 0) {
    throw new RangeError(`${label}: n must be a positive number, got ${g.n}`)
  }
  if (!Number.isInteger(g.n)) {
    throw new RangeError(`${label}: n must be an integer, got ${g.n}`)
  }
  if (!Number.isFinite(g.successes) || g.successes < 0) {
    throw new RangeError(`${label}: successes must be >= 0, got ${g.successes}`)
  }
  if (!Number.isInteger(g.successes)) {
    throw new RangeError(`${label}: successes must be an integer, got ${g.successes}`)
  }
  if (g.successes > g.n) {
    throw new RangeError(`${label}: successes (${g.successes}) cannot exceed n (${g.n})`)
  }
}

// ============================================================
// Welch's t-test (for continuous metrics)
// ============================================================

export interface ContinuousGroup {
  /** Sample mean */
  mean: number
  /** Sample standard deviation */
  stdDev: number
  /** Sample size */
  n: number
}

export interface TTestResult {
  delta: number // treatment mean - control mean
  tStat: number
  /** Welch-Satterthwaite degrees of freedom */
  df: number
  pValue: number
  significant: boolean
}

/**
 * Welch's t-test for unequal variances.
 *
 * 不假设两组方差相等，适合 A/B 中样本量不同的场景。
 * DF 用 Welch-Satterthwaite 方程近似。
 *
 * p-value 这里用标准正态近似（大样本 n > 30 时 t 分布 ≈ 正态）。
 * 小样本场景下精度会损失（这是 trade-off：不引入 t 分布 CDF 依赖）。
 * 对 AIPM 的 A/B 样本量（通常 > 100）完全够用。
 */
export function welchTTest(
  control: ContinuousGroup,
  treatment: ContinuousGroup,
): TTestResult {
  validateContinuousGroup(control, 'control')
  validateContinuousGroup(treatment, 'treatment')

  const delta = treatment.mean - control.mean

  const var1 = control.stdDev * control.stdDev
  const var2 = treatment.stdDev * treatment.stdDev

  const se = Math.sqrt(var1 / control.n + var2 / treatment.n)

  let tStat: number
  let pValue: number
  if (se === 0) {
    if (delta === 0) {
      tStat = 0
      pValue = 1
    } else {
      tStat = delta > 0 ? Infinity : -Infinity
      pValue = 0
    }
  } else {
    tStat = delta / se
    // Normal approximation (OK for large samples)
    pValue = twoTailedPValue(tStat)
  }

  // Welch-Satterthwaite degrees of freedom
  const dfNumerator = Math.pow(var1 / control.n + var2 / treatment.n, 2)
  const dfDenominator =
    Math.pow(var1 / control.n, 2) / (control.n - 1) +
    Math.pow(var2 / treatment.n, 2) / (treatment.n - 1)
  const df = dfDenominator === 0 ? Infinity : dfNumerator / dfDenominator

  return {
    delta,
    tStat,
    df,
    pValue,
    significant: pValue < 0.05,
  }
}

function validateContinuousGroup(g: ContinuousGroup, label: string): void {
  if (!Number.isFinite(g.n) || g.n <= 1) {
    throw new RangeError(`${label}: n must be > 1 for variance calc, got ${g.n}`)
  }
  if (!Number.isFinite(g.mean)) {
    throw new RangeError(`${label}: mean must be finite, got ${g.mean}`)
  }
  if (!Number.isFinite(g.stdDev) || g.stdDev < 0) {
    throw new RangeError(`${label}: stdDev must be >= 0, got ${g.stdDev}`)
  }
}
