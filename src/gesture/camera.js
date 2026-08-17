import { CAMERA_STATUS } from './constants.js';
import { GESTURE_ERROR_CODES, GestureError } from './errors.js';

export const DEFAULT_CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: Object.freeze({
    facingMode: Object.freeze({ ideal: 'user' }),
    width: Object.freeze({ ideal: 640 }),
    height: Object.freeze({ ideal: 640 }),
  }),
});

function cameraFailure(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new GestureError(
        GESTURE_ERROR_CODES.CAMERA_PERMISSION_DENIED,
        'Camera permission was denied. You can keep playing with buttons.',
        error,
      );
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new GestureError(
        GESTURE_ERROR_CODES.CAMERA_NOT_FOUND,
        'No camera was found. You can keep playing with buttons.',
        error,
      );
    case 'NotReadableError':
    case 'TrackStartError':
      return new GestureError(
        GESTURE_ERROR_CODES.CAMERA_BUSY,
        'The camera is busy in another app. Close it there or use buttons.',
        error,
      );
    default:
      return new GestureError(
        GESTURE_ERROR_CODES.CAMERA_FAILURE,
        'The camera could not be started. You can keep playing with buttons.',
        error,
      );
  }
}

export function cameraStatusForError(error) {
  switch (error?.code) {
    case GESTURE_ERROR_CODES.CAMERA_PERMISSION_DENIED:
      return CAMERA_STATUS.DENIED;
    case GESTURE_ERROR_CODES.CAMERA_NOT_FOUND:
    case GESTURE_ERROR_CODES.CAMERA_API_MISSING:
      return CAMERA_STATUS.MISSING;
    case GESTURE_ERROR_CODES.CAMERA_BUSY:
      return CAMERA_STATUS.BUSY;
    default:
      return CAMERA_STATUS.ERROR;
  }
}

export async function requestCameraStream({
  mediaDevices = globalThis.navigator?.mediaDevices,
  constraints = DEFAULT_CAMERA_CONSTRAINTS,
} = {}) {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
    throw new GestureError(
      GESTURE_ERROR_CODES.CAMERA_API_MISSING,
      'Camera access is unavailable in this browser. Use buttons instead.',
    );
  }

  try {
    return await mediaDevices.getUserMedia(constraints);
  } catch (error) {
    throw cameraFailure(error);
  }
}

export async function attachCameraStream(video, stream) {
  if (!video || typeof video.play !== 'function') {
    throw new GestureError(
      GESTURE_ERROR_CODES.VIDEO_ATTACH_FAILED,
      'The camera preview is unavailable. Use buttons instead.',
    );
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch (error) {
    throw new GestureError(
      GESTURE_ERROR_CODES.VIDEO_ATTACH_FAILED,
      'The camera preview could not start. Use buttons instead.',
      error,
    );
  }
}

export function stopCameraStream(stream) {
  if (!stream || typeof stream.getTracks !== 'function') return;
  stream.getTracks().forEach((track) => track.stop());
}

export function detachCameraStream(video) {
  if (video) video.srcObject = null;
}
