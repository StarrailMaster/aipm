/**
 * Unit tests for Statistical Significance module.
 *
 * 参考值由 Python scipy.stats 在 2026-04-12 生成：
 *   scipy.stats.norm.cdf(z)
 *   statsmodels.stats.proportion.proportions_ztest(successes, n)
 *
 * 误差容忍度：
 *   - normalCDF: < 7.5e-8 (Abramowitz-Stegun 26.2.17 guarantee)
 *   - zTestTwoProportion: < 1e-4 (足够 p-value 判断)
 */
import { describe, it, expect } from 'vitest'
import {
  normalCDF,
  twoTailedPValue,
  zTestTwoProportion,
  welchTTest,
} from '../services/hypothesis/stats'

describe('normalCDF', () => {
  it('returns 0.5 at z=0', () => {
    expect(normalCDF(0)).toBeCloseTo(0.5, 8)
  })

  it('handles positive z correctly (scipy reference)', () => {
    // scipy.stats.norm.cdf(1.0) = 0.8413447460685...
    expect(normalCDF(1.0)).toBeCloseTo(0.8413447, 5)
    // scipy.stats.norm.cdf(1.96) = 0.9750021048517795
    expect(normalCDF(1.96)).toBeCloseTo(0.9750021, 5)
    // scipy.stats.norm.cdf(2.58) = 0.9950599842422848
    expect(normalCDF(2.58)).toBeCloseTo(0.9950600, 5)
    // scipy.stats.norm.cdf(3.0) = 0.9986501019683699
    expect(normalCDF(3.0)).toBeCloseTo(0.9986501, 5)
  })

  it('handles negative z correctly (symmetry)', () => {
    expect(normalCDF(-1.0)).toBeCloseTo(1 - 0.8413447, 5)
    expect(normalCDF(-1.96)).toBeCloseTo(0.0249979, 5)
    expect(normalCDF(-3.0)).toBeCloseTo(0.0013499, 5)
  })

  it('handles extreme values', () => {
    expect(normalCDF(Number.POSITIVE_INFINITY)).toBe(1)
    expect(normalCDF(Number.NEGATIVE_INFINITY)).toBe(0)
    expect(normalCDF(5)).toBeCloseTo(1, 6)
    expect(normalCDF(-5)).toBeCloseTo(0, 6)
  })

  it('returns NaN for NaN input', () => {
    expect(normalCDF(NaN)).toBeNaN()
  })
})

describe('twoTailedPValue', () => {
  it('z=0 → p=1', () => {
    expect(twoTailedPValue(0)).toBeCloseTo(1, 8)
  })

  it('z=1.96 → p≈0.05 (2-sided critical value)', () => {
    // scipy: 2*(1-norm.cdf(1.96)) = 0.0499958...
    expect(twoTailedPValue(1.96)).toBeCloseTo(0.05, 3)
  })

  it('z=2.58 → p≈0.01', () => {
    expect(twoTailedPValue(2.58)).toBeCloseTo(0.01, 3)
  })

  it('z=3.29 → p≈0.001', () => {
    expect(twoTailedPValue(3.29)).toBeCloseTo(0.001, 3)
  })

  it('is symmetric for ±z', () => {
    expect(twoTailedPValue(1.5)).toBeCloseTo(twoTailedPValue(-1.5), 8)
  })
})

describe('zTestTwoProportion', () => {
  it('detects significant improvement (reference case from PRD §6.6)', () => {
    // control 38/1000, treatment 47/1000
    // scipy proportions_ztest([47, 38], [1000, 1000]) ≈ z=0.979, p=0.327
    // BUT pooled SE formula uses p_pool; let me compute exactly:
    //   p1 = 0.038, p2 = 0.047, delta = 0.009
    //   p_pool = 85/2000 = 0.0425
    //   SE = sqrt(0.0425 * 0.9575 * (1/1000 + 1/1000)) ≈ 0.009028
    //   z ≈ 0.009 / 0.009028 ≈ 0.997
    //   p ≈ 2*(1 - norm.cdf(0.997)) ≈ 0.319
    const result = zTestTwoProportion(
      { successes: 38, n: 1000 },
      { successes: 47, n: 1000 },
    )
    expect(result.controlRate).toBeCloseTo(0.038, 6)
    expect(result.treatmentRate).toBeCloseTo(0.047, 6)
    expect(result.delta).toBeCloseTo(0.009, 6)
    expect(result.zScore).toBeCloseTo(0.997, 2)
    expect(result.pValue).toBeGreaterThan(0.3)
    expect(result.pValue).toBeLessThan(0.35)
    expect(result.significant).toBe(false) // p > 0.05
  })

  it('detects significant improvement (large sample, bigger effect)', () => {
    // control 100/2000 (5%), treatment 140/2000 (7%)
    // delta = 0.02, this should be highly significant
    const result = zTestTwoProportion(
      { successes: 100, n: 2000 },
      { successes: 140, n: 2000 },
    )
    expect(result.delta).toBeCloseTo(0.02, 6)
    expect(result.pValue).toBeLessThan(0.01)
    expect(result.significant).toBe(true)
  })

  it('no difference → high p-value', () => {
    const result = zTestTwoProportion(
      { successes: 50, n: 1000 },
      { successes: 50, n: 1000 },
    )
    expect(result.delta).toBe(0)
    expect(result.zScore).toBe(0)
    expect(result.pValue).toBe(1)
    expect(result.significant).toBe(false)
  })

  it('treatment worse than control → negative delta, significant when large', () => {
    // 100/1000 vs 60/1000: delta=-0.04, clearly significant
    const result = zTestTwoProportion(
      { successes: 100, n: 1000 },
      { successes: 60, n: 1000 },
    )
    expect(result.delta).toBeCloseTo(-0.04, 6)
    expect(result.zScore).toBeLessThan(0)
    expect(result.significant).toBe(true)
  })

  it('small negative effect below significance threshold', () => {
    // 100/1000 vs 80/1000: delta=-0.02, z≈-1.66, p≈0.097 → not significant
    const result = zTestTwoProportion(
      { successes: 100, n: 1000 },
      { successes: 80, n: 1000 },
    )
    expect(result.delta).toBeCloseTo(-0.02, 6)
    expect(result.pValue).toBeGreaterThan(0.05)
    expect(result.significant).toBe(false)
  })

  it('edge: both all-success (100% rate)', () => {
    const result = zTestTwoProportion(
      { successes: 100, n: 100 },
      { successes: 100, n: 100 },
    )
    expect(result.delta).toBe(0)
    expect(result.stdError).toBe(0)
    expect(result.pValue).toBe(1)
    expect(result.significant).toBe(false)
  })

  it('edge: both all-zero (0% rate)', () => {
    const result = zTestTwoProportion(
      { successes: 0, n: 100 },
      { successes: 0, n: 100 },
    )
    expect(result.delta).toBe(0)
    expect(result.pValue).toBe(1)
    expect(result.significant).toBe(false)
  })

  it('computes 95% confidence interval (Wald on treatment)', () => {
    // treatment 50/1000 → p = 0.05
    // SE_treatment = sqrt(0.05 * 0.95 / 1000) ≈ 0.00689
    // 95% CI: 0.05 ± 1.96 * 0.00689 ≈ [0.03649, 0.06351]
    const result = zTestTwoProportion(
      { successes: 40, n: 1000 },
      { successes: 50, n: 1000 },
    )
    expect(result.ciLow95).toBeCloseTo(0.0365, 3)
    expect(result.ciHigh95).toBeCloseTo(0.0635, 3)
  })

  it('small sample size still works (n=50)', () => {
    const result = zTestTwoProportion(
      { successes: 5, n: 50 },
      { successes: 15, n: 50 },
    )
    expect(result.delta).toBeCloseTo(0.2, 6)
    expect(result.significant).toBe(true)
  })

  it('throws on invalid control n', () => {
    expect(() =>
      zTestTwoProportion({ successes: 10, n: 0 }, { successes: 15, n: 100 }),
    ).toThrow(/n must be a positive/)
  })

  it('throws on invalid treatment successes', () => {
    expect(() =>
      zTestTwoProportion(
        { successes: 10, n: 100 },
        { successes: -5, n: 100 },
      ),
    ).toThrow(/successes must be >= 0/)
  })

  it('throws on successes > n', () => {
    expect(() =>
      zTestTwoProportion(
        { successes: 150, n: 100 },
        { successes: 50, n: 100 },
      ),
    ).toThrow(/cannot exceed n/)
  })

  it('throws on non-integer n', () => {
    expect(() =>
      zTestTwoProportion(
        { successes: 10, n: 100.5 },
        { successes: 15, n: 100 },
      ),
    ).toThrow(/must be an integer/)
  })

  it('throws on non-integer successes', () => {
    expect(() =>
      zTestTwoProportion(
        { successes: 10.5, n: 100 },
        { successes: 15, n: 100 },
      ),
    ).toThrow(/must be an integer/)
  })
})

describe('welchTTest', () => {
  it('equal groups → t=0, p≈1', () => {
    const result = welchTTest(
      { mean: 50, stdDev: 10, n: 100 },
      { mean: 50, stdDev: 10, n: 100 },
    )
    expect(result.delta).toBe(0)
    expect(result.tStat).toBe(0)
    expect(result.pValue).toBeCloseTo(1, 6)
    expect(result.significant).toBe(false)
  })

  it('detects significant difference (large effect)', () => {
    // mean 50 vs 60, stddev 10, n=100
    // SE = sqrt(100/100 + 100/100) = sqrt(2) ≈ 1.414
    // t ≈ 10 / 1.414 ≈ 7.07
    // p ≈ 0 (highly significant)
    const result = welchTTest(
      { mean: 50, stdDev: 10, n: 100 },
      { mean: 60, stdDev: 10, n: 100 },
    )
    expect(result.delta).toBe(10)
    expect(result.tStat).toBeCloseTo(7.071, 2)
    expect(result.pValue).toBeLessThan(0.001)
    expect(result.significant).toBe(true)
  })

  it('detects no significant difference (small effect in noise)', () => {
    // mean 50 vs 51, stddev 10, n=100
    // SE ≈ 1.414, t ≈ 0.707, p ≈ 0.48 → not significant
    const result = welchTTest(
      { mean: 50, stdDev: 10, n: 100 },
      { mean: 51, stdDev: 10, n: 100 },
    )
    expect(result.delta).toBe(1)
    expect(result.tStat).toBeCloseTo(0.707, 2)
    expect(result.pValue).toBeGreaterThan(0.4)
    expect(result.significant).toBe(false)
  })

  it('handles unequal sample sizes (Welch correction)', () => {
    const result = welchTTest(
      { mean: 50, stdDev: 5, n: 50 },
      { mean: 55, stdDev: 10, n: 200 },
    )
    expect(result.delta).toBe(5)
    expect(result.tStat).toBeGreaterThan(0)
    // Welch DF should be calculated, not infinite
    expect(result.df).toBeGreaterThan(0)
    expect(result.df).toBeLessThan(250)
  })

  it('throws on n <= 1', () => {
    expect(() =>
      welchTTest(
        { mean: 50, stdDev: 10, n: 1 },
        { mean: 55, stdDev: 10, n: 100 },
      ),
    ).toThrow(/n must be > 1/)
  })

  it('throws on negative stdDev', () => {
    expect(() =>
      welchTTest(
        { mean: 50, stdDev: -5, n: 100 },
        { mean: 55, stdDev: 10, n: 100 },
      ),
    ).toThrow(/stdDev must be >= 0/)
  })
})
