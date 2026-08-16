import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PLAYER_NAME,
  DIFFICULTIES,
  ERROR_CODES,
  PHASES,
  createGame,
} from '../../src/game/index.js';
import { createInitialGame, deepFreeze, expectEngineError } from './helpers.js';

describe('createGame', () => {
  it('creates the canonical deterministic initial state', () => {
    const state = createInitialGame({
      matchId: 'exhibition-1',
      playerName: '  Dee  ',
      difficulty: DIFFICULTIES.HARD,
    });

    expect(state).toEqual({
      matchId: 'exhibition-1',
      phase: PHASES.PARITY_SELECTION,
      difficulty: DIFFICULTIES.HARD,
      player: { name: 'Dee', parity: null, role: null },
      computer: { parity: null, role: null },
      toss: {
        playerNumber: null,
        computerNumber: null,
        sum: null,
        winningParity: null,
        winner: null,
      },
      innings: [],
      currentRoundId: 1,
      resolvedRoundIds: [],
      history: { playerNumbers: [], computerNumbers: [] },
      result: null,
    });
  });

  it.each([undefined, null, '', '   ', 42])(
    'defaults a non-usable player name (%s) safely',
    (playerName) => {
      expect(createInitialGame({ playerName }).player.name).toBe(DEFAULT_PLAYER_NAME);
    },
  );

  it.each(Object.values(DIFFICULTIES))('accepts the %s difficulty', (difficulty) => {
    expect(createInitialGame({ difficulty }).difficulty).toBe(difficulty);
  });

  it.each(['NORMAL', '', null, undefined, 1])(
    'rejects invalid difficulty %s',
    (difficulty) => {
      expectEngineError(
        () => createGame({ matchId: 'match', playerName: 'P', difficulty }),
        ERROR_CODES.INVALID_DIFFICULTY,
      );
    },
  );

  it.each([undefined, null, '', '  ', NaN, Infinity, {}, []])(
    'rejects invalid matchId %s',
    (matchId) => {
      expectEngineError(
        () => createGame({ matchId, difficulty: DIFFICULTIES.EASY }),
        ERROR_CODES.INVALID_MATCH_ID,
      );
    },
  );

  it('does not mutate the supplied configuration', () => {
    const configuration = deepFreeze({
      matchId: 'immutable-config',
      playerName: '  Visitor  ',
      difficulty: DIFFICULTIES.MEDIUM,
    });
    const before = structuredClone(configuration);

    createGame(configuration);

    expect(configuration).toEqual(before);
  });
});
