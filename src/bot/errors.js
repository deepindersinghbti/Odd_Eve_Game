export const BOT_ERROR_CODES = Object.freeze({
  INVALID_DIFFICULTY: 'INVALID_DIFFICULTY',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
  INVALID_HISTORY: 'INVALID_HISTORY',
  INVALID_RANDOM_SOURCE: 'INVALID_RANDOM_SOURCE',
  INVALID_RANDOM_VALUE: 'INVALID_RANDOM_VALUE',
  INVALID_DISTRIBUTION: 'INVALID_DISTRIBUTION',
  UNEXPECTED_INPUT: 'UNEXPECTED_INPUT',
});

export class BotError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BotError';
    this.code = code;
  }
}

export function failBot(code, message) {
  throw new BotError(code, message);
}
