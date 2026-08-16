import { describe, expect, it } from 'vitest';

import {
  ACTIONS,
  DIFFICULTIES,
  ERROR_CODES,
  OUTCOMES,
  PARTICIPANTS,
  PHASES,
  RESULT_REASONS,
  canSelectNumber,
  gameReducer,
  getCurrentBatter,
  getCurrentInnings,
  getCurrentScore,
  getFinalResult,
  getFirstInningsScore,
  getRecentDeliveries,
  getRunsNeeded,
  getTarget,
  isPlayerBatting,
} from '../../src/game/index.js';
import {
  addRuns,
  chooseParity,
  createInitialGame,
  deepFreeze,
  dismiss,
  expectEngineError,
  resolveDelivery,
  startFirstInnings,
  startSecondInnings,
} from './helpers.js';

describe('phase and round safety', () => {
  it('rejects an action in the wrong phase', () => {
    const state = createInitialGame();

    expectEngineError(() => resolveDelivery(state, 1, 2), ERROR_CODES.INVALID_PHASE);
  });

  it('rejects a duplicate resolution without changing the new round', () => {
    const state = startFirstInnings();
    const duplicateTokens = {
      matchId: state.matchId,
      roundId: state.currentRoundId,
    };
    const resolved = resolveDelivery(state, 2, 3);
    const nextRoundId = resolved.currentRoundId;

    expectEngineError(
      () => resolveDelivery(resolved, 2, 3, duplicateTokens),
      ERROR_CODES.ROUND_ALREADY_RESOLVED,
    );
    expect(resolved.currentRoundId).toBe(nextRoundId);
  });

  it('rejects an unknown stale round', () => {
    const state = startFirstInnings();

    expectEngineError(
      () =>
        resolveDelivery(state, 2, 3, {
          roundId: state.currentRoundId + 100,
        }),
      ERROR_CODES.STALE_ROUND,
    );
  });

  it('rejects invalid delivery input without changing state', () => {
    const state = startFirstInnings();
    const before = structuredClone(state);

    expectEngineError(() => resolveDelivery(state, 0, 2), ERROR_CODES.INVALID_NUMBER);
    expect(state).toEqual(before);
  });

  it('does not mutate deeply frozen state or action payloads', () => {
    const state = deepFreeze(startFirstInnings());
    const action = deepFreeze({
      type: ACTIONS.RESOLVE_DELIVERY,
      payload: {
        matchId: state.matchId,
        roundId: state.currentRoundId,
        playerNumber: 2,
        computerNumber: 3,
      },
    });
    const before = structuredClone(state);

    const nextState = gameReducer(state, action);

    expect(state).toEqual(before);
    expect(nextState).not.toBe(state);
    expect(nextState.innings).not.toBe(state.innings);
    expect(nextState.innings[0].deliveries).not.toBe(state.innings[0].deliveries);
    expect(nextState.history.playerNumbers).not.toBe(state.history.playerNumbers);
  });

  it('prevents an old match token from modifying a new match', () => {
    const oldState = chooseParity(createInitialGame({ matchId: 'old-match' }));
    let newState = gameReducer(oldState, {
      type: ACTIONS.NEW_MATCH,
      payload: {
        matchId: 'new-match',
        playerName: 'New visitor',
        difficulty: DIFFICULTIES.EASY,
      },
    });
    newState = chooseParity(newState);

    expectEngineError(
      () =>
        gameReducer(newState, {
          type: ACTIONS.RESOLVE_TOSS,
          payload: {
            matchId: oldState.matchId,
            roundId: oldState.currentRoundId,
            playerNumber: 1,
            computerNumber: 2,
          },
        }),
      ERROR_CODES.STALE_ROUND,
    );
  });

  it('creates a clean new match with a new caller-supplied ID', () => {
    const playedState = resolveDelivery(startFirstInnings(), 2, 3);

    const reset = gameReducer(playedState, {
      type: ACTIONS.NEW_MATCH,
      payload: {
        matchId: 'match-2',
        playerName: '',
        difficulty: DIFFICULTIES.HARD,
      },
    });

    expect(reset).toMatchObject({
      matchId: 'match-2',
      phase: PHASES.PARITY_SELECTION,
      difficulty: DIFFICULTIES.HARD,
      currentRoundId: 1,
      resolvedRoundIds: [],
      innings: [],
      history: { playerNumbers: [], computerNumbers: [] },
      result: null,
    });
  });

  it('rejects reusing a match ID for NEW_MATCH', () => {
    const state = createInitialGame({ matchId: 'same-match' });

    expectEngineError(
      () =>
        gameReducer(state, {
          type: ACTIONS.NEW_MATCH,
          payload: {
            matchId: 'same-match',
            playerName: 'Player',
            difficulty: DIFFICULTIES.MEDIUM,
          },
        }),
      ERROR_CODES.MATCH_ID_REUSED,
    );
  });

  it('allows only NEW_MATCH to transition from Match Over', () => {
    let finished = startSecondInnings({
      firstBatter: PARTICIPANTS.COMPUTER,
      firstScore: 0,
    });
    finished = addRuns(finished, 1);

    const reset = gameReducer(finished, {
      type: ACTIONS.NEW_MATCH,
      payload: {
        matchId: 'after-finish',
        playerName: 'Next player',
        difficulty: DIFFICULTIES.MEDIUM,
      },
    });

    expect(reset.phase).toBe(PHASES.PARITY_SELECTION);
    expect(reset.matchId).toBe('after-finish');
  });
});

describe('selectors', () => {
  it('projects current innings, scores, target, batter, and batting status', () => {
    let state = startSecondInnings({
      firstBatter: PARTICIPANTS.COMPUTER,
      firstScore: 3,
    });
    state = addRuns(state, 1);

    expect(getCurrentInnings(state)).toBe(state.innings[1]);
    expect(getFirstInningsScore(state)).toBe(3);
    expect(getCurrentScore(state)).toBe(1);
    expect(getTarget(state)).toBe(4);
    expect(getRunsNeeded(state)).toBe(3);
    expect(getCurrentBatter(state)).toBe(PARTICIPANTS.PLAYER);
    expect(isPlayerBatting(state)).toBe(true);
    expect(canSelectNumber(state)).toBe(true);
  });

  it('returns the final structured result', () => {
    let state = startSecondInnings({
      firstBatter: PARTICIPANTS.PLAYER,
      firstScore: 2,
    });
    state = dismiss(state);

    expect(getFinalResult(state)).toEqual({
      outcome: OUTCOMES.PLAYER_WIN,
      winner: PARTICIPANTS.PLAYER,
      reason: RESULT_REASONS.DISMISSED_BELOW_TARGET,
    });
    expect(canSelectNumber(state)).toBe(false);
  });

  it('clamps runs needed at zero', () => {
    const state = startSecondInnings({ firstScore: 2 });
    const projectedState = {
      ...state,
      innings: [
        state.innings[0],
        {
          ...state.innings[1],
          score: 5,
        },
      ],
    };

    expect(getRunsNeeded(projectedState)).toBe(0);
  });

  it('returns null target and runs needed before the chase', () => {
    const state = startFirstInnings();

    expect(getTarget(state)).toBeNull();
    expect(getRunsNeeded(state)).toBeNull();
  });

  it('returns recent deliveries across innings in chronological order', () => {
    let state = startSecondInnings({ firstScore: 2 });
    state = addRuns(state, 2);

    const recent = getRecentDeliveries(state, 3);

    expect(recent).toHaveLength(3);
    expect(recent.map((delivery) => delivery.roundId)).toEqual(
      state.innings
        .flatMap((innings) => innings.deliveries)
        .slice(-3)
        .map((delivery) => delivery.roundId),
    );
    expect(getRecentDeliveries(state, 0)).toEqual([]);
  });
});
