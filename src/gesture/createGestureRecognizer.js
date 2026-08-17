import { CAMERA_STATUS, MODEL_ASSET_PATHS, RECOGNIZER_STATUS } from './constants.js';
import {
  attachCameraStream,
  cameraStatusForError,
  detachCameraStream,
  requestCameraStream,
  stopCameraStream,
} from './camera.js';
import { createGestureClassifier } from './classifier.js';
import { drawMirroredGuideCrop } from './crop.js';
import { deserializeClassifierDataset } from './datasetSerializer.js';
import { GESTURE_ERROR_CODES, GestureError, toGestureError } from './errors.js';
import { loadLocalFeatureExtractor } from './modelLoader.js';
import { createPredictionLoop } from './predictionLoop.js';
import { createStabilityFilter } from './stabilityFilter.js';

const initialState = Object.freeze({
  status: RECOGNIZER_STATUS.DISABLED,
  cameraStatus: CAMERA_STATUS.IDLE,
  rawLabel: null,
  confidence: 0,
  stableLabel: null,
  candidateLabel: null,
  holdProgress: 0,
  cooldown: false,
  error: null,
  lastSubmittedValue: null,
});

function disposeSafely(resource) {
  try {
    resource?.dispose?.();
  } catch {
    // Cleanup must not hide the primary error or prevent other resources releasing.
  }
}

async function loadRuntime({ featureLoader, classifierLoader, fetcher, datasetUrl }) {
  const featureExtractor = await featureLoader();
  let classifier;
  try {
    classifier = await classifierLoader();
    const response = await fetcher(datasetUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Dataset request failed (${response.status}).`);
    const document = await response.json();
    if (document.calibrated === false) {
      throw new GestureError(
        GESTURE_ERROR_CODES.MODEL_NOT_CALIBRATED,
        'Gesture model calibration is pending. Use buttons instead.',
      );
    }
    const tensors = deserializeClassifierDataset(document, featureExtractor.tf, {
      requireAllClasses: true,
    });
    classifier.replaceDataset(tensors);
    return { featureExtractor, classifier };
  } catch (error) {
    disposeSafely(classifier);
    disposeSafely(featureExtractor);
    if (error instanceof GestureError) throw error;
    throw toGestureError(
      error,
      GESTURE_ERROR_CODES.MODEL_LOAD_FAILED,
      'The local gesture classifier could not be loaded. Use buttons instead.',
    );
  }
}

export function createGestureRecognizer({
  video,
  canvas,
  onStateChange = () => {},
  onSubmit = () => {},
  isEligible = () => true,
  mediaDevices,
  clock = () => globalThis.performance.now(),
  fetcher = (...args) => globalThis.fetch(...args),
  featureLoader = loadLocalFeatureExtractor,
  classifierLoader = createGestureClassifier,
  runtimeLoader,
  loopFactory = createPredictionLoop,
  stabilityFilter = createStabilityFilter(),
  datasetUrl = MODEL_ASSET_PATHS.dataset,
  scheduler,
  visibilityTarget,
} = {}) {
  let state = { ...initialState };
  let stream = null;
  let runtime = null;
  let loop = null;
  let active = false;
  let destroyed = false;
  let generation = 0;
  let videoGeneration = 0;
  let videoReady = Boolean(video);

  const publish = (changes) => {
    state = { ...state, ...changes };
    onStateChange(state);
  };
  const cleanupRuntime = () => {
    loop?.destroy();
    loop = null;
    disposeSafely(runtime?.classifier);
    disposeSafely(runtime?.featureExtractor);
    runtime = null;
  };
  const cleanupCamera = () => {
    videoGeneration += 1;
    videoReady = false;
    stopCameraStream(stream);
    stream = null;
    detachCameraStream(video);
  };
  const rebindVideo = async (nextVideo) => {
    if (video === nextVideo) return true;

    const bindingGeneration = ++videoGeneration;
    videoReady = false;
    loop?.stop();
    stabilityFilter.pause();
    detachCameraStream(video);
    video = nextVideo ?? null;

    if (!video || !stream) return true;

    try {
      await attachCameraStream(video, stream);
      if (destroyed || bindingGeneration !== videoGeneration || video !== nextVideo) {
        return false;
      }
      videoReady = true;
      if (active) loop?.start();
      return true;
    } catch (error) {
      if (!destroyed && bindingGeneration === videoGeneration) fail(error);
      return false;
    }
  };
  const fail = (error) => {
    cleanupRuntime();
    cleanupCamera();
    const gestureError = toGestureError(
      error,
      GESTURE_ERROR_CODES.MODEL_LOAD_FAILED,
      'Gesture recognition failed. Use buttons instead.',
    );
    publish({
      ...initialState,
      status: RECOGNIZER_STATUS.ERROR,
      cameraStatus: cameraStatusForError(gestureError),
      error: { code: gestureError.code, message: gestureError.message },
    });
  };

  const buildLoop = () =>
    loopFactory({
      scheduler,
      visibilityTarget,
      async predict() {
        if (!drawMirroredGuideCrop(video, canvas)) {
          return { label: null, confidence: 0 };
        }
        const embedding = runtime.featureExtractor.infer(canvas);
        try {
          return await runtime.classifier.predict(embedding);
        } finally {
          embedding.dispose();
        }
      },
      onPrediction(prediction) {
        const filtered = stabilityFilter.push({
          ...prediction,
          timestamp: clock(),
          eligible: active && isEligible(),
        });
        publish({
          rawLabel: filtered.rawLabel,
          confidence: filtered.confidence,
          stableLabel: filtered.stableLabel,
          candidateLabel: filtered.candidateLabel,
          holdProgress: filtered.holdProgress,
          cooldown: filtered.cooldown,
          lastSubmittedValue:
            filtered.rawLabel === 'NO_HAND' ? null : state.lastSubmittedValue,
        });
        if (filtered.submission !== null && active && isEligible()) {
          const accepted = onSubmit(filtered.submission, filtered.stableLabel);
          if (accepted !== false) {
            publish({ lastSubmittedValue: filtered.submission, cooldown: true });
          }
        }
      },
      onError: fail,
    });

  return {
    async enable() {
      if (destroyed || state.status === RECOGNIZER_STATUS.LOADING) return false;
      const enableGeneration = ++generation;
      cleanupRuntime();
      cleanupCamera();
      publish({
        ...initialState,
        status: RECOGNIZER_STATUS.LOADING,
        cameraStatus: CAMERA_STATUS.PERMISSION_PENDING,
      });
      try {
        stream = await requestCameraStream({ mediaDevices });
        if (destroyed || enableGeneration !== generation) {
          stopCameraStream(stream);
          stream = null;
          return false;
        }
        const attachGeneration = ++videoGeneration;
        await attachCameraStream(video, stream);
        if (
          destroyed ||
          enableGeneration !== generation ||
          attachGeneration !== videoGeneration
        ) {
          return false;
        }
        videoReady = true;
        publish({ cameraStatus: CAMERA_STATUS.GRANTED });
        runtime = runtimeLoader
          ? await runtimeLoader()
          : await loadRuntime({
              featureLoader,
              classifierLoader,
              fetcher,
              datasetUrl,
            });
        if (destroyed || enableGeneration !== generation) {
          disposeSafely(runtime?.classifier);
          disposeSafely(runtime?.featureExtractor);
          runtime = null;
          cleanupCamera();
          return false;
        }
        loop = buildLoop();
        publish({ status: RECOGNIZER_STATUS.READY, error: null });
        if (active && videoReady) loop.start();
        return true;
      } catch (error) {
        if (!destroyed && enableGeneration === generation) fail(error);
        return false;
      }
    },
    setActive(nextActive) {
      active = Boolean(nextActive);
      if (!loop) return;
      if (active && videoReady) loop.start();
      else {
        loop.stop();
        stabilityFilter.pause();
        publish({
          rawLabel: null,
          confidence: 0,
          stableLabel: null,
          candidateLabel: null,
          holdProgress: 0,
        });
      }
    },
    disable() {
      generation += 1;
      active = false;
      cleanupRuntime();
      cleanupCamera();
      stabilityFilter.reset();
      if (!destroyed) publish({ ...initialState });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      active = false;
      cleanupRuntime();
      cleanupCamera();
      stabilityFilter.reset();
    },
    getState() {
      return state;
    },
    setVideo(nextVideo) {
      return rebindVideo(nextVideo);
    },
  };
}
