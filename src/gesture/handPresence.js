import { HAND_PRESENCE_CONFIG } from './constants.js';

// Why this module exists
// ----------------------
// Skin colour cannot distinguish a hand from a face -- they are the same
// colour, and a face is often the LARGER blob. The discriminating evidence is
// structural, not chromatic:
//
//   * A hand reaches into the guide box from below, so its silhouette is
//     continuous with the bottom edge (wrist / forearm).
//   * A face floats free of every edge, and is a near-solid convex ellipse
//     that fills most of its bounding box.
//   * A hand plus forearm is taller than wide, or roughly square; a shoulder
//     line or a sideways face is much wider than tall.
//
// Each component is scored against those expectations and the best plausible
// one is chosen. Rejection reasons are always reported so a frame that fails
// is explainable rather than silently becoming NO_HAND.

export function describeComponent(component, width, height, overrides = {}) {
  const settings = { ...HAND_PRESENCE_CONFIG, ...overrides };
  const boundsWidth =
    component.boundsWidth ?? component.bounds.maxX - component.bounds.minX + 1;
  const boundsHeight =
    component.boundsHeight ?? component.bounds.maxY - component.bounds.minY + 1;

  // Band-based, not last-row-based: 3x3 morphology never writes the outermost
  // pixel row, so a strict edge test can never be satisfied post-cleanMask.
  const bottomEdgeRatio =
    (component.bottomBandContacts ?? component.borderSides.bottom) / width;
  const topEdgeRatio = component.borderSides.top / width;
  const leftEdgeRatio = component.borderSides.left / height;
  const rightEdgeRatio = component.borderSides.right / height;
  // Wider-than-tall is the suspicious direction; taller-than-wide is normal for
  // a hand on a forearm, so only penalize width excess.
  const aspectRatio = boundsWidth / boundsHeight;

  return {
    areaRatio: component.areaRatio,
    fillRatio: component.fillRatio,
    foregroundShare: component.foregroundShare,
    boundsWidth,
    boundsHeight,
    aspectRatio,
    bottomEdgeRatio,
    topEdgeRatio,
    leftEdgeRatio,
    rightEdgeRatio,
    hasWristEntry: bottomEdgeRatio >= settings.minimumBottomEdgeRatio,
  };
}

export function rejectHandComponent(component, width, height, overrides = {}) {
  const settings = { ...HAND_PRESENCE_CONFIG, ...overrides };
  if (!component) return 'NO_COMPONENT';
  const metrics = describeComponent(component, width, height, settings);

  if (metrics.areaRatio < settings.minimumAreaRatio) return 'AREA_TOO_SMALL';
  if (metrics.areaRatio > settings.maximumAreaRatio) return 'AREA_TOO_LARGE';
  // The decisive face rejector: a face does not touch the bottom of the guide
  // box, a hand reaching in from below always does.
  if (settings.requireWristEntry && !metrics.hasWristEntry) return 'NO_WRIST_ENTRY';
  if (metrics.fillRatio > settings.maximumFillRatio) return 'TOO_SOLID_FOR_HAND';
  if (metrics.fillRatio < settings.minimumFillRatio) return 'FRAGMENTED';
  if (metrics.aspectRatio > settings.maximumAspectRatio) return 'TOO_WIDE_FOR_HAND';
  if (
    metrics.leftEdgeRatio > settings.maximumSideEdgeRatio ||
    metrics.rightEdgeRatio > settings.maximumSideEdgeRatio ||
    metrics.topEdgeRatio > settings.maximumSideEdgeRatio
  ) {
    return 'OVERFLOWS_GUIDE_BOX';
  }
  return null;
}

// Higher is more hand-like. Used only to choose between components that have
// ALREADY passed rejectHandComponent, so it never rescues an implausible blob.
function handScore(metrics) {
  const wristEvidence = Math.min(1, metrics.bottomEdgeRatio / 0.25);
  const sizeEvidence = Math.min(1, metrics.areaRatio / 0.3);
  // A hand is less box-filling than a face; reward moderate fill ratios.
  const shapeEvidence = 1 - Math.min(1, Math.abs(metrics.fillRatio - 0.5) / 0.5);
  const uprightEvidence = 1 - Math.min(1, Math.max(0, metrics.aspectRatio - 1) / 1);
  return (
    wristEvidence * 0.4 + sizeEvidence * 0.2 + shapeEvidence * 0.2 + uprightEvidence * 0.2
  );
}

// Chooses the most hand-like plausible component, and reports whether the
// choice was ambiguous (two similarly sized blobs competing -- typically a face
// and a hand both in view), so confidence can be reduced instead of guessing.
export function selectHandComponent(components, width, height, overrides = {}) {
  const settings = { ...HAND_PRESENCE_CONFIG, ...overrides };
  if (!components?.length) {
    return { component: null, rejection: 'NO_COMPONENT', candidates: [] };
  }

  const candidates = components.map((component) => {
    const rejection = rejectHandComponent(component, width, height, settings);
    const metrics = describeComponent(component, width, height, settings);
    return {
      component,
      metrics,
      rejection,
      score: rejection ? 0 : handScore(metrics),
    };
  });

  const accepted = candidates.filter((candidate) => !candidate.rejection);
  if (!accepted.length) {
    return {
      component: null,
      // Report the largest blob's reason: it is the one the player most likely
      // intended to be their hand, so it is the most useful thing to explain.
      rejection: candidates[0].rejection,
      candidates,
    };
  }

  accepted.sort((first, second) => second.score - first.score);
  const best = accepted[0];
  const runnerUp = accepted[1];
  const ambiguous = Boolean(
    runnerUp &&
    runnerUp.component.area / best.component.area >= settings.ambiguousComponentRatio,
  );

  return {
    component: best.component,
    metrics: best.metrics,
    score: best.score,
    rejection: null,
    ambiguous,
    candidates,
  };
}
