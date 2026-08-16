import { expect } from 'vitest';

import { BotError } from '../../src/bot/index.js';

export function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function createSequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

export function expectBotError(callback, code) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(BotError);
    expect(error.code).toBe(code);
    return error;
  }

  throw new Error(`Expected BotError with code ${code}.`);
}

export function sampleChoices(createChoice, sampleSize) {
  const counts = Array(6).fill(0);
  for (let index = 0; index < sampleSize; index += 1) {
    counts[createChoice() - 1] += 1;
  }
  return counts;
}
