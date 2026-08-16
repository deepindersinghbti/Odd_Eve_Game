import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { createGameController } from '../controller/index.js';

const controllerLifecycles = new WeakMap();

function deferCleanup(callback) {
  globalThis.queueMicrotask(callback);
}

function getControllerLifecycle(controller) {
  if (!controllerLifecycles.has(controller)) {
    controllerLifecycles.set(controller, { mounts: 0, version: 0 });
  }
  return controllerLifecycles.get(controller);
}

function beginControllerLifetime(controller, ownsController) {
  const lifecycle = getControllerLifecycle(controller);
  lifecycle.mounts += 1;
  lifecycle.version += 1;

  return () => {
    lifecycle.mounts -= 1;
    const cleanupVersion = ++lifecycle.version;

    if (ownsController) {
      deferCleanup(() => {
        if (lifecycle.mounts === 0 && lifecycle.version === cleanupVersion) {
          controller.destroy();
          controllerLifecycles.delete(controller);
        }
      });
    }
  };
}

export function useGameController(options = {}) {
  const [{ controller, ownsController }] = useState(() => ({
    controller: options.controller ?? createGameController(options),
    ownsController: !options.controller,
  }));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(
    () => beginControllerLifetime(controller, ownsController),
    [controller, ownsController],
  );

  const commands = useMemo(
    () => ({
      selectDifficulty: controller.selectDifficulty,
      startMatch: controller.startMatch,
      selectParity: controller.selectParity,
      submitTossNumber: controller.submitTossNumber,
      advancePresentation: controller.advancePresentation,
      chooseRole: controller.chooseRole,
      submitPlayNumber: controller.submitPlayNumber,
      newMatch: controller.newMatch,
      clearError: controller.clearError,
    }),
    [controller],
  );

  return useMemo(() => ({ ...snapshot, ...commands }), [snapshot, commands]);
}
