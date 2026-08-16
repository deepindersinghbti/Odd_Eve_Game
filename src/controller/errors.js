import { BotError } from '../bot/index.js';
import { GameEngineError } from '../game/index.js';

export const CONTROLLER_ERROR_CODES = Object.freeze({
  CONTROLLER_DESTROYED: 'CONTROLLER_DESTROYED',
  OPERATION_PENDING: 'OPERATION_PENDING',
  NOTHING_TO_ADVANCE: 'NOTHING_TO_ADVANCE',
  INVALID_DELAY_CONFIG: 'INVALID_DELAY_CONFIG',
  INVALID_DEPENDENCY: 'INVALID_DEPENDENCY',
  MATCH_NOT_STARTED: 'MATCH_NOT_STARTED',
});

export class ControllerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ControllerError';
    this.code = code;
  }
}

export function failController(code, message) {
  throw new ControllerError(code, message);
}

export function isExpectedDomainError(error) {
  return (
    error instanceof ControllerError ||
    error instanceof GameEngineError ||
    error instanceof BotError
  );
}

export function toPublicError(error) {
  return {
    code: error.code,
    message: error.message,
  };
}
