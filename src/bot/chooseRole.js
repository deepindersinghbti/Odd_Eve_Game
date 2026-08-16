import { DIFFICULTIES, ROLES } from '../game/constants.js';
import { BOT_ERROR_CODES, failBot } from './errors.js';
import { readRandom } from './random.js';

const EXPECTED_PROPERTIES = Object.freeze(['difficulty', 'random']);

/**
 * Chooses BAT/BOWL uniformly. Every successful call consumes one random value.
 */
export function chooseComputerRole(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    failBot(BOT_ERROR_CODES.UNEXPECTED_INPUT, 'Role input must be an object.');
  }

  const unexpectedProperties = Object.keys(input).filter(
    (property) => !EXPECTED_PROPERTIES.includes(property),
  );
  if (unexpectedProperties.length > 0) {
    failBot(
      BOT_ERROR_CODES.UNEXPECTED_INPUT,
      `Unexpected role input: ${unexpectedProperties.join(', ')}.`,
    );
  }

  if (!Object.values(DIFFICULTIES).includes(input.difficulty)) {
    failBot(BOT_ERROR_CODES.INVALID_DIFFICULTY, 'Difficulty is invalid.');
  }

  return readRandom(input.random) < 0.5 ? ROLES.BAT : ROLES.BOWL;
}
