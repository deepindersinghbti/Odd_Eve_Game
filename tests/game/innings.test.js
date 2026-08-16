import { describe, expect, it } from 'vitest';

import {
  ACTIONS,
  ERROR_CODES,
  OUTCOMES,
  PARTICIPANTS,
  PHASES,
  RESULT_REASONS,
  ROLES,
  gameReducer,
} from '../../src/game/index.js';
import {
  addRuns,
  dismiss,
  expectEngineError,
  resolveDelivery,
  startFirstInnings,
  startSecondInnings,
} from './helpers.js';

describe('innings transitions', () => {
  it('handles a first-ball dismissal at zero', () => {
    const state = dismiss(startFirstInnings());

    expect(state.phase).toBe(PHASES.INNINGS_BREAK);
    expect(state.innings[0].score).toBe(0);
    expect(state.innings[0].deliveries[0]).toMatchObject({
      runsAdded: 0,
      isOut: true,
      scoreAfter: 0,
    });
  });

  it('accumulates a multi-delivery first innings without mutation', () => {
    let state = startFirstInnings({ batter: PARTICIPANTS.PLAYER });
    state = resolveDelivery(state, 2, 6);
    state = resolveDelivery(state, 3, 6);
    state = dismiss(state, 4);

    expect(state.phase).toBe(PHASES.INNINGS_BREAK);
    expect(state.innings[0].score).toBe(5);
    expect(state.innings[0].deliveries.map((delivery) => delivery.runsAdded)).toEqual([
      2, 3, 0,
    ]);
  });

  it('reverses roles and creates the exact target after the break', () => {
    let state = addRuns(startFirstInnings({ batter: PARTICIPANTS.PLAYER }), 3);
    state = dismiss(state);
    const dismissalRound = state.currentRoundId;

    state = gameReducer(state, { type: ACTIONS.ADVANCE_PRESENTATION });

    expect(state.phase).toBe(PHASES.SECOND_INNINGS);
    expect(state.player.role).toBe(ROLES.BOWL);
    expect(state.computer.role).toBe(ROLES.BAT);
    expect(state.innings[1]).toMatchObject({
      number: 2,
      batter: PARTICIPANTS.COMPUTER,
      bowler: PARTICIPANTS.PLAYER,
      score: 0,
      target: 4,
    });
    expect(state.currentRoundId).toBe(dismissalRound + 1);
  });
});

describe('chase results', () => {
  it.each([
    [PARTICIPANTS.PLAYER, OUTCOMES.PLAYER_WIN],
    [PARTICIPANTS.COMPUTER, OUTCOMES.COMPUTER_WIN],
  ])('%s reaches the target and wins', (chaser, outcome) => {
    const firstBatter =
      chaser === PARTICIPANTS.PLAYER ? PARTICIPANTS.COMPUTER : PARTICIPANTS.PLAYER;
    let state = startSecondInnings({ firstBatter, firstScore: 2 });
    state = addRuns(state, 3);

    expect(state.phase).toBe(PHASES.MATCH_OVER);
    expect(state.result).toEqual({
      outcome,
      winner: chaser,
      reason: RESULT_REASONS.TARGET_REACHED,
    });
    expect(state.innings[1].score).toBe(3);
  });

  it.each([
    [PARTICIPANTS.PLAYER, PARTICIPANTS.COMPUTER, OUTCOMES.COMPUTER_WIN],
    [PARTICIPANTS.COMPUTER, PARTICIPANTS.PLAYER, OUTCOMES.PLAYER_WIN],
  ])('%s is dismissed below target and %s wins', (chaser, firstBatter, outcome) => {
    let state = startSecondInnings({ firstBatter, firstScore: 3 });
    expect(state.innings[1].batter).toBe(chaser);
    state = dismiss(state);

    expect(state.result).toEqual({
      outcome,
      winner: firstBatter,
      reason: RESULT_REASONS.DISMISSED_BELOW_TARGET,
    });
    expect(state.innings[1].score).toBe(0);
  });

  it.each([PARTICIPANTS.PLAYER, PARTICIPANTS.COMPUTER])(
    '%s is dismissed with scores level and draws',
    (chaser) => {
      const firstBatter =
        chaser === PARTICIPANTS.PLAYER ? PARTICIPANTS.COMPUTER : PARTICIPANTS.PLAYER;
      let state = startSecondInnings({ firstBatter, firstScore: 2 });
      state = addRuns(state, 2);
      state = dismiss(state);

      expect(state.phase).toBe(PHASES.MATCH_OVER);
      expect(state.result).toEqual({
        outcome: OUTCOMES.DRAW,
        winner: null,
        reason: RESULT_REASONS.SCORES_LEVEL,
      });
      expect(state.innings[1].deliveries.at(-1).runsAdded).toBe(0);
    },
  );

  it('ends immediately when one scoring delivery reaches the target', () => {
    let state = startSecondInnings({
      firstBatter: PARTICIPANTS.COMPUTER,
      firstScore: 2,
    });
    const targetRound = state.currentRoundId;

    state = resolveDelivery(state, 3, 4);

    expect(state.phase).toBe(PHASES.MATCH_OVER);
    expect(state.innings[1].score).toBe(3);
    expect(state.currentRoundId).toBe(targetRound);
    expect(state.resolvedRoundIds).toContain(targetRound);
  });

  it('rejects every additional delivery after match over', () => {
    let state = startSecondInnings({
      firstBatter: PARTICIPANTS.COMPUTER,
      firstScore: 0,
    });
    state = resolveDelivery(state, 1, 2);

    expectEngineError(() => resolveDelivery(state, 2, 3), ERROR_CODES.MATCH_ALREADY_OVER);
  });
});
