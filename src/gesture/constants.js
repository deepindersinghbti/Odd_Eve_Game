export const GESTURE_LABELS = Object.freeze({
  NO_HAND: 'NO_HAND',
  ONE: 'ONE',
  TWO: 'TWO',
  THREE: 'THREE',
  FOUR: 'FOUR',
  FIVE: 'FIVE',
  SIX: 'SIX',
});

export const GESTURE_LABEL_LIST = Object.freeze(Object.values(GESTURE_LABELS));

export const GESTURE_TO_NUMBER = Object.freeze({
  [GESTURE_LABELS.ONE]: 1,
  [GESTURE_LABELS.TWO]: 2,
  [GESTURE_LABELS.THREE]: 3,
  [GESTURE_LABELS.FOUR]: 4,
  [GESTURE_LABELS.FIVE]: 5,
  [GESTURE_LABELS.SIX]: 6,
});

export const GESTURE_INSTRUCTIONS = Object.freeze([
  { label: GESTURE_LABELS.ONE, value: 1, description: 'Index finger' },
  { label: GESTURE_LABELS.TWO, value: 2, description: 'Index + middle fingers' },
  {
    label: GESTURE_LABELS.THREE,
    value: 3,
    description: 'Index + middle + ring fingers',
  },
  { label: GESTURE_LABELS.FOUR, value: 4, description: 'Four fingers, thumb folded' },
  { label: GESTURE_LABELS.FIVE, value: 5, description: 'Open palm' },
  { label: GESTURE_LABELS.SIX, value: 6, description: 'Closed fist' },
]);

export const INPUT_METHODS = Object.freeze({
  BUTTONS: 'BUTTONS',
  CAMERA: 'CAMERA',
});

export const RECOGNIZER_STATUS = Object.freeze({
  DISABLED: 'DISABLED',
  LOADING: 'LOADING',
  READY: 'READY',
  ERROR: 'ERROR',
});

export const CAMERA_STATUS = Object.freeze({
  IDLE: 'IDLE',
  PERMISSION_PENDING: 'PERMISSION_PENDING',
  GRANTED: 'GRANTED',
  DENIED: 'DENIED',
  MISSING: 'MISSING',
  BUSY: 'BUSY',
  ERROR: 'ERROR',
});

export const DEFAULT_STABILITY_SETTINGS = Object.freeze({
  minimumConfidence: 0.85,
  windowSize: 10,
  requiredAgreement: 8,
  minimumHoldMs: 700,
  cooldownMs: 1200,
  predictionIntervalMs: 100,
});

export const MODEL_CONFIG = Object.freeze({
  name: 'mobilenet-v1',
  version: 1,
  alpha: 0.25,
  inputSize: 224,
  embeddingSize: 256,
  embeddingLayer: 'global_average_pooling2d_1',
  inputRange: [-1, 1],
});

export const MODEL_ASSET_PATHS = Object.freeze({
  mobilenet: '/assets/models/mobilenet/model.json',
  dataset: '/assets/models/hand-cricket-gestures/dataset.json',
  metadata: '/assets/models/hand-cricket-gestures/metadata.json',
});

export const DATASET_SCHEMA_VERSION = 1;
