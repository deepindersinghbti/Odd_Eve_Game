import { CAMERA_STATUS } from '../../gesture/index.js';

const messages = {
  [CAMERA_STATUS.PERMISSION_PENDING]: 'Waiting for camera permission…',
  [CAMERA_STATUS.GRANTED]: 'Camera granted. Loading the local gesture model…',
  [CAMERA_STATUS.DENIED]: 'Camera permission was denied.',
  [CAMERA_STATUS.MISSING]: 'No compatible camera is available.',
  [CAMERA_STATUS.BUSY]: 'The camera is busy in another application.',
  [CAMERA_STATUS.ERROR]: 'The camera or local model could not be started.',
};

export default function CameraPermissionState({ cameraStatus, error }) {
  return (
    <div className="camera-state" role={error ? 'alert' : 'status'} aria-live="polite">
      <strong>{messages[cameraStatus] ?? 'Camera is off.'}</strong>
      {error && <p>{error.message}</p>}
    </div>
  );
}
