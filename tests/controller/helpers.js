import { vi } from 'vitest';

import { createGameController } from '../../src/controller/index.js';

export function createManualScheduler() {
  let nextId = 0;
  const active = new Map();
  const all = new Map();

  const scheduler = {
    setTimeout: vi.fn((callback, delay) => {
      const id = ++nextId;
      const task = { callback, delay };
      active.set(id, task);
      all.set(id, task);
      return id;
    }),
    clearTimeout: vi.fn((id) => active.delete(id)),
  };

  return {
    scheduler,
    get activeCount() {
      return active.size;
    },
    get lastId() {
      return nextId;
    },
    getDelay(id = nextId) {
      return all.get(id)?.delay;
    },
    run(id = active.keys().next().value) {
      const task = active.get(id);
      if (!task) return false;
      active.delete(id);
      task.callback();
      return true;
    },
    replay(id) {
      all.get(id)?.callback();
    },
  };
}

export function createHarness(overrides = {}) {
  const manual = createManualScheduler();
  const numberChoices = [...(overrides.numberChoices ?? [2])];
  const roleChoices = [...(overrides.roleChoices ?? ['BAT'])];
  const matchIds = [...(overrides.matchIds ?? ['match-1', 'match-2', 'match-3'])];
  const chooseNumber = overrides.chooseNumber ?? vi.fn(() => numberChoices.shift() ?? 1);
  const chooseRole = overrides.chooseRole ?? vi.fn(() => roleChoices.shift() ?? 'BAT');
  const createMatchId =
    overrides.createMatchId ?? vi.fn(() => matchIds.shift() ?? 'match-fallback');
  const random = overrides.random ?? vi.fn(() => 0.25);
  const timingRandom = overrides.timingRandom ?? vi.fn(() => 0);

  const controller = createGameController({
    scheduler: manual.scheduler,
    delayRange: overrides.delayRange ?? { minimum: 0, maximum: 0 },
    now: overrides.now ?? (() => 123),
    chooseNumber,
    chooseRole,
    createMatchId,
    random,
    timingRandom,
  });

  return {
    controller,
    manual,
    chooseNumber,
    chooseRole,
    createMatchId,
    random,
    timingRandom,
  };
}

export function reachToss(controller, parity = 'ODD') {
  controller.startMatch({ playerName: 'Asha' });
  controller.selectParity(parity);
}

export function resolvePending(manual) {
  const id = manual.lastId;
  manual.run(id);
  return id;
}
