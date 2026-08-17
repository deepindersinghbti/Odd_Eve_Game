import { describe, expect, it, vi } from 'vitest';

import { createPredictionLoop } from '../../src/gesture/index.js';

function createManualScheduler() {
  let nextId = 0;
  const callbacks = new Map();
  return {
    scheduler: {
      setTimeout: vi.fn((callback) => {
        const id = ++nextId;
        callbacks.set(id, callback);
        return id;
      }),
      clearTimeout: vi.fn((id) => callbacks.delete(id)),
    },
    async runNext() {
      const [id, callback] = callbacks.entries().next().value ?? [];
      if (!callback) return;
      callbacks.delete(id);
      await callback();
    },
    get size() {
      return callbacks.size;
    },
  };
}

function createVisibility() {
  const listeners = new Set();
  return {
    visibilityState: 'visible',
    addEventListener: vi.fn((_name, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_name, listener) => listeners.delete(listener)),
    change(state) {
      this.visibilityState = state;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('throttled prediction loop', () => {
  it('prevents overlapping predictions', async () => {
    const manual = createManualScheduler();
    let resolvePrediction;
    const predict = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvePrediction = resolve;
        }),
    );
    const loop = createPredictionLoop({
      predict,
      onPrediction: vi.fn(),
      onError: vi.fn(),
      scheduler: manual.scheduler,
      visibilityTarget: createVisibility(),
    });
    loop.start();
    const pending = manual.runNext();
    expect(loop.inFlight).toBe(true);
    expect(manual.size).toBe(0);
    loop.start();
    expect(predict).toHaveBeenCalledOnce();
    resolvePrediction({ label: 'ONE', confidence: 1 });
    await pending;
    expect(manual.size).toBe(1);
  });

  it('pauses while hidden and resumes when visible', async () => {
    const manual = createManualScheduler();
    const visibility = createVisibility();
    const predict = vi.fn().mockResolvedValue({});
    const loop = createPredictionLoop({
      predict,
      onPrediction: vi.fn(),
      onError: vi.fn(),
      scheduler: manual.scheduler,
      visibilityTarget: visibility,
    });
    loop.start();
    visibility.change('hidden');
    expect(manual.size).toBe(0);
    visibility.change('visible');
    expect(manual.size).toBe(1);
    await manual.runNext();
    expect(predict).toHaveBeenCalledOnce();
  });

  it('cancels scheduling and visibility listeners on destroy', () => {
    const manual = createManualScheduler();
    const visibility = createVisibility();
    const loop = createPredictionLoop({
      predict: vi.fn(),
      onPrediction: vi.fn(),
      onError: vi.fn(),
      scheduler: manual.scheduler,
      visibilityTarget: visibility,
    });
    loop.start();
    loop.destroy();
    expect(manual.size).toBe(0);
    expect(visibility.removeEventListener).toHaveBeenCalledOnce();
  });
});
