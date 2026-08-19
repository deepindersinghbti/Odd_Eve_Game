import {
  CALIBRATION_STATUS,
  CAMERA_STATUS,
  GEOMETRIC_RECOGNITION_CONFIG,
  RECOGNIZER_STATUS,
} from './constants.js';
import {
  attachCameraStream,
  cameraStatusForError,
  detachCameraStream,
  requestCameraStream,
  stopCameraStream,
} from './camera.js';
import { buildBackgroundReference, buildSkinCalibration } from './calibration.js';
import { readMirroredGuideFrame } from './crop.js';
import { GESTURE_ERROR_CODES, toGestureError } from './errors.js';
import { createGeometricPipeline } from './geometricPipeline.js';
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
  calibrationStatus: CALIBRATION_STATUS.IDLE,
  calibrationProgress: 0,
  detectionState: null,
  raisedFingerCount: null,
  rejectionReason: null,
});

export function createGestureRecognizer({
  video,
  canvas,
  onStateChange = () => {},
  onSubmit = () => {},
  isEligible = () => true,
  mediaDevices,
  clock = () => globalThis.performance.now(),
  loopFactory = createPredictionLoop,
  stabilityFilter = createStabilityFilter(),
  pipeline = createGeometricPipeline(),
  frameReader = readMirroredGuideFrame,
  wait = (delay) => new Promise((resolve) => globalThis.setTimeout(resolve, delay)),
  calibrationFrameCount = GEOMETRIC_RECOGNITION_CONFIG.calibrationFrameCount,
  calibrationFrameIntervalMs = GEOMETRIC_RECOGNITION_CONFIG.calibrationFrameIntervalMs,
  scheduler,
  visibilityTarget,
} = {}) {
  let state = { ...initialState };
  let stream = null;
  let loop = null;
  let active = false;
  let destroyed = false;
  let generation = 0;
  let videoGeneration = 0;
  let videoReady = Boolean(video);
  let calibrationGeneration = 0;
  let backgroundReference = null;

  const publish = (changes) => {
    state = { ...state, ...changes };
    onStateChange(state);
  };
  const cleanupLoop = () => {
    loop?.destroy();
    loop = null;
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
    cleanupLoop();
    cleanupCamera();
    const gestureError = toGestureError(
      error,
      GESTURE_ERROR_CODES.PROCESSING_FAILURE,
      'Gesture recognition failed. Use buttons instead.',
    );
    publish({
      ...initialState,
      status: RECOGNIZER_STATUS.ERROR,
      cameraStatus: cameraStatusForError(gestureError),
      error: { code: gestureError.code, message: gestureError.message },
      calibrationStatus: CALIBRATION_STATUS.ERROR,
    });
  };

  const readFrame = () =>
    frameReader(video, canvas, GEOMETRIC_RECOGNITION_CONFIG.processingSize);

  const captureFrames = async (status) => {
    const captureGeneration = ++calibrationGeneration;
    const frames = [];
    loop?.stop();
    stabilityFilter.pause();
    for (let index = 0; index < calibrationFrameCount; index += 1) {
      if (destroyed || captureGeneration !== calibrationGeneration) return null;
      const frame = readFrame();
      if (!frame) throw new Error('Wait for a visible camera frame and try again.');
      frames.push(frame);
      publish({
        calibrationStatus: status,
        calibrationProgress: (index + 1) / calibrationFrameCount,
      });
      if (index + 1 < calibrationFrameCount) await wait(calibrationFrameIntervalMs);
    }
    return frames;
  };

  const finishCalibrationCapture = () => {
    if (active && videoReady) loop?.start();
  };

  const buildLoop = () =>
    loopFactory({
      scheduler,
      visibilityTarget,
      predict() {
        const frame = readFrame();
        if (!frame) {
          return { label: null, confidence: 0 };
        }
        return pipeline.analyze(frame);
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
          detectionState: prediction.state ?? null,
          raisedFingerCount: prediction.raisedFingerCount ?? null,
          rejectionReason: prediction.quality?.rejection ?? null,
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
      cleanupLoop();
      cleanupCamera();
      calibrationGeneration += 1;
      backgroundReference = null;
      pipeline.setCalibration(null);
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
        loop = buildLoop();
        publish({
          status: RECOGNIZER_STATUS.READY,
          error: null,
          calibrationStatus: CALIBRATION_STATUS.BACKGROUND_REQUIRED,
          calibrationProgress: 0,
        });
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
      calibrationGeneration += 1;
      active = false;
      cleanupLoop();
      cleanupCamera();
      stabilityFilter.reset();
      pipeline.setCalibration(null);
      backgroundReference = null;
      if (!destroyed) publish({ ...initialState });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      calibrationGeneration += 1;
      active = false;
      cleanupLoop();
      cleanupCamera();
      stabilityFilter.reset();
    },
    getState() {
      return state;
    },
    setVideo(nextVideo) {
      return rebindVideo(nextVideo);
    },
    async calibrateBackground() {
      if (destroyed || state.status !== RECOGNIZER_STATUS.READY) return false;
      try {
        const frames = await captureFrames(CALIBRATION_STATUS.CAPTURING_BACKGROUND);
        if (!frames) return false;
        backgroundReference = buildBackgroundReference(
          frames,
          GEOMETRIC_RECOGNITION_CONFIG.processingSize,
          GEOMETRIC_RECOGNITION_CONFIG.processingSize,
        );
        publish({
          calibrationStatus: CALIBRATION_STATUS.PALM_REQUIRED,
          calibrationProgress: 0,
        });
        finishCalibrationCapture();
        return true;
      } catch (error) {
        publish({
          calibrationStatus: CALIBRATION_STATUS.ERROR,
          calibrationProgress: 0,
          error: {
            code: GESTURE_ERROR_CODES.CALIBRATION_FAILED,
            message: error.message,
          },
        });
        finishCalibrationCapture();
        return false;
      }
    },
    async calibratePalm() {
      if (destroyed || state.status !== RECOGNIZER_STATUS.READY || !backgroundReference) {
        return false;
      }
      try {
        const frames = await captureFrames(CALIBRATION_STATUS.CAPTURING_PALM);
        if (!frames) return false;
        const calibration = buildSkinCalibration(
          frames,
          backgroundReference,
          GEOMETRIC_RECOGNITION_CONFIG.processingSize,
          GEOMETRIC_RECOGNITION_CONFIG.processingSize,
        );
        pipeline.setCalibration(calibration);
        stabilityFilter.reset({ requireRemoval: true });
        publish({
          calibrationStatus: CALIBRATION_STATUS.READY,
          calibrationProgress: 1,
          error: null,
        });
        finishCalibrationCapture();
        return true;
      } catch (error) {
        publish({
          calibrationStatus: CALIBRATION_STATUS.ERROR,
          calibrationProgress: 0,
          error: {
            code: GESTURE_ERROR_CODES.CALIBRATION_FAILED,
            message: error.message,
          },
        });
        finishCalibrationCapture();
        return false;
      }
    },
    recalibrate() {
      calibrationGeneration += 1;
      backgroundReference = null;
      pipeline.setCalibration(null);
      stabilityFilter.reset();
      publish({
        calibrationStatus: CALIBRATION_STATUS.BACKGROUND_REQUIRED,
        calibrationProgress: 0,
        error: null,
        rawLabel: null,
        confidence: 0,
        candidateLabel: null,
        stableLabel: null,
        holdProgress: 0,
      });
    },
  };
}
