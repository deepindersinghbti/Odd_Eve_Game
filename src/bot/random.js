import { BOT_ERROR_CODES, failBot } from './errors.js';

const UINT32_RANGE = 0x1_0000_0000;

export function validateRandomSource(random) {
  if (typeof random !== 'function') {
    failBot(BOT_ERROR_CODES.INVALID_RANDOM_SOURCE, 'random must be a function.');
  }

  return random;
}

export function validateRandomValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    failBot(
      BOT_ERROR_CODES.INVALID_RANDOM_VALUE,
      'random() must return a finite number from 0 inclusive to 1 exclusive.',
    );
  }

  return value;
}

export function readRandom(random) {
  validateRandomSource(random);
  return validateRandomValue(random());
}

/**
 * Browser-only randomness adapter. Strategies never access crypto directly.
 */
export function browserRandom() {
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    failBot(
      BOT_ERROR_CODES.INVALID_RANDOM_SOURCE,
      'Browser cryptographic randomness is unavailable.',
    );
  }

  const buffer = new Uint32Array(1);
  cryptoApi.getRandomValues(buffer);
  return buffer[0] / UINT32_RANGE;
}
