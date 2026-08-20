import {
  DEFINITIVE_NO_HAND_REASONS,
  GESTURE_LABELS,
  NO_HAND_CONFIDENCE,
} from './constants.js';
import { analyzeHandGeometry } from './fingerGeometry.js';
import { analyzeHandPresence } from './segmentation.js';

const COUNT_TO_LABEL = Object.freeze({
  0: GESTURE_LABELS.SIX,
  1: GESTURE_LABELS.ONE,
  2: GESTURE_LABELS.TWO,
  3: GESTURE_LABELS.THREE,
  4: GESTURE_LABELS.FOUR,
  5: GESTURE_LABELS.FIVE,
});

function clamp(value) {
  return Math.min(1, Math.max(0, value));
}

function buildConfidence(component, geometry, width, height, previousPalm, presence) {
  const maskQuality = clamp((component.foregroundShare - 0.65) / 0.35);
  const radiusRatio = geometry.palm.radius / Math.min(width, height);
  const palmQuality =
    radiusRatio >= 0.06 && radiusRatio <= 0.26
      ? 1
      : clamp(
          1 - Math.min(Math.abs(radiusRatio - 0.06), Math.abs(radiusRatio - 0.26)) / 0.05,
        );
  // Clipping the guide box degrades confidence proportionally rather than
  // zeroing it: a fingertip grazing the top edge is a slightly worse frame,
  // not an unusable one. (Previously any single contact pixel forced this to
  // 0, which pushed otherwise-good frames under the submission threshold.)
  const clippedEdgePixels =
    component.borderSides.top + component.borderSides.left + component.borderSides.right;
  const borderQuality = clamp(1 - clippedEdgePixels / (Math.min(width, height) * 0.5));
  let fingerQuality;
  if (geometry.raisedFingerCount === 0) {
    fingerQuality = clamp((component.fillRatio - 0.32) / 0.35);
  } else {
    const evidence = geometry.fingertips.reduce(
      (total, tip) =>
        total +
        clamp((tip.normalizedLength - 0.5) / 0.9) * 0.6 +
        clamp(tip.prominence) * 0.4,
      0,
    );
    fingerQuality = evidence / geometry.fingertips.length;
  }

  // Ambiguous candidate geometry: many raw peaks survived smoothing/clustering
  // relative to how many fingertips were ultimately accepted, or several
  // candidates were only rejected at the last (duplicate/valley) stage rather
  // than cleanly failing early. Both indicate a noisy, borderline frame that
  // should not be trusted even if the final count happens to look plausible.
  const diagnostics = geometry.diagnostics ?? {};
  const clusterCount = diagnostics.clusterCount ?? geometry.raisedFingerCount;
  const acceptedCount = Math.max(1, geometry.raisedFingerCount);
  const clusterAmbiguity = clamp((clusterCount - acceptedCount) / 3);
  const nearDuplicateRejections = (diagnostics.rejectedCandidates ?? []).filter(
    (candidate) =>
      candidate.rejectionReason === 'DUPLICATE_OF_ACCEPTED' ||
      candidate.rejectionReason === 'INSUFFICIENT_VALLEY_EVIDENCE',
  ).length;
  const duplicateAmbiguity = clamp(nearDuplicateRejections / 2);
  const clusterQuality = 1 - Math.max(clusterAmbiguity, duplicateAmbiguity) * 0.7;

  // Palm geometry should not jump sharply between adjacent frames; a large
  // frame-to-frame shift in centre or radius (relative to palm radius) usually
  // means segmentation is unstable, not that the hand actually teleported.
  let stabilityQuality = 1;
  if (previousPalm) {
    const centreShift =
      Math.hypot(
        geometry.palm.center.x - previousPalm.center.x,
        geometry.palm.center.y - previousPalm.center.y,
      ) / geometry.palm.radius;
    const radiusShift =
      Math.abs(geometry.palm.radius - previousPalm.radius) / geometry.palm.radius;
    stabilityQuality = clamp(1 - Math.max(centreShift / 0.6, radiusShift / 0.5));
  }

  // Two similarly sized skin blobs competing (classically a face and a hand
  // both inside the guide box) means the selection could plausibly have gone
  // the other way. Halve confidence rather than committing to a coin flip.
  const presenceQuality = presence?.ambiguous ? 0.5 : 1;

  return clamp(
    (maskQuality * 0.2 +
      palmQuality * 0.2 +
      fingerQuality * 0.32 +
      borderQuality * 0.08 +
      clusterQuality * 0.12 +
      stabilityQuality * 0.08) *
      presenceQuality,
  );
}

export function createGeometricPipeline({
  calibration,
  geometrySettings,
  debug = false,
} = {}) {
  let currentCalibration = calibration ?? null;
  let previousPalm = null;
  return {
    setCalibration(nextCalibration) {
      currentCalibration = nextCalibration;
      previousPalm = null;
    },
    getCalibration() {
      return currentCalibration;
    },
    analyze(data) {
      if (!currentCalibration) {
        return {
          label: null,
          confidence: 0,
          state: 'CALIBRATION_REQUIRED',
          raisedFingerCount: null,
        };
      }
      const { width, height } = currentCalibration;
      const presence = analyzeHandPresence(data, currentCalibration);
      const component = presence.component;
      if (!component) {
        previousPalm = null;
        // An empty box is a certain observation; a blob that merely failed a
        // shape test is a judgement call that could still be a mis-read hand.
        // Only the former is confident enough to confirm removal and re-arm
        // the submitter -- see NO_HAND_CONFIDENCE in constants.js.
        const definitivelyEmpty = DEFINITIVE_NO_HAND_REASONS.includes(presence.rejection);
        return {
          label: GESTURE_LABELS.NO_HAND,
          confidence: definitivelyEmpty
            ? NO_HAND_CONFIDENCE.empty
            : NO_HAND_CONFIDENCE.ambiguous,
          state: 'NO_HAND',
          raisedFingerCount: null,
          // The reason matters for the player-facing hint: NO_WRIST_ENTRY
          // means "something skin-coloured is in the box but it isn't
          // reaching in from below" -- i.e. almost always a face.
          quality: { rejection: presence.rejection },
        };
      }

      const geometry = analyzeHandGeometry(component, width, height, geometrySettings);
      if (!geometry.valid) {
        previousPalm = null;
        return {
          label: null,
          confidence: 0,
          state: 'LOW_CONFIDENCE',
          raisedFingerCount: null,
          quality: geometry.diagnostics?.invalidReason
            ? { rejection: geometry.diagnostics.invalidReason }
            : undefined,
        };
      }
      const confidence = buildConfidence(
        component,
        geometry,
        width,
        height,
        previousPalm,
        presence,
      );
      previousPalm = geometry.palm;
      const count = geometry.raisedFingerCount;
      const fistIsPlausible = count !== 0 || component.fillRatio >= 0.38;
      if (!fistIsPlausible || confidence < 0.55) {
        return {
          label: null,
          confidence,
          state: 'LOW_CONFIDENCE',
          raisedFingerCount: count,
          ...(debug ? { debug: geometry.diagnostics } : null),
        };
      }
      return {
        label: COUNT_TO_LABEL[count],
        confidence,
        state: count === 0 ? 'CLOSED_FIST' : 'FINGERS',
        raisedFingerCount: count,
        gameValue: count === 0 ? 6 : count,
        palm: geometry.palm,
        fingertips: geometry.fingertips,
        quality: {
          mask: component.foregroundShare,
          fillRatio: component.fillRatio,
          borderPenalty: 0,
        },
        ...(debug ? { debug: geometry.diagnostics } : null),
      };
    },
  };
}
