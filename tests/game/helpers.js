import { expect } from 'vitest';

import {
  ACTIONS,
  DIFFICULTIES,
  GameEngineError,
  PARITIES,
  PARTICIPANTS,
  PHASES,
  ROLES,
  createGame,
  gameReducer,
} from '../../src/game/index.js';

export function expectEngineError(callback, code) {
  try {
    callback();
  } catch (error) {
    expect(error).toBeInstanceOf(GameEngineError);
    expect(error.code).toBe(code);
    return error;
  }

  throw new Error(`Expected GameEngineError with code ${code}.`);
}

export function createInitialGame(overrides = {}) {
  return createGame({
    matchId: 'match-1',
    playerName: 'Player',
    difficulty: DIFFICULTIES.MEDIUM,
    ...overrides,
  });
}

export function chooseParity(state, parity) {
  const selectedParity = arguments.length >= 2 ? parity : PARITIES.ODD;

  return gameReducer(state, {
    type: ACTIONS.SELECT_PARITY,
    payload: { parity: selectedParity },
  });
}

export function resolveToss(state, playerNumber, computerNumber) {
  const selectedPlayerNumber = arguments.length >= 2 ? playerNumber : 1;
  const selectedComputerNumber = arguments.length >= 3 ? computerNumber : 2;

  return gameReducer(state, {
    type: ACTIONS.RESOLVE_TOSS,
    payload: {
      matchId: state.matchId,
      roundId: state.currentRoundId,
      playerNumber: selectedPlayerNumber,
      computerNumber: selectedComputerNumber,
    },
  });
}

export function reachRoleSelection({ winner = PARTICIPANTS.PLAYER } = {}) {
  const parity = winner === PARTICIPANTS.PLAYER ? PARITIES.ODD : PARITIES.EVEN;
  let state = chooseParity(createInitialGame(), parity);
  state = resolveToss(state, 1, 2);
  return gameReducer(state, { type: ACTIONS.ADVANCE_PRESENTATION });
}

export function startFirstInnings({
  batter = PARTICIPANTS.PLAYER,
  matchId = 'match-1',
} = {}) {
  let state = chooseParity(createInitialGame({ matchId }), PARITIES.ODD);
  state = resolveToss(state, 1, 2);
  state = gameReducer(state, { type: ACTIONS.ADVANCE_PRESENTATION });

  return gameReducer(state, {
    type: ACTIONS.CHOOSE_FIRST_ROLE,
    payload: {
      actor: PARTICIPANTS.PLAYER,
      role: batter === PARTICIPANTS.PLAYER ? ROLES.BAT : ROLES.BOWL,
    },
  });
}

export function resolveDelivery(state, playerNumber, computerNumber, tokens = {}) {
  return gameReducer(state, {
    type: ACTIONS.RESOLVE_DELIVERY,
    payload: {
      matchId: state.matchId,
      roundId: state.currentRoundId,
      playerNumber,
      computerNumber,
      ...tokens,
    },
  });
}

export function addSingleRun(state) {
  const batter = state.innings.at(-1).batter;
  return batter === PARTICIPANTS.PLAYER
    ? resolveDelivery(state, 1, 2)
    : resolveDelivery(state, 2, 1);
}

export function addRuns(state, count) {
  let nextState = state;
  for (let index = 0; index < count; index += 1) {
    nextState = addSingleRun(nextState);
  }
  return nextState;
}

export function dismiss(state, number = 1) {
  return resolveDelivery(state, number, number);
}

export function startSecondInnings({
  firstBatter = PARTICIPANTS.PLAYER,
  firstScore = 0,
  matchId = 'match-1',
} = {}) {
  let state = startFirstInnings({ batter: firstBatter, matchId });
  state = addRuns(state, firstScore);
  state = dismiss(state);
  expect(state.phase).toBe(PHASES.INNINGS_BREAK);
  return gameReducer(state, { type: ACTIONS.ADVANCE_PRESENTATION });
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
