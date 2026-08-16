import { describe, expect, it, vi } from 'vitest';

import {
  CONTROLLER_ERROR_CODES,
  calculateDelay,
  validateDelayRange,
} from '../../src/controller/index.js';

describe('controller delay calculation', () => {
  it.each([
    [0, 400],
    [0.5, 600],
    [0.999999, 800],
  ])('maps %s into the inclusive default range', (randomValue, expected) => {
    expect(calculateDelay(() => randomValue)).toBe(expected);
  });

  it('consumes timing randomness even for a fixed delay', () => {
    const timingRandom = vi.fn(() => 0.8);

    expect(calculateDelay(timingRandom, { minimum: 0, maximum: 0 })).toBe(0);
    expect(timingRandom).toHaveBeenCalledOnce();
  });

  it.each([
    [null],
    [{}],
    [{ minimum: -1, maximum: 2 }],
    [{ minimum: 2, maximum: 1 }],
    [{ minimum: 0.5, maximum: 1 }],
  ])('rejects invalid delay ranges', (range) => {
    expect(() => validateDelayRange(range)).toThrowError(
      expect.objectContaining({ code: CONTROLLER_ERROR_CODES.INVALID_DELAY_CONFIG }),
    );
  });

  it.each([-0.1, 1, Number.NaN, '0.5'])('rejects invalid timing output %s', (value) => {
    expect(() => calculateDelay(() => value)).toThrowError(
      expect.objectContaining({ code: CONTROLLER_ERROR_CODES.INVALID_DELAY_CONFIG }),
    );
  });
});
