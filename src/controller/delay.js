import { DEFAULT_DELAY_RANGE } from './constants.js';
import { CONTROLLER_ERROR_CODES, failController } from './errors.js';

export function validateDelayRange(delayRange = DEFAULT_DELAY_RANGE) {
  const { minimum, maximum } = delayRange ?? {};
  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    minimum < 0 ||
    maximum < minimum
  ) {
    failController(
      CONTROLLER_ERROR_CODES.INVALID_DELAY_CONFIG,
      'Delay range requires non-negative integer bounds with maximum >= minimum.',
    );
  }

  return { minimum, maximum };
}

/**
 * Maps random values in [0, 1) to an integer delay with inclusive bounds.
 */
export function calculateDelay(timingRandom, delayRange = DEFAULT_DELAY_RANGE) {
  const { minimum, maximum } = validateDelayRange(delayRange);
  if (typeof timingRandom !== 'function') {
    failController(
      CONTROLLER_ERROR_CODES.INVALID_DELAY_CONFIG,
      'timingRandom must be a function.',
    );
  }

  const randomValue = timingRandom();
  if (
    typeof randomValue !== 'number' ||
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue >= 1
  ) {
    failController(
      CONTROLLER_ERROR_CODES.INVALID_DELAY_CONFIG,
      'timingRandom() must return a finite number from 0 inclusive to 1 exclusive.',
    );
  }

  return minimum + Math.floor(randomValue * (maximum - minimum + 1));
}
