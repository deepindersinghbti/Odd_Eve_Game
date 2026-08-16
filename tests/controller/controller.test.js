import { describe, expect, it, vi } from 'vitest';

import { BOT_CONTEXTS } from '../../src/bot/index.js';
import {
  CONTROLLER_ERROR_CODES,
  PRESENTATION_CONTEXT,
  PRESENTATION_STATUS,
} from '../../src/controller/index.js';
import {
  DIFFICULTIES,
  ERROR_CODES,
  OUTCOMES,
  PARTICIPANTS,
  PHASES,
  RESULT_REASONS,
  ROLES,
} from '../../src/game/index.js';
import { createHarness, reachToss, resolvePending } from './helpers.js';

describe('game controller setup and lifecycle', () => {
  it('starts from a stable setup snapshot and creates one match id', () => {
    const { controller, createMatchId } = createHarness();

    expect(controller.getSnapshot()).toMatchObject({
      game: null,
      setup: { difficulty: DIFFICULTIES.MEDIUM, playerName: '' },
      controls: { locked: false },
      error: null,
    });

    expect(controller.selectDifficulty(DIFFICULTIES.HARD)).toEqual({ ok: true });
    expect(controller.startMatch({ playerName: '  ' })).toEqual({ ok: true });
    expect(createMatchId).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().game).toMatchObject({
      matchId: 'match-1',
      difficulty: DIFFICULTIES.HARD,
      player: { name: 'Player' },
    });
  });

  it('preserves setup choices, creates a fresh id, and cancels pending work', () => {
    const { controller, manual } = createHarness();
    controller.selectDifficulty(DIFFICULTIES.EASY);
    reachToss(controller);
    controller.submitTossNumber(1);

    expect(controller.newMatch()).toEqual({ ok: true });
    expect(controller.getSnapshot()).toMatchObject({
      game: { matchId: 'match-2', difficulty: DIFFICULTIES.EASY },
      setup: { playerName: 'Asha', difficulty: DIFFICULTIES.EASY },
      controls: { locked: false },
    });
    expect(manual.activeCount).toBe(0);
    manual.replay(1);
    expect(controller.getSnapshot().game.phase).toBe(PHASES.PARITY_SELECTION);
  });

  it('can return to setup without allocating a match id', () => {
    const { controller, createMatchId } = createHarness();
    controller.startMatch({ playerName: 'Mira' });

    controller.newMatch({ returnToSetup: true });

    expect(controller.getSnapshot()).toMatchObject({
      game: null,
      setup: { playerName: 'Mira', difficulty: DIFFICULTIES.MEDIUM },
    });
    expect(createMatchId).toHaveBeenCalledOnce();
  });

  it('destroys idempotently, cancels timers, and rejects later commands', () => {
    const { controller, manual } = createHarness();
    const listener = vi.fn();
    controller.subscribe(listener);
    reachToss(controller);
    controller.submitTossNumber(1);
    listener.mockClear();

    expect(controller.destroy()).toEqual({ ok: true });
    expect(manual.activeCount).toBe(0);
    manual.replay(1);
    expect(listener).not.toHaveBeenCalled();
    expect(controller.selectParity('ODD')).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: CONTROLLER_ERROR_CODES.CONTROLLER_DESTROYED,
      }),
    });
    expect(controller.destroy()).toMatchObject({ ok: false });
  });
});

describe('toss orchestration and fair bot commitment', () => {
  it('locks synchronously, commits once, and reveals both choices together', () => {
    const { controller, manual, chooseNumber, timingRandom } = createHarness({
      delayRange: { minimum: 400, maximum: 800 },
      timingRandom: vi.fn(() => 0.5),
    });
    reachToss(controller);

    expect(controller.submitTossNumber(1)).toEqual({ ok: true });
    expect(controller.getSnapshot()).toMatchObject({
      game: { phase: PHASES.TOSS_WAITING },
      controls: { locked: true },
      presentation: {
        status: PRESENTATION_STATUS.COMPUTER_THINKING,
        context: PRESENTATION_CONTEXT.TOSS,
        selectedPlayerNumber: 1,
        revealedComputerNumber: null,
      },
    });
    expect(manual.getDelay()).toBe(600);
    expect(timingRandom).toHaveBeenCalledOnce();
    expect(chooseNumber).toHaveBeenCalledOnce();
    expect(chooseNumber.mock.calls[0][0]).toEqual({
      difficulty: DIFFICULTIES.MEDIUM,
      context: BOT_CONTEXTS.TOSS,
      visibleHistory: [],
      random: expect.any(Function),
    });
    expect(Object.keys(chooseNumber.mock.calls[0][0]).sort()).toEqual(
      ['context', 'difficulty', 'random', 'visibleHistory'].sort(),
    );
    expect(Object.isFrozen(chooseNumber.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(chooseNumber.mock.calls[0][0].visibleHistory)).toBe(true);
    expect(chooseNumber.mock.calls[0][0].random).not.toBe(timingRandom);

    const timerId = resolvePending(manual);
    expect(controller.getSnapshot()).toMatchObject({
      game: { phase: PHASES.TOSS_REVEAL, resolvedRoundIds: [1] },
      controls: { locked: true },
      presentation: {
        status: PRESENTATION_STATUS.SHOWING_REVEAL,
        revealedPlayerNumber: 1,
        revealedComputerNumber: 2,
      },
    });
    manual.replay(timerId);
    expect(controller.getSnapshot().game.resolvedRoundIds).toEqual([1]);
  });

  it('rejects rapid double submission before another bot choice or timer', () => {
    const { controller, manual, chooseNumber } = createHarness();
    reachToss(controller);

    controller.submitTossNumber(1);
    const result = controller.submitTossNumber(6);

    expect(result).toMatchObject({
      ok: false,
      error: { code: CONTROLLER_ERROR_CODES.OPERATION_PENDING },
    });
    expect(chooseNumber).toHaveBeenCalledOnce();
    expect(manual.scheduler.setTimeout).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().presentation.selectedPlayerNumber).toBe(1);
  });

  it('lets the human toss winner choose a role', () => {
    const { controller, manual } = createHarness({ numberChoices: [2] });
    reachToss(controller, 'ODD');
    controller.submitTossNumber(1);
    resolvePending(manual);

    controller.advancePresentation();
    expect(controller.getSnapshot()).toMatchObject({
      game: { phase: PHASES.ROLE_SELECTION, toss: { winner: PARTICIPANTS.PLAYER } },
      controls: { locked: false },
    });
    expect(controller.chooseRole(ROLES.BAT)).toEqual({ ok: true });
    expect(controller.getSnapshot().game).toMatchObject({
      phase: PHASES.FIRST_INNINGS,
      player: { role: ROLES.BAT },
    });
  });

  it('automates exactly one computer role choice after a computer toss win', () => {
    const { controller, manual, chooseRole } = createHarness({
      numberChoices: [1],
      roleChoices: [ROLES.BOWL],
    });
    reachToss(controller, 'ODD');
    controller.submitTossNumber(1);
    resolvePending(manual);

    expect(controller.advancePresentation()).toEqual({ ok: true });
    expect(controller.getSnapshot()).toMatchObject({
      game: { phase: PHASES.ROLE_SELECTION },
      controls: { locked: true },
      presentation: {
        status: PRESENTATION_STATUS.COMPUTER_THINKING,
        context: PRESENTATION_CONTEXT.ROLE_CHOICE,
      },
    });
    expect(chooseRole).toHaveBeenCalledOnce();
    expect(chooseRole.mock.calls[0][0]).toEqual({
      difficulty: DIFFICULTIES.MEDIUM,
      random: expect.any(Function),
    });

    resolvePending(manual);
    expect(controller.getSnapshot()).toMatchObject({
      game: { phase: PHASES.FIRST_INNINGS, computer: { role: ROLES.BOWL } },
      presentation: { revealedRole: ROLES.BOWL },
      controls: { locked: true },
    });
    controller.advancePresentation();
    expect(controller.getSnapshot().controls.locked).toBe(false);
  });
});

describe('delivery orchestration and match transitions', () => {
  function startPlayerBatting(harness) {
    reachToss(harness.controller, 'ODD');
    harness.controller.submitTossNumber(1);
    resolvePending(harness.manual);
    harness.controller.advancePresentation();
    harness.controller.chooseRole(ROLES.BAT);
  }

  it('uses only prior revealed history and the correct computer context', () => {
    const harness = createHarness({ numberChoices: [2, 4] });
    startPlayerBatting(harness);

    harness.controller.submitPlayNumber(3);

    expect(harness.chooseNumber).toHaveBeenLastCalledWith({
      difficulty: DIFFICULTIES.MEDIUM,
      context: BOT_CONTEXTS.COMPUTER_BOWLING,
      visibleHistory: [1],
      random: harness.random,
    });
    expect(harness.chooseNumber.mock.calls[1][0].visibleHistory).not.toContain(3);
    resolvePending(harness.manual);
    expect(harness.controller.getSnapshot().game.innings[0].score).toBe(3);
    expect(harness.controller.getSnapshot().controls.locked).toBe(true);
    harness.controller.advancePresentation();
    expect(harness.controller.getSnapshot().controls.locked).toBe(false);
  });

  it('advances a first-innings dismissal through the break to the chase', () => {
    const harness = createHarness({ numberChoices: [2, 4, 5] });
    startPlayerBatting(harness);
    harness.controller.submitPlayNumber(4);
    resolvePending(harness.manual);

    expect(harness.controller.getSnapshot().game.phase).toBe(PHASES.INNINGS_BREAK);
    expect(harness.controller.getSnapshot().presentation.revealedComputerNumber).toBe(4);
    harness.controller.advancePresentation();
    expect(harness.controller.getSnapshot().game).toMatchObject({
      phase: PHASES.SECOND_INNINGS,
      innings: [{ score: 0 }, { batter: PARTICIPANTS.COMPUTER, target: 1 }],
    });

    harness.controller.submitPlayNumber(2);
    expect(harness.chooseNumber).toHaveBeenLastCalledWith(
      expect.objectContaining({ context: BOT_CONTEXTS.COMPUTER_BATTING }),
    );
    resolvePending(harness.manual);
    expect(harness.controller.getSnapshot().game).toMatchObject({
      phase: PHASES.MATCH_OVER,
      result: {
        outcome: OUTCOMES.COMPUTER_WIN,
        reason: RESULT_REASONS.TARGET_REACHED,
      },
    });
    expect(harness.controller.getSnapshot().presentation.status).toBe(
      PRESENTATION_STATUS.SHOWING_REVEAL,
    );
    expect(harness.controller.advancePresentation()).toMatchObject({
      ok: false,
      error: { code: CONTROLLER_ERROR_CODES.NOTHING_TO_ADVANCE },
    });
  });

  it('supports a completed draw through controller commands', () => {
    const harness = createHarness({ numberChoices: [2, 2, 3, 1, 3] });
    startPlayerBatting(harness);

    harness.controller.submitPlayNumber(1);
    resolvePending(harness.manual);
    harness.controller.advancePresentation();
    harness.controller.submitPlayNumber(3);
    resolvePending(harness.manual);
    harness.controller.advancePresentation();
    harness.controller.submitPlayNumber(2);
    resolvePending(harness.manual);
    harness.controller.advancePresentation();
    harness.controller.submitPlayNumber(3);
    resolvePending(harness.manual);

    expect(harness.controller.getSnapshot().game).toMatchObject({
      phase: PHASES.MATCH_OVER,
      result: { outcome: OUTCOMES.DRAW, reason: RESULT_REASONS.SCORES_LEVEL },
    });
  });

  it('ends with a below-target dismissal through controller commands', () => {
    const harness = createHarness({ numberChoices: [2, 2, 3, 1] });
    startPlayerBatting(harness);

    harness.controller.submitPlayNumber(1);
    resolvePending(harness.manual);
    harness.controller.advancePresentation();
    harness.controller.submitPlayNumber(3);
    resolvePending(harness.manual);
    harness.controller.advancePresentation();
    harness.controller.submitPlayNumber(1);
    resolvePending(harness.manual);

    expect(harness.controller.getSnapshot().game).toMatchObject({
      phase: PHASES.MATCH_OVER,
      result: {
        outcome: OUTCOMES.PLAYER_WIN,
        reason: RESULT_REASONS.DISMISSED_BELOW_TARGET,
      },
    });
  });
});

describe('invalid actions and stale callbacks', () => {
  it('returns domain failures without invoking the bot or scheduler', () => {
    const { controller, chooseNumber, manual } = createHarness();

    expect(controller.submitPlayNumber(1)).toMatchObject({
      ok: false,
      error: { code: CONTROLLER_ERROR_CODES.MATCH_NOT_STARTED },
    });
    controller.startMatch();
    expect(controller.submitTossNumber(7)).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.INVALID_PHASE },
    });
    controller.selectParity('ODD');
    expect(controller.submitTossNumber(7)).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.INVALID_NUMBER },
    });
    expect(chooseNumber).not.toHaveBeenCalled();
    expect(manual.scheduler.setTimeout).not.toHaveBeenCalled();
  });

  it('ignores an old callback after reset even if the host invokes it', () => {
    const { controller, manual } = createHarness();
    reachToss(controller);
    controller.submitTossNumber(1);
    const staleId = manual.lastId;
    controller.newMatch();
    const afterReset = controller.getSnapshot();

    manual.replay(staleId);

    expect(controller.getSnapshot()).toBe(afterReset);
    expect(controller.getSnapshot().game).toMatchObject({
      matchId: 'match-2',
      phase: PHASES.PARITY_SELECTION,
      resolvedRoundIds: [],
    });
  });

  it('keeps the reveal locked and unchanged after another submission attempt', () => {
    const { controller, manual, chooseNumber } = createHarness();
    reachToss(controller);
    controller.submitTossNumber(1);
    resolvePending(manual);
    const before = controller.getSnapshot();

    expect(controller.submitTossNumber(2)).toMatchObject({
      ok: false,
      error: { code: CONTROLLER_ERROR_CODES.OPERATION_PENDING },
    });

    const after = controller.getSnapshot();
    expect(after.game).toBe(before.game);
    expect(after.presentation).toBe(before.presentation);
    expect(after.controls).toBe(before.controls);
    expect(chooseNumber).toHaveBeenCalledOnce();
    expect(manual.scheduler.setTimeout).toHaveBeenCalledOnce();
  });

  it('does not let the human select a role after the computer wins the toss', () => {
    const { controller, manual, chooseRole } = createHarness({
      numberChoices: [1],
    });
    reachToss(controller, 'ODD');
    controller.submitTossNumber(1);
    resolvePending(manual);
    controller.advancePresentation();

    expect(controller.chooseRole(ROLES.BAT)).toMatchObject({
      ok: false,
      error: { code: CONTROLLER_ERROR_CODES.OPERATION_PENDING },
    });
    expect(chooseRole).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      game: { toss: { winner: PARTICIPANTS.COMPUTER } },
      controls: { locked: true },
    });
  });

  it('does not expose or partially commit a computer choice if scheduling fails', () => {
    const schedulerError = new Error('host scheduler failed');
    const { controller } = createHarness();
    const broken = createHarness();
    broken.manual.scheduler.setTimeout.mockImplementation(() => {
      throw schedulerError;
    });
    reachToss(broken.controller);

    expect(() => broken.controller.submitTossNumber(1)).toThrow(schedulerError);
    expect(broken.controller.getSnapshot().game.phase).toBe(PHASES.TOSS_WAITING);
    expect(
      broken.controller.getSnapshot().presentation.revealedComputerNumber,
    ).toBeNull();

    controller.destroy();
  });
});
