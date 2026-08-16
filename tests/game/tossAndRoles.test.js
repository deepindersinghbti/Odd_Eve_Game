import { describe, expect, it } from 'vitest';

import {
  ACTIONS,
  ERROR_CODES,
  PARITIES,
  PARTICIPANTS,
  PHASES,
  ROLES,
  gameReducer,
} from '../../src/game/index.js';
import {
  chooseParity,
  createInitialGame,
  expectEngineError,
  reachRoleSelection,
  resolveToss,
} from './helpers.js';

const numberPairs = Array.from({ length: 6 }, (_, playerIndex) =>
  Array.from({ length: 6 }, (_, computerIndex) => [playerIndex + 1, computerIndex + 1]),
).flat();

const invalidNumbers = [0, 7, -1, 1.5, '3', null, undefined, NaN];

describe('parity and toss', () => {
  it.each([
    [PARITIES.ODD, PARITIES.EVEN],
    [PARITIES.EVEN, PARITIES.ODD],
  ])('assigns complementary parity for %s', (playerParity, computerParity) => {
    const state = chooseParity(createInitialGame(), playerParity);

    expect(state.phase).toBe(PHASES.TOSS_WAITING);
    expect(state.player.parity).toBe(playerParity);
    expect(state.computer.parity).toBe(computerParity);
  });

  it.each(['odd', '', null, undefined, 1])('rejects invalid parity %s', (parity) => {
    expectEngineError(
      () => chooseParity(createInitialGame(), parity),
      ERROR_CODES.INVALID_PARITY,
    );
  });

  it.each(numberPairs)(
    'resolves toss pair player=%i computer=%i',
    (playerNumber, computerNumber) => {
      const state = resolveToss(
        chooseParity(createInitialGame(), PARITIES.ODD),
        playerNumber,
        computerNumber,
      );
      const sum = playerNumber + computerNumber;
      const winningParity = sum % 2 === 0 ? PARITIES.EVEN : PARITIES.ODD;

      expect(state.phase).toBe(PHASES.TOSS_REVEAL);
      expect(state.toss).toEqual({
        playerNumber,
        computerNumber,
        sum,
        winningParity,
        winner:
          winningParity === PARITIES.ODD ? PARTICIPANTS.PLAYER : PARTICIPANTS.COMPUTER,
      });
      expect(state.history).toEqual({
        playerNumbers: [playerNumber],
        computerNumbers: [computerNumber],
      });
    },
  );

  it.each(invalidNumbers)('rejects invalid player toss number %s', (number) => {
    const state = chooseParity(createInitialGame());
    expectEngineError(() => resolveToss(state, number, 1), ERROR_CODES.INVALID_NUMBER);
  });

  it.each(invalidNumbers)('rejects invalid computer toss number %s', (number) => {
    const state = chooseParity(createInitialGame());
    expectEngineError(() => resolveToss(state, 1, number), ERROR_CODES.INVALID_NUMBER);
  });

  it('moves from toss reveal to role selection explicitly', () => {
    let state = chooseParity(createInitialGame());
    state = resolveToss(state);

    state = gameReducer(state, { type: ACTIONS.ADVANCE_PRESENTATION });

    expect(state.phase).toBe(PHASES.ROLE_SELECTION);
  });

  it('rejects resolving the same toss round twice', () => {
    const waiting = chooseParity(createInitialGame());
    const resolved = resolveToss(waiting);

    expectEngineError(
      () =>
        gameReducer(resolved, {
          type: ACTIONS.RESOLVE_TOSS,
          payload: {
            matchId: waiting.matchId,
            roundId: waiting.currentRoundId,
            playerNumber: 1,
            computerNumber: 2,
          },
        }),
      ERROR_CODES.ROUND_ALREADY_RESOLVED,
    );
  });
});

describe('first role selection', () => {
  it.each([
    [PARTICIPANTS.PLAYER, ROLES.BAT, PARTICIPANTS.PLAYER],
    [PARTICIPANTS.PLAYER, ROLES.BOWL, PARTICIPANTS.COMPUTER],
    [PARTICIPANTS.COMPUTER, ROLES.BAT, PARTICIPANTS.COMPUTER],
    [PARTICIPANTS.COMPUTER, ROLES.BOWL, PARTICIPANTS.PLAYER],
  ])(
    '%s toss winner choosing %s creates the correct first batter',
    (winner, role, expectedBatter) => {
      const state = gameReducer(reachRoleSelection({ winner }), {
        type: ACTIONS.CHOOSE_FIRST_ROLE,
        payload: { actor: winner, role },
      });
      const expectedBowler =
        expectedBatter === PARTICIPANTS.PLAYER
          ? PARTICIPANTS.COMPUTER
          : PARTICIPANTS.PLAYER;

      expect(state.phase).toBe(PHASES.FIRST_INNINGS);
      expect(state.innings[0]).toMatchObject({
        number: 1,
        batter: expectedBatter,
        bowler: expectedBowler,
        score: 0,
        target: null,
      });
      expect(state.player.role).toBe(
        expectedBatter === PARTICIPANTS.PLAYER ? ROLES.BAT : ROLES.BOWL,
      );
      expect(state.computer.role).toBe(
        expectedBatter === PARTICIPANTS.COMPUTER ? ROLES.BAT : ROLES.BOWL,
      );
      expect(state.currentRoundId).toBe(2);
    },
  );

  it('rejects a role choice from the toss loser', () => {
    const state = reachRoleSelection({ winner: PARTICIPANTS.PLAYER });

    expectEngineError(
      () =>
        gameReducer(state, {
          type: ACTIONS.CHOOSE_FIRST_ROLE,
          payload: { actor: PARTICIPANTS.COMPUTER, role: ROLES.BAT },
        }),
      ERROR_CODES.NOT_TOSS_WINNER,
    );
  });

  it.each(['FIELD', '', null, undefined, 1])('rejects invalid role %s', (role) => {
    const state = reachRoleSelection();
    expectEngineError(
      () =>
        gameReducer(state, {
          type: ACTIONS.CHOOSE_FIRST_ROLE,
          payload: { actor: PARTICIPANTS.PLAYER, role },
        }),
      ERROR_CODES.INVALID_ROLE,
    );
  });

  it('rejects an invalid role-selection actor', () => {
    const state = reachRoleSelection();
    expectEngineError(
      () =>
        gameReducer(state, {
          type: ACTIONS.CHOOSE_FIRST_ROLE,
          payload: { actor: 'HUMAN', role: ROLES.BAT },
        }),
      ERROR_CODES.INVALID_ACTOR,
    );
  });
});
