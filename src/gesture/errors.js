export const GESTURE_ERROR_CODES = Object.freeze({
  CAMERA_API_MISSING: 'CAMERA_API_MISSING',
  CAMERA_PERMISSION_DENIED: 'CAMERA_PERMISSION_DENIED',
  CAMERA_NOT_FOUND: 'CAMERA_NOT_FOUND',
  CAMERA_BUSY: 'CAMERA_BUSY',
  CAMERA_FAILURE: 'CAMERA_FAILURE',
  VIDEO_ATTACH_FAILED: 'VIDEO_ATTACH_FAILED',
  MODEL_LOAD_FAILED: 'MODEL_LOAD_FAILED',
  MODEL_NOT_CALIBRATED: 'MODEL_NOT_CALIBRATED',
  INVALID_DATASET: 'INVALID_DATASET',
  INVALID_DEPENDENCY: 'INVALID_DEPENDENCY',
});

export class GestureError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'GestureError';
    this.code = code;
  }
}

export function toGestureError(error, fallbackCode, fallbackMessage) {
  if (error instanceof GestureError) return error;
  return new GestureError(fallbackCode, fallbackMessage, error);
}
