import { CALIBRATION_STATUS } from '../../gesture/index.js';

export default function CalibrationWizard({ state, onBackground, onPalm, onRetry }) {
  const progress = Math.round((state.calibrationProgress ?? 0) * 100);
  switch (state.calibrationStatus) {
    case CALIBRATION_STATUS.BACKGROUND_REQUIRED:
      return (
        <div className="calibration-wizard" role="status">
          <strong>Step 1 of 2: empty background</strong>
          <p>Remove your hand and face from the green box, then keep the camera still.</p>
          <button className="button button--primary" type="button" onClick={onBackground}>
            Capture background
          </button>
        </div>
      );
    case CALIBRATION_STATUS.CAPTURING_BACKGROUND:
      return (
        <div className="calibration-wizard" role="status">
          <strong>Capturing empty background… {progress}%</strong>
          <progress
            value={progress}
            max="100"
            aria-label="Background calibration progress"
          />
        </div>
      );
    case CALIBRATION_STATUS.PALM_REQUIRED:
      return (
        <div className="calibration-wizard" role="status">
          <strong>Step 2 of 2: open palm</strong>
          <p>
            Fill the centre of the box with one open palm. Keep all five fingers apart.
          </p>
          <button className="button button--primary" type="button" onClick={onPalm}>
            Capture open palm
          </button>
        </div>
      );
    case CALIBRATION_STATUS.CAPTURING_PALM:
      return (
        <div className="calibration-wizard" role="status">
          <strong>Measuring your palm colour… {progress}%</strong>
          <progress value={progress} max="100" aria-label="Palm calibration progress" />
        </div>
      );
    case CALIBRATION_STATUS.ERROR:
      return (
        <div className="calibration-wizard" role="alert">
          <strong>Calibration needs another try.</strong>
          <p>{state.error?.message}</p>
          <button className="button button--primary" type="button" onClick={onRetry}>
            Restart calibration
          </button>
        </div>
      );
    default:
      return null;
  }
}
