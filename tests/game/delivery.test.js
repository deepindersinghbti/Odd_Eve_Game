import { describe, expect, it } from 'vitest';

import { INNINGS_STATUS, PARTICIPANTS, PHASES } from '../../src/game/index.js';
import { resolveDelivery, startFirstInnings } from './helpers.js';

const numberPairs = Array.from({ length: 6 }, (_, playerIndex) =>
  Array.from({ length: 6 }, (_, computerIndex) => [playerIndex + 1, computerIndex + 1]),
).flat();

describe.each([PARTICIPANTS.PLAYER, PARTICIPANTS.COMPUTER])(
  '%s batting delivery rules',
  (batter) => {
    it.each(numberPairs)(
      'resolves player=%i computer=%i',
      (playerNumber, computerNumber) => {
        const previousState = startFirstInnings({ batter });
        const previousSnapshot = structuredClone(previousState);
        const roundId = previousState.currentRoundId;
        const state = resolveDelivery(previousState, playerNumber, computerNumber);
        const isOut = playerNumber === computerNumber;
        const batterNumber =
          batter === PARTICIPANTS.PLAYER ? playerNumber : computerNumber;
        const runsAdded = isOut ? 0 : batterNumber;
        const delivery = state.innings[0].deliveries[0];

        expect(delivery).toEqual({
          roundId,
          playerNumber,
          computerNumber,
          batter,
          batterNumber,
          runsAdded,
          isOut,
          scoreAfter: runsAdded,
        });
        expect(state.innings[0].score).toBe(runsAdded);
        expect(state.innings[0].status).toBe(
          isOut ? INNINGS_STATUS.COMPLETE : INNINGS_STATUS.ACTIVE,
        );
        expect(state.phase).toBe(isOut ? PHASES.INNINGS_BREAK : PHASES.FIRST_INNINGS);
        expect(state.currentRoundId).toBe(isOut ? roundId : roundId + 1);
        expect(state.history.playerNumbers).toEqual([1, playerNumber]);
        expect(state.history.computerNumbers).toEqual([2, computerNumber]);
        expect(previousState).toEqual(previousSnapshot);
      },
    );
  },
);
