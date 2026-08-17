import { GESTURE_INSTRUCTIONS, RECOGNIZER_STATUS } from '../../gesture/index.js';
import CameraPermissionState from './CameraPermissionState.jsx';
import GestureCandidate from './GestureCandidate.jsx';
import GestureGuide from './GestureGuide.jsx';

export default function CameraPanel({
  videoRef,
  state,
  eligible,
  onEnable,
  onUseButtons,
}) {
  const disabled = state.status === RECOGNIZER_STATUS.DISABLED;
  const loading = state.status === RECOGNIZER_STATUS.LOADING;
  const ready = state.status === RECOGNIZER_STATUS.READY;
  const failed = state.status === RECOGNIZER_STATUS.ERROR;

  return (
    <section className="camera-panel" aria-label="Camera gesture input">
      <p className="camera-panel__privacy">
        Camera frames are processed locally in this browser and are not uploaded or saved
        during gameplay.
      </p>
      <GestureGuide ref={videoRef} hidden={!ready || !eligible} />
      {disabled && (
        <button className="button button--primary" type="button" onClick={onEnable}>
          Enable camera
        </button>
      )}
      {loading && (
        <CameraPermissionState cameraStatus={state.cameraStatus} error={state.error} />
      )}
      {ready && eligible && <GestureCandidate state={state} />}
      {ready && !eligible && (
        <p className="camera-panel__paused" role="status">
          Camera recognition is paused until the next number choice.
        </p>
      )}
      {failed && (
        <CameraPermissionState cameraStatus={state.cameraStatus} error={state.error} />
      )}
      {(ready || failed) && (
        <button
          className="button button--quiet-dark"
          type="button"
          onClick={onUseButtons}
        >
          Use buttons instead
        </button>
      )}
      <details className="gesture-key">
        <summary>Gesture guide</summary>
        <ul>
          {GESTURE_INSTRUCTIONS.map((gesture) => (
            <li key={gesture.label}>
              <strong>{gesture.value}</strong> {gesture.description}
            </li>
          ))}
        </ul>
      </details>
      <p className="camera-panel__six">Closed fist = 6</p>
    </section>
  );
}
