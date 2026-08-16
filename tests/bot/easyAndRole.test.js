import { describe, expect, it } from 'vitest';

import {
  BOT_CONTEXTS,
  chooseComputerNumber,
  chooseComputerRole,
} from '../../src/bot/index.js';
import { DIFFICULTIES, ROLES } from '../../src/game/index.js';
import { createSeededRandom, sampleChoices } from './helpers.js';

function chooseNumber({
  difficulty = DIFFICULTIES.EASY,
  context = BOT_CONTEXTS.COMPUTER_BOWLING,
  visibleHistory = [],
  random,
}) {
  return chooseComputerNumber({ difficulty, context, visibleHistory, random });
}

describe('Easy and toss number selection', () => {
  it.each([
    [0, 1],
    [1 / 6, 2],
    [0.5, 4],
    [1 - Number.EPSILON, 6],
  ])('maps random boundary %d to %i', (randomValue, expected) => {
    expect(chooseNumber({ random: () => randomValue })).toBe(expected);
  });

  it.each(Object.values(BOT_CONTEXTS))(
    'ignores history in Easy context %s',
    (context) => {
      const withoutHistory = chooseNumber({ context, random: () => 0.42 });
      const withHistory = chooseNumber({
        context,
        visibleHistory: Array(100).fill(6),
        random: () => 0.42,
      });
      expect(withHistory).toBe(withoutHistory);
    },
  );

  it('is approximately uniform over a large deterministic sample', () => {
    const random = createSeededRandom(7_331);
    const counts = sampleChoices(() => chooseNumber({ random }), 60_000);

    counts.forEach((count) => {
      expect(count).toBeGreaterThan(9_500);
      expect(count).toBeLessThan(10_500);
    });
  });

  it.each(Object.values(DIFFICULTIES))(
    'keeps the toss uniform at %s difficulty',
    (difficulty) => {
      const choice = chooseNumber({
        difficulty,
        context: BOT_CONTEXTS.TOSS,
        visibleHistory: Array(20).fill(1),
        random: () => 0.8,
      });
      expect(choice).toBe(5);
    },
  );

  it.each(
    Object.values(DIFFICULTIES).flatMap((difficulty) =>
      Object.values(BOT_CONTEXTS).map((context) => [difficulty, context]),
    ),
  )('always returns 1-6 for %s in %s', (difficulty, context) => {
    const random = createSeededRandom(912);
    for (let index = 0; index < 500; index += 1) {
      const choice = chooseNumber({
        difficulty,
        context,
        visibleHistory: [1, 2, 3, 4, 5, 6, 2, 4],
        random,
      });
      expect(Number.isInteger(choice)).toBe(true);
      expect(choice).toBeGreaterThanOrEqual(1);
      expect(choice).toBeLessThanOrEqual(6);
    }
  });
});

describe('computer role selection', () => {
  it.each([
    [0, ROLES.BAT],
    [0.499999, ROLES.BAT],
    [0.5, ROLES.BOWL],
    [1 - Number.EPSILON, ROLES.BOWL],
  ])('maps random value %d to %s', (randomValue, role) => {
    expect(
      chooseComputerRole({
        difficulty: DIFFICULTIES.MEDIUM,
        random: () => randomValue,
      }),
    ).toBe(role);
  });

  it.each(Object.values(DIFFICULTIES))(
    'keeps the same role boundary at %s difficulty',
    (difficulty) => {
      expect(chooseComputerRole({ difficulty, random: () => 0.25 })).toBe(ROLES.BAT);
      expect(chooseComputerRole({ difficulty, random: () => 0.75 })).toBe(ROLES.BOWL);
    },
  );

  it('is approximately 50/50 over a seeded sample', () => {
    const random = createSeededRandom(444);
    let batCount = 0;
    const sampleSize = 20_000;

    for (let index = 0; index < sampleSize; index += 1) {
      if (chooseComputerRole({ difficulty: DIFFICULTIES.HARD, random }) === ROLES.BAT) {
        batCount += 1;
      }
    }

    expect(batCount).toBeGreaterThan(9_500);
    expect(batCount).toBeLessThan(10_500);
  });
});
