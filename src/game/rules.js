import {
  DEFAULT_PLAYER_NAME,
  DIFFICULTIES,
  PARITIES,
  PARTICIPANTS,
  ROLES,
} from './constants.js';
import { ERROR_CODES, fail } from './errors.js';

const values = (object) => Object.values(object);

export function validateMatchId(matchId) {
  const isNonEmptyString = typeof matchId === 'string' && matchId.trim().length > 0;
  const isFiniteNumber = typeof matchId === 'number' && Number.isFinite(matchId);

  if (!isNonEmptyString && !isFiniteNumber) {
    fail(
      ERROR_CODES.INVALID_MATCH_ID,
      'matchId must be a non-empty string or finite number.',
    );
  }

  return matchId;
}

export function normalizePlayerName(playerName) {
  return typeof playerName === 'string' && playerName.trim()
    ? playerName.trim()
    : DEFAULT_PLAYER_NAME;
}

export function validateDifficulty(difficulty) {
  if (!values(DIFFICULTIES).includes(difficulty)) {
    fail(ERROR_CODES.INVALID_DIFFICULTY, 'Difficulty must be EASY, MEDIUM, or HARD.');
  }

  return difficulty;
}

export function validateParity(parity) {
  if (!values(PARITIES).includes(parity)) {
    fail(ERROR_CODES.INVALID_PARITY, 'Parity must be ODD or EVEN.');
  }

  return parity;
}

export function validateRole(role) {
  if (!values(ROLES).includes(role)) {
    fail(ERROR_CODES.INVALID_ROLE, 'Role must be BAT or BOWL.');
  }

  return role;
}

export function validateParticipant(participant) {
  if (!values(PARTICIPANTS).includes(participant)) {
    fail(ERROR_CODES.INVALID_ACTOR, 'Actor must be PLAYER or COMPUTER.');
  }

  return participant;
}

export function validateNumber(number) {
  if (!Number.isInteger(number) || number < 1 || number > 6) {
    fail(
      ERROR_CODES.INVALID_NUMBER,
      'Hand-cricket numbers must be integers from 1 to 6.',
    );
  }

  return number;
}

export function getComplementaryParity(parity) {
  validateParity(parity);
  return parity === PARITIES.ODD ? PARITIES.EVEN : PARITIES.ODD;
}

export function getComplementaryRole(role) {
  validateRole(role);
  return role === ROLES.BAT ? ROLES.BOWL : ROLES.BAT;
}

export function getOpponent(participant) {
  validateParticipant(participant);
  return participant === PARTICIPANTS.PLAYER
    ? PARTICIPANTS.COMPUTER
    : PARTICIPANTS.PLAYER;
}

export function calculateToss(playerParity, playerNumber, computerNumber) {
  validateParity(playerParity);
  validateNumber(playerNumber);
  validateNumber(computerNumber);

  const sum = playerNumber + computerNumber;
  const winningParity = sum % 2 === 0 ? PARITIES.EVEN : PARITIES.ODD;
  const winner =
    playerParity === winningParity ? PARTICIPANTS.PLAYER : PARTICIPANTS.COMPUTER;

  return { playerNumber, computerNumber, sum, winningParity, winner };
}

export function calculateDelivery({
  roundId,
  batter,
  currentScore,
  playerNumber,
  computerNumber,
}) {
  validateParticipant(batter);
  validateNumber(playerNumber);
  validateNumber(computerNumber);

  const batterNumber = batter === PARTICIPANTS.PLAYER ? playerNumber : computerNumber;
  const isOut = playerNumber === computerNumber;
  const runsAdded = isOut ? 0 : batterNumber;
  const scoreAfter = currentScore + runsAdded;

  return {
    roundId,
    playerNumber,
    computerNumber,
    batter,
    batterNumber,
    runsAdded,
    isOut,
    scoreAfter,
  };
}
