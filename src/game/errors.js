export const ERROR_CODES = Object.freeze({
  INVALID_ACTION: 'INVALID_ACTION',
  INVALID_PHASE: 'INVALID_PHASE',
  INVALID_NUMBER: 'INVALID_NUMBER',
  INVALID_PARITY: 'INVALID_PARITY',
  INVALID_ROLE: 'INVALID_ROLE',
  INVALID_ACTOR: 'INVALID_ACTOR',
  INVALID_DIFFICULTY: 'INVALID_DIFFICULTY',
  INVALID_MATCH_ID: 'INVALID_MATCH_ID',
  MATCH_ID_REUSED: 'MATCH_ID_REUSED',
  NOT_TOSS_WINNER: 'NOT_TOSS_WINNER',
  STALE_ROUND: 'STALE_ROUND',
  ROUND_ALREADY_RESOLVED: 'ROUND_ALREADY_RESOLVED',
  MATCH_ALREADY_OVER: 'MATCH_ALREADY_OVER',
});

export class GameEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameEngineError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new GameEngineError(code, message);
}
