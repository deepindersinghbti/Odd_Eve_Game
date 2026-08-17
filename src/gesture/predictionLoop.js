import { DEFAULT_STABILITY_SETTINGS } from './constants.js';

export function createPredictionLoop({
  predict,
  onPrediction,
  onError,
  intervalMs = DEFAULT_STABILITY_SETTINGS.predictionIntervalMs,
  scheduler = globalThis,
  visibilityTarget = globalThis.document,
}) {
  let running = false;
  let destroyed = false;
  let timerId = null;
  let inFlight = false;
  let generation = 0;

  const isHidden = () => visibilityTarget?.visibilityState === 'hidden';
  const clearTimer = () => {
    if (timerId !== null) scheduler.clearTimeout(timerId);
    timerId = null;
  };
  const schedule = (delay = intervalMs) => {
    clearTimer();
    if (!running || destroyed || isHidden() || inFlight) return;
    timerId = scheduler.setTimeout(run, delay);
  };
  const run = async () => {
    timerId = null;
    if (!running || destroyed || isHidden() || inFlight) return;
    const runGeneration = generation;
    inFlight = true;
    try {
      const prediction = await predict();
      if (running && !destroyed && runGeneration === generation) {
        onPrediction(prediction);
      }
    } catch (error) {
      if (running && !destroyed && runGeneration === generation) {
        running = false;
        onError(error);
      }
    } finally {
      inFlight = false;
      if (running && runGeneration === generation) schedule();
    }
  };
  const onVisibilityChange = () => {
    if (isHidden()) clearTimer();
    else schedule(0);
  };
  visibilityTarget?.addEventListener?.('visibilitychange', onVisibilityChange);

  return {
    start() {
      if (destroyed || running) return;
      running = true;
      generation += 1;
      schedule(0);
    },
    stop() {
      if (!running && timerId === null) return;
      running = false;
      generation += 1;
      clearTimer();
    },
    destroy() {
      if (destroyed) return;
      this.stop();
      destroyed = true;
      visibilityTarget?.removeEventListener?.('visibilitychange', onVisibilityChange);
    },
    get running() {
      return running;
    },
    get inFlight() {
      return inFlight;
    },
  };
}
