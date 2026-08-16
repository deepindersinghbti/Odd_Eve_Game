import { describe, expect, it } from 'vitest';

import { BOT_CONTEXTS, chooseComputerNumber } from '../../src/bot/index.js';
import { HARD_BRANCHES, HARD_PROBABILITY_FLOOR } from '../../src/bot/constants.js';
import {
  buildGlobalDistribution,
  buildHardDistribution,
  buildRecentTransitionDistribution,
  selectHardBranch,
} from '../../src/bot/strategies.js';
import { DIFFICULTIES } from '../../src/game/index.js';
import { createSeededRandom } from './helpers.js';

function hardSequence(context, history, seed, length = 300) {
  const random = createSeededRandom(seed);
  return Array.from({ length }, () =>
    chooseComputerNumber({
      difficulty: DIFFICULTIES.HARD,
      context,
      visibleHistory: history,
      random,
    }),
  );
}

describe('Hard branch models', () => {
  it.each([
    [0.1, HARD_BRANCHES.UNIFORM],
    [0.4, HARD_BRANCHES.GLOBAL],
    [0.8, HARD_BRANCHES.RECENT_TRANSITION],
  ])('makes the %s branch reachable', (randomValue, expectedBranch) => {
    const selection = selectHardBranch(randomValue);
    expect(selection.branch).toBe(expectedBranch);
    expect(selection.sampleValue).toBeGreaterThanOrEqual(0);
    expect(selection.sampleValue).toBeLessThan(1);
  });

  it('global frequency favors a repeated value while bowling', () => {
    const distribution = buildGlobalDistribution(
      BOT_CONTEXTS.COMPUTER_BOWLING,
      Array(40).fill(3),
    );
    expect(distribution[2]).toBe(Math.max(...distribution));
  });

  it('global frequency avoids a repeated value while batting', () => {
    const distribution = buildGlobalDistribution(
      BOT_CONTEXTS.COMPUTER_BATTING,
      Array(40).fill(3),
    );
    expect(distribution[2]).toBe(Math.min(...distribution));
  });

  it('recent weighting favors the newest evidence', () => {
    const distribution = buildRecentTransitionDistribution(
      BOT_CONTEXTS.COMPUTER_BOWLING,
      [1, 2, 3, 4, 5],
    );
    expect(distribution[4]).toBe(Math.max(...distribution));
    expect(distribution[4]).toBeGreaterThan(distribution[0]);
  });

  it('uses actual follower evidence in the transition model', () => {
    const distribution = buildRecentTransitionDistribution(
      BOT_CONTEXTS.COMPUTER_BOWLING,
      [2, 4, 2, 4, 2],
    );
    expect(distribution[3]).toBe(Math.max(...distribution));
  });

  it('falls back from sparse transitions to recent evidence', () => {
    const distribution = buildRecentTransitionDistribution(
      BOT_CONTEXTS.COMPUTER_BOWLING,
      [1, 2, 3, 6],
    );
    expect(distribution[5]).toBe(Math.max(...distribution));
  });

  it('falls back to uniform with empty history', () => {
    const distribution = buildRecentTransitionDistribution(
      BOT_CONTEXTS.COMPUTER_BOWLING,
      [],
    );
    distribution.forEach((probability) => expect(probability).toBeCloseTo(1 / 6, 12));
  });

  it.each([BOT_CONTEXTS.COMPUTER_BOWLING, BOT_CONTEXTS.COMPUTER_BATTING])(
    'maintains the explicit 5%% final floor while %s',
    (context) => {
      const distribution = buildHardDistribution(context, Array(200).fill(5));
      expect(distribution).toHaveLength(6);
      expect(distribution.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
      distribution.forEach((probability) => {
        expect(probability).toBeGreaterThanOrEqual(HARD_PROBABILITY_FLOOR);
      });
    },
  );
});

describe('Hard sampled behavior', () => {
  it('remains non-deterministic and keeps every value reachable', () => {
    const sequence = hardSequence(
      BOT_CONTEXTS.COMPUTER_BOWLING,
      Array(100).fill(2),
      1_234,
      20_000,
    );
    const values = new Set(sequence);
    expect(values).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('reproduces identical sequences with identical seed and history', () => {
    const history = [2, 4, 2, 4, 2, 5, 3, 2];
    expect(hardSequence(BOT_CONTEXTS.COMPUTER_BATTING, history, 55)).toEqual(
      hardSequence(BOT_CONTEXTS.COMPUTER_BATTING, history, 55),
    );
  });
});
