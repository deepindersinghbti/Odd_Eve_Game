import {
  DEFAULT_STABILITY_SETTINGS,
  GESTURE_LABELS,
  GESTURE_TO_NUMBER,
} from '../../gesture/index.js';

export default function GestureCandidate({ state }) {
  const label = state.candidateLabel ?? state.rawLabel;
  const value = GESTURE_TO_NUMBER[label];
  const confidence = Number.isFinite(state.confidence) ? state.confidence : 0;
  const lowConfidence =
    Boolean(value) && confidence < DEFAULT_STABILITY_SETTINGS.minimumConfidence;
  let message = 'Show a gesture inside the guide.';
  if (label === GESTURE_LABELS.NO_HAND) {
    // NO_WRIST_ENTRY means something skin-coloured is in the box but is not
    // reaching in from the bottom -- nearly always the player's face. Say what
    // to change rather than the unhelpfully generic "no hand detected".
    message =
      state.rejectionReason === 'NO_WRIST_ENTRY'
        ? 'Move your hand into the box from below, wrist at the bottom.'
        : 'No hand detected. Ready.';
  } else if (state.cooldown) message = 'Remove your hand before the next number.';
  else if (lowConfidence)
    message = `I can see ${value}, but confidence is low. Center your hand.`;
  else if (value) message = `Detecting ${value}. Hold steady.`;
  if (state.lastSubmittedValue)
    message = `Submitted ${state.lastSubmittedValue}. Remove your hand.`;

  return (
    <div className="gesture-candidate">
      <div
        className="gesture-candidate__progress"
        role="progressbar"
        aria-label="Gesture hold progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(state.holdProgress * 100)}
        style={{ '--hold-progress': `${state.holdProgress * 360}deg` }}
      >
        <span>{value ?? '—'}</span>
      </div>
      <p>{message}</p>
      <small className="gesture-candidate__confidence">
        Confidence: {Math.round(confidence * 100)}%
      </small>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </span>
    </div>
  );
}
