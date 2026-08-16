import { describe, expect, it } from 'vitest';

import {
  applyLaplaceSmoothing,
  applyProbabilityFloor,
  buildFrequencyDistribution,
  buildRecentWeights,
  buildTransitionWeights,
  countFrequencies,
  createUniformWeights,
  invertLikelyDistribution,
  mixDistributions,
  normalizeWeights,
  sampleWeighted,
} from '../../src/bot/probability.js';

const expectDistribution = (distribution) => {
  expect(distribution).toHaveLength(6);
  distribution.forEach((probability) => {
    expect(Number.isFinite(probability)).toBe(true);
    expect(probability).toBeGreaterThanOrEqual(0);
  });
  expect(distribution.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
};

describe('probability utilities', () => {
  it('creates uniform weights and samples both boundaries', () => {
    const weights = createUniformWeights();
    expect(weights).toEqual([1, 1, 1, 1, 1, 1]);
    expect(sampleWeighted(weights, 0)).toBe(1);
    expect(sampleWeighted(weights, 1 - Number.EPSILON)).toBe(6);
  });

  it('counts frequencies and applies Laplace smoothing', () => {
    const counts = countFrequencies([1, 2, 2, 6]);
    expect(counts).toEqual([1, 2, 0, 0, 0, 1]);
    expect(applyLaplaceSmoothing(counts)).toEqual([2, 3, 1, 1, 1, 2]);
  });

  it('normalizes finite non-negative weights', () => {
    const distribution = normalizeWeights([1, 2, 3, 4, 5, 6]);
    expectDistribution(distribution);
    expect(distribution[5]).toBeGreaterThan(distribution[0]);
  });

  it('builds a smoothed frequency distribution for empty and sparse history', () => {
    expectDistribution(buildFrequencyDistribution([]));
    const sparse = buildFrequencyDistribution([4]);
    expectDistribution(sparse);
    expect(sparse[3]).toBeGreaterThan(sparse[0]);
    expect(sparse.every((value) => value > 0)).toBe(true);
  });

  it('inverts likely values without eliminating any number', () => {
    const predicted = buildFrequencyDistribution([4, 4, 4, 4, 4, 1]);
    const avoidance = invertLikelyDistribution(predicted);
    expectDistribution(avoidance);
    expect(avoidance[3]).toBeLessThan(avoidance[0]);
    expect(avoidance.every((value) => value > 0)).toBe(true);
  });

  it('enforces an exact lower probability floor', () => {
    const floored = applyProbabilityFloor([100, 0, 0, 0, 0, 0], 0.05);
    expectDistribution(floored);
    floored.forEach((probability) => expect(probability).toBeGreaterThanOrEqual(0.05));
  });

  it('mixes normalized distributions safely', () => {
    const mixed = mixDistributions(
      [createUniformWeights(), [6, 5, 4, 3, 2, 1]],
      [0.25, 0.75],
    );
    expectDistribution(mixed);
    expect(mixed[0]).toBeGreaterThan(mixed[5]);
  });

  it('weights the newest of the last five observations most heavily', () => {
    expect(buildRecentWeights([1, 2, 3, 4, 5, 6])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('counts actual followers of the final revealed number', () => {
    const transition = buildTransitionWeights([2, 4, 2, 4, 2]);
    expect(transition.evidenceCount).toBe(2);
    expect(transition.weights).toEqual([0, 0, 0, 2, 0, 0]);
  });

  it('handles empty transition evidence without division by zero', () => {
    expect(buildTransitionWeights([])).toEqual({
      weights: [0, 0, 0, 0, 0, 0],
      evidenceCount: 0,
    });
  });
});
