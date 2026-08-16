import {
  ACTIONS,
  INNINGS_STATUS,
  OUTCOMES,
  PARTICIPANTS,
  PHASES,
  RESULT_REASONS,
  ROLES,
} from './constants.js';
import { createGame } from './createGame.js';
import { ERROR_CODES, fail } from './errors.js';
import {
  calculateDelivery,
  calculateToss,
  getComplementaryParity,
  getComplementaryRole,
  getOpponent,
  validateParity,
  validateParticipant,
  validateRole,
} from './rules.js';

function assertPhase(state, allowedPhases) {
  if (!allowedPhases.includes(state.phase)) {
    fail(
      ERROR_CODES.INVALID_PHASE,
      `Action is not valid during the ${state.phase} phase.`,
    );
  }
}

function assertResolutionToken(state, payload) {
  if (payload.matchId !== state.matchId) {
    fail(ERROR_CODES.STALE_ROUND, 'Resolution belongs to a different match.');
  }

  if (state.resolvedRoundIds.includes(payload.roundId)) {
    fail(ERROR_CODES.ROUND_ALREADY_RESOLVED, 'This round has already been resolved.');
  }

  if (payload.roundId !== state.currentRoundId) {
    fail(ERROR_CODES.STALE_ROUND, 'Resolution does not match the current round.');
  }
}

function createInnings({ number, batter, bowler, target = null }) {
  return {
    number,
    batter,
    bowler,
    score: 0,
    target,
    status: INNINGS_STATUS.ACTIVE,
    deliveries: [],
  };
}

function createResult(winner, reason) {
  if (winner === null) {
    return {
      outcome: OUTCOMES.DRAW,
      winner: null,
      reason,
    };
  }

  return {
    outcome: winner === PARTICIPANTS.PLAYER ? OUTCOMES.PLAYER_WIN : OUTCOMES.COMPUTER_WIN,
    winner,
    reason,
  };
}

function withRevealedHistory(state, playerNumber, computerNumber) {
  return {
    playerNumbers: [...state.history.playerNumbers, playerNumber],
    computerNumbers: [...state.history.computerNumbers, computerNumber],
  };
}

function selectParity(state, payload) {
  assertPhase(state, [PHASES.PARITY_SELECTION]);
  const parity = validateParity(payload.parity);

  return {
    ...state,
    phase: PHASES.TOSS_WAITING,
    player: {
      ...state.player,
      parity,
    },
    computer: {
      ...state.computer,
      parity: getComplementaryParity(parity),
    },
  };
}

function resolveToss(state, payload) {
  assertResolutionToken(state, payload);
  assertPhase(state, [PHASES.TOSS_WAITING]);

  const toss = calculateToss(
    state.player.parity,
    payload.playerNumber,
    payload.computerNumber,
  );

  return {
    ...state,
    phase: PHASES.TOSS_REVEAL,
    toss,
    resolvedRoundIds: [...state.resolvedRoundIds, state.currentRoundId],
    history: withRevealedHistory(state, payload.playerNumber, payload.computerNumber),
  };
}

function chooseFirstRole(state, payload) {
  assertPhase(state, [PHASES.ROLE_SELECTION]);

  const actor = validateParticipant(payload.actor);
  const selectedRole = validateRole(payload.role);

  if (actor !== state.toss.winner) {
    fail(ERROR_CODES.NOT_TOSS_WINNER, 'Only the toss winner may choose the first role.');
  }

  const opponent = getOpponent(actor);
  const opponentRole = getComplementaryRole(selectedRole);
  const roles = {
    [actor]: selectedRole,
    [opponent]: opponentRole,
  };
  const batter =
    roles[PARTICIPANTS.PLAYER] === ROLES.BAT
      ? PARTICIPANTS.PLAYER
      : PARTICIPANTS.COMPUTER;
  const bowler = getOpponent(batter);

  return {
    ...state,
    phase: PHASES.FIRST_INNINGS,
    player: {
      ...state.player,
      role: roles[PARTICIPANTS.PLAYER],
    },
    computer: {
      ...state.computer,
      role: roles[PARTICIPANTS.COMPUTER],
    },
    innings: [createInnings({ number: 1, batter, bowler })],
    currentRoundId: state.currentRoundId + 1,
  };
}

function advancePresentation(state) {
  if (state.phase === PHASES.TOSS_REVEAL) {
    return {
      ...state,
      phase: PHASES.ROLE_SELECTION,
    };
  }

  if (state.phase === PHASES.INNINGS_BREAK) {
    const firstInnings = state.innings[0];
    const secondBatter = firstInnings.bowler;
    const secondBowler = firstInnings.batter;

    return {
      ...state,
      phase: PHASES.SECOND_INNINGS,
      player: {
        ...state.player,
        role: getComplementaryRole(state.player.role),
      },
      computer: {
        ...state.computer,
        role: getComplementaryRole(state.computer.role),
      },
      innings: [
        ...state.innings,
        createInnings({
          number: 2,
          batter: secondBatter,
          bowler: secondBowler,
          target: firstInnings.score + 1,
        }),
      ],
      currentRoundId: state.currentRoundId + 1,
    };
  }

  fail(
    ERROR_CODES.INVALID_PHASE,
    `There is no presentation to advance during the ${state.phase} phase.`,
  );
}

function resolveDelivery(state, payload) {
  assertResolutionToken(state, payload);
  assertPhase(state, [PHASES.FIRST_INNINGS, PHASES.SECOND_INNINGS]);

  const inningsIndex = state.innings.length - 1;
  const currentInnings = state.innings[inningsIndex];
  const delivery = calculateDelivery({
    roundId: state.currentRoundId,
    batter: currentInnings.batter,
    currentScore: currentInnings.score,
    playerNumber: payload.playerNumber,
    computerNumber: payload.computerNumber,
  });
  const targetReached =
    state.phase === PHASES.SECOND_INNINGS &&
    !delivery.isOut &&
    delivery.scoreAfter >= currentInnings.target;
  const inningsComplete = delivery.isOut || targetReached;
  const resolvedInnings = {
    ...currentInnings,
    score: delivery.scoreAfter,
    status: inningsComplete ? INNINGS_STATUS.COMPLETE : INNINGS_STATUS.ACTIVE,
    deliveries: [...currentInnings.deliveries, delivery],
  };
  const innings = state.innings.map((entry, index) =>
    index === inningsIndex ? resolvedInnings : entry,
  );
  const commonState = {
    ...state,
    innings,
    resolvedRoundIds: [...state.resolvedRoundIds, state.currentRoundId],
    history: withRevealedHistory(state, payload.playerNumber, payload.computerNumber),
  };

  if (targetReached) {
    return {
      ...commonState,
      phase: PHASES.MATCH_OVER,
      result: createResult(currentInnings.batter, RESULT_REASONS.TARGET_REACHED),
    };
  }

  if (!delivery.isOut) {
    return {
      ...commonState,
      currentRoundId: state.currentRoundId + 1,
    };
  }

  if (state.phase === PHASES.FIRST_INNINGS) {
    return {
      ...commonState,
      phase: PHASES.INNINGS_BREAK,
    };
  }

  const firstInnings = state.innings[0];
  const scoresLevel = resolvedInnings.score === firstInnings.score;

  return {
    ...commonState,
    phase: PHASES.MATCH_OVER,
    result: scoresLevel
      ? createResult(null, RESULT_REASONS.SCORES_LEVEL)
      : createResult(firstInnings.batter, RESULT_REASONS.DISMISSED_BELOW_TARGET),
  };
}

function newMatch(state, payload) {
  const nextGame = createGame(payload);

  if (nextGame.matchId === state.matchId) {
    fail(ERROR_CODES.MATCH_ID_REUSED, 'A new match requires a new matchId.');
  }

  return nextGame;
}

export function gameReducer(state, action) {
  if (!state || !action || typeof action.type !== 'string') {
    fail(ERROR_CODES.INVALID_ACTION, 'Reducer requires a state and typed action.');
  }

  if (state.phase === PHASES.MATCH_OVER && action.type !== ACTIONS.NEW_MATCH) {
    fail(ERROR_CODES.MATCH_ALREADY_OVER, 'A completed match cannot be changed.');
  }

  const payload = action.payload ?? {};

  switch (action.type) {
    case ACTIONS.SELECT_PARITY:
      return selectParity(state, payload);
    case ACTIONS.RESOLVE_TOSS:
      return resolveToss(state, payload);
    case ACTIONS.ADVANCE_PRESENTATION:
      return advancePresentation(state);
    case ACTIONS.CHOOSE_FIRST_ROLE:
      return chooseFirstRole(state, payload);
    case ACTIONS.RESOLVE_DELIVERY:
      return resolveDelivery(state, payload);
    case ACTIONS.NEW_MATCH:
      return newMatch(state, payload);
    default:
      fail(ERROR_CODES.INVALID_ACTION, `Unknown action type: ${action.type}`);
  }
}
