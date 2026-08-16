import { DIFFICULTIES } from '../game/constants.js';
import { BOT_CONTEXTS } from './constants.js';
import { BOT_ERROR_CODES, failBot } from './errors.js';
import { validateHistory } from './probability.js';
import { readRandom } from './random.js';
import { chooseEasy, chooseHard, chooseMedium } from './strategies.js';

const EXPECTED_PROPERTIES = Object.freeze([
  'difficulty',
  'context',
  'visibleHistory',
  'random',
]);

function validateInputShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    failBot(BOT_ERROR_CODES.UNEXPECTED_INPUT, 'Bot input must be an object.');
  }

  const unexpectedProperties = Object.keys(input).filter(
    (property) => !EXPECTED_PROPERTIES.includes(property),
  );

  if (unexpectedProperties.length > 0) {
    failBot(
      BOT_ERROR_CODES.UNEXPECTED_INPUT,
      `Unexpected bot input: ${unexpectedProperties.join(', ')}.`,
    );
  }
}

function validateDifficulty(difficulty) {
  if (!Object.values(DIFFICULTIES).includes(difficulty)) {
    failBot(BOT_ERROR_CODES.INVALID_DIFFICULTY, 'Difficulty is invalid.');
  }
}

function validateContext(context) {
  if (!Object.values(BOT_CONTEXTS).includes(context)) {
    failBot(BOT_ERROR_CODES.INVALID_CONTEXT, 'Bot context is invalid.');
  }
}

/**
 * Chooses 1-6 using only previously revealed human choices.
 * Every successful call consumes exactly one value from random().
 */
export function chooseComputerNumber(input) {
  validateInputShape(input);
  const { difficulty, context, visibleHistory, random } = input;
  validateDifficulty(difficulty);
  validateContext(context);
  const safeHistory = validateHistory(visibleHistory);
  const randomValue = readRandom(random);

  if (context === BOT_CONTEXTS.TOSS || difficulty === DIFFICULTIES.EASY) {
    return chooseEasy(randomValue);
  }

  if (difficulty === DIFFICULTIES.MEDIUM) {
    return chooseMedium({ context, visibleHistory: safeHistory, randomValue });
  }

  return chooseHard({ context, visibleHistory: safeHistory, randomValue });
}
