import { describe, expect, it } from 'vitest';

import {
  BOT_CONTEXTS,
  BOT_ERROR_CODES,
  chooseComputerNumber,
  chooseComputerRole,
} from '../../src/bot/index.js';
import { DIFFICULTIES } from '../../src/game/index.js';
import { expectBotError } from './helpers.js';

function validNumberInput(overrides = {}) {
  return {
    difficulty: DIFFICULTIES.MEDIUM,
    context: BOT_CONTEXTS.COMPUTER_BOWLING,
    visibleHistory: [],
    random: () => 0.25,
    ...overrides,
  };
}

describe('computer number input validation', () => {
  it.each(['NORMAL', '', null, undefined, 1])(
    'rejects invalid difficulty %s',
    (difficulty) => {
      expectBotError(
        () => chooseComputerNumber(validNumberInput({ difficulty })),
        BOT_ERROR_CODES.INVALID_DIFFICULTY,
      );
    },
  );

  it.each(['BATTING', '', null, undefined, 1])(
    'rejects invalid context %s',
    (context) => {
      expectBotError(
        () => chooseComputerNumber(validNumberInput({ context })),
        BOT_ERROR_CODES.INVALID_CONTEXT,
      );
    },
  );

  it.each([undefined, null, 1, 'random'])('rejects random source %s', (random) => {
    expectBotError(
      () => chooseComputerNumber(validNumberInput({ random })),
      BOT_ERROR_CODES.INVALID_RANDOM_SOURCE,
    );
  });

  it.each([
    ['not a number', '0.5'],
    ['NaN', NaN],
    ['negative', -0.01],
    ['one', 1],
    ['greater than one', 1.1],
    ['infinity', Infinity],
  ])('rejects %s random output', (_label, value) => {
    expectBotError(
      () => chooseComputerNumber(validNumberInput({ random: () => value })),
      BOT_ERROR_CODES.INVALID_RANDOM_VALUE,
    );
  });

  it.each([undefined, null, {}, '123', 123])(
    'rejects invalid history container %s',
    (visibleHistory) => {
      expectBotError(
        () => chooseComputerNumber(validNumberInput({ visibleHistory })),
        BOT_ERROR_CODES.INVALID_HISTORY,
      );
    },
  );

  it.each([0, 7, -1, 1.5, '3', null, undefined, NaN])(
    'rejects invalid history value %s',
    (value) => {
      expectBotError(
        () => chooseComputerNumber(validNumberInput({ visibleHistory: [value] })),
        BOT_ERROR_CODES.INVALID_HISTORY,
      );
    },
  );

  it.each([
    'playerNumber',
    'humanNumber',
    'currentChoice',
    'selectedNumber',
    'pendingNumber',
  ])('rejects forbidden current-choice property %s', (property) => {
    expectBotError(
      () => chooseComputerNumber({ ...validNumberInput(), [property]: 4 }),
      BOT_ERROR_CODES.UNEXPECTED_INPUT,
    );
  });

  it('does not mutate frozen input or history', () => {
    const visibleHistory = Object.freeze([2, 4, 2, 6]);
    const input = Object.freeze(validNumberInput({ visibleHistory }));

    expect(chooseComputerNumber(input)).toBeGreaterThanOrEqual(1);
    expect(visibleHistory).toEqual([2, 4, 2, 6]);
    expect(Object.isFrozen(input)).toBe(true);
  });

  it.each(Object.values(DIFFICULTIES))(
    'consumes exactly one random value for %s',
    (difficulty) => {
      let calls = 0;
      chooseComputerNumber(
        validNumberInput({
          difficulty,
          visibleHistory: [1, 2, 3, 4, 5, 6],
          random: () => {
            calls += 1;
            return 0.75;
          },
        }),
      );
      expect(calls).toBe(1);
    },
  );
});

describe('computer role validation', () => {
  it('uses the bot error boundary for invalid role input', () => {
    expectBotError(
      () => chooseComputerRole({ difficulty: 'NORMAL', random: () => 0 }),
      BOT_ERROR_CODES.INVALID_DIFFICULTY,
    );
    expectBotError(
      () => chooseComputerRole({ difficulty: DIFFICULTIES.EASY }),
      BOT_ERROR_CODES.INVALID_RANDOM_SOURCE,
    );
    expectBotError(
      () =>
        chooseComputerRole({
          difficulty: DIFFICULTIES.EASY,
          random: () => 0,
          history: [],
        }),
      BOT_ERROR_CODES.UNEXPECTED_INPUT,
    );
  });
});
