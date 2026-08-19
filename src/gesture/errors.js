export const GESTURE_ERROR_CODES = Object.freeze({
  CAMERA_API_MISSING: 'CAMERA_API_MISSING',
  CAMERA_PERMISSION_DENIED: 'CAMERA_PERMISSION_DENIED',
  CAMERA_NOT_FOUND: 'CAMERA_NOT_FOUND',
  CAMERA_BUSY: 'CAMERA_BUSY',
  CAMERA_FAILURE: 'CAMERA_FAILURE',
  VIDEO_ATTACH_FAILED: 'VIDEO_ATTACH_FAILED',
  PROCESSING_FAILURE: 'PROCESSING_FAILURE',
  CALIBRATION_FAILED: 'CALIBRATION_FAILED',
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
