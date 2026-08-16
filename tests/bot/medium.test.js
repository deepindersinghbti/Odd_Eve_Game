import { describe, expect, it } from 'vitest';

import { BOT_CONTEXTS, chooseComputerNumber } from '../../src/bot/index.js';
import { DIFFICULTIES } from '../../src/game/index.js';
import { createSeededRandom, sampleChoices } from './helpers.js';

function mediumChoice(context, visibleHistory, random) {
  return chooseComputerNumber({
    difficulty: DIFFICULTIES.MEDIUM,
    context,
    visibleHistory,
    random,
  });
}

function seededSequence(context, visibleHistory, seed, length = 200) {
  const random = createSeededRandom(seed);
  return Array.from({ length }, () => mediumChoice(context, visibleHistory, random));
}

describe('Medium strategy', () => {
  it.each([[], [6], [6, 6], [6, 6, 6]].map((history) => [history]))(
    'falls back to uniform before four observations: %j',
    (visibleHistory) => {
      expect(mediumChoice(BOT_CONTEXTS.COMPUTER_BOWLING, visibleHistory, () => 0.8)).toBe(
        5,
      );
    },
  );

  it('adapts toward a strongly repeated batting value while bowling', () => {
    const random = createSeededRandom(101);
    const counts = sampleChoices(
      () => mediumChoice(BOT_CONTEXTS.COMPUTER_BOWLING, Array(80).fill(4), random),
      30_000,
    );

    expect(counts[3] / 30_000).toBeGreaterThan(0.38);
    expect(counts[3]).toBe(Math.max(...counts));
  });

  it('avoids a strongly repeated bowling value while batting', () => {
    const random = createSeededRandom(202);
    const counts = sampleChoices(
      () => mediumChoice(BOT_CONTEXTS.COMPUTER_BATTING, Array(80).fill(4), random),
      30_000,
    );

    expect(counts[3] / 30_000).toBeLessThan(0.15);
    expect(counts[3]).toBe(Math.min(...counts));
  });

  it.each([BOT_CONTEXTS.COMPUTER_BOWLING, BOT_CONTEXTS.COMPUTER_BATTING])(
    'keeps every number possible while %s',
    (context) => {
      const random = createSeededRandom(303);
      const counts = sampleChoices(
        () => mediumChoice(context, Array(100).fill(2), random),
        30_000,
      );
      counts.forEach((count) => expect(count).toBeGreaterThan(0));
    },
  );

  it('reproduces identical sequences from identical history and seed', () => {
    const history = [2, 4, 2, 6, 2, 3, 2, 5];
    expect(seededSequence(BOT_CONTEXTS.COMPUTER_BOWLING, history, 88)).toEqual(
      seededSequence(BOT_CONTEXTS.COMPUTER_BOWLING, history, 88),
    );
  });

  it('materially changes behavior for different revealed histories', () => {
    const samples = 20_000;
    const randomForOnes = createSeededRandom(919);
    const randomForSixes = createSeededRandom(919);
    const oneHistoryCounts = sampleChoices(
      () => mediumChoice(BOT_CONTEXTS.COMPUTER_BOWLING, Array(60).fill(1), randomForOnes),
      samples,
    );
    const sixHistoryCounts = sampleChoices(
      () =>
        mediumChoice(BOT_CONTEXTS.COMPUTER_BOWLING, Array(60).fill(6), randomForSixes),
      samples,
    );

    expect(oneHistoryCounts[0] - sixHistoryCounts[0]).toBeGreaterThan(5_000);
    expect(sixHistoryCounts[5] - oneHistoryCounts[5]).toBeGreaterThan(5_000);
  });
});
