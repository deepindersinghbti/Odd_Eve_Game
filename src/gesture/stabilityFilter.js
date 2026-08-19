import {
  DEFAULT_STABILITY_SETTINGS,
  GESTURE_LABELS,
  GESTURE_LABEL_LIST,
  GESTURE_TO_NUMBER,
} from './constants.js';

function validateSettings(settings) {
  const valid =
    settings.minimumConfidence >= 0 &&
    settings.minimumConfidence <= 1 &&
    Number.isInteger(settings.windowSize) &&
    settings.windowSize > 1 &&
    Number.isInteger(settings.requiredAgreement) &&
    settings.requiredAgreement > 1 &&
    settings.requiredAgreement <= settings.windowSize &&
    settings.minimumHoldMs >= 0 &&
    settings.cooldownMs >= 0;
  if (!valid) throw new TypeError('Invalid gesture stability settings.');
}

export function createStabilityFilter(overrides = {}) {
  const settings = { ...DEFAULT_STABILITY_SETTINGS, ...overrides };
  validateSettings(settings);
  let window = [];
  let candidate = null;
  let candidateSince = null;
  let mismatchLabel = null;
  let mismatchCount = 0;
  let cooldownUntil = 0;
  let armed = true;

  function clearTracking() {
    window = [];
    candidate = null;
    candidateSince = null;
    mismatchLabel = null;
    mismatchCount = 0;
  }

  function snapshot({ label = null, confidence = 0, timestamp = 0 } = {}) {
    const agreement = candidate ? window.filter((item) => item === candidate).length : 0;
    const elapsed = candidateSince === null ? 0 : Math.max(0, timestamp - candidateSince);
    const stable =
      window.length === settings.windowSize &&
      agreement >= settings.requiredAgreement &&
      label === candidate;
    return {
      rawLabel: label,
      confidence,
      stableLabel: stable ? candidate : null,
      candidateLabel: candidate,
      holdProgress: candidate
        ? Math.min(
            1,
            agreement / settings.requiredAgreement,
            settings.minimumHoldMs === 0 ? 1 : elapsed / settings.minimumHoldMs,
          )
        : 0,
      cooldown: timestamp < cooldownUntil || !armed,
      armed,
      agreement,
      windowLength: window.length,
      submission: null,
    };
  }

  function push({ label, confidence, timestamp, eligible = true }) {
    if (!Number.isFinite(timestamp)) throw new TypeError('timestamp must be finite.');
    if (!eligible) {
      clearTracking();
      return snapshot({ timestamp });
    }
    if (label === GESTURE_LABELS.NO_HAND) {
      clearTracking();
      armed = true;
      return snapshot({ label, confidence, timestamp });
    }
    if (!GESTURE_LABEL_LIST.includes(label) || !Number.isFinite(confidence)) {
      clearTracking();
      return snapshot({ timestamp });
    }
    if (confidence < settings.minimumConfidence) {
      clearTracking();
      return snapshot({ label, confidence, timestamp });
    }
    if (!armed || timestamp < cooldownUntil) {
      clearTracking();
      return snapshot({ label, confidence, timestamp });
    }

    if (!candidate) {
      candidate = label;
      candidateSince = timestamp;
    } else if (label !== candidate) {
      if (mismatchLabel === label) mismatchCount += 1;
      else {
        mismatchLabel = label;
        mismatchCount = 1;
      }
      if (mismatchCount > settings.windowSize - settings.requiredAgreement) {
        candidate = label;
        candidateSince = timestamp;
        window = [];
        mismatchLabel = null;
        mismatchCount = 0;
      }
    } else {
      mismatchLabel = null;
      mismatchCount = 0;
    }

    window.push(label);
    if (window.length > settings.windowSize) window.shift();
    const result = snapshot({ label, confidence, timestamp });
    if (result.stableLabel && timestamp - candidateSince >= settings.minimumHoldMs) {
      result.submission = GESTURE_TO_NUMBER[result.stableLabel];
      armed = false;
      cooldownUntil = timestamp + settings.cooldownMs;
      result.cooldown = true;
      clearTracking();
    }
    return result;
  }

  return {
    push,
    reset({ requireRemoval = false } = {}) {
      clearTracking();
      cooldownUntil = 0;
      armed = !requireRemoval;
    },
    pause: clearTracking,
    getState(timestamp = 0) {
      return snapshot({ timestamp });
    },
    settings: Object.freeze({ ...settings }),
  };
}
