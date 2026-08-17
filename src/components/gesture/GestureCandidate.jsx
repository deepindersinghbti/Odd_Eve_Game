import { GESTURE_LABELS, GESTURE_TO_NUMBER } from '../../gesture/index.js';

export default function GestureCandidate({ state }) {
  const label = state.candidateLabel ?? state.rawLabel;
  const value = GESTURE_TO_NUMBER[label];
  let message = 'Show a gesture inside the guide.';
  if (label === GESTURE_LABELS.NO_HAND) message = 'No hand detected. Ready.';
  else if (state.cooldown) message = 'Remove your hand before the next number.';
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
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </span>
    </div>
  );
}
