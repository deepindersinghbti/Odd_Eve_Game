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

// Mean width of the blob across the two stacked bands at its lowest edge,
// expressed as (lower band / upper band). A blob that was CUT OFF -- a sleeve
// cuff, or a forearm leaving the frame -- keeps its width right to the edge and
// scores near 1. A blob that ENDS naturally in a rounded cap -- a chin, a fist
// held clear of the frame edge -- narrows sharply and scores well below 1.
//
// Returns null when the blob is too short to carry two bands, which is treated
// as "cannot tell" (no cuff entry), never as a silent pass.
function measureBottomFlatness(component, width, height, settings) {
  const bandRows = Math.max(2, Math.round(height * settings.cuffSampleRatio));
  const maxY = component.bounds.maxY;
  const lowerStart = maxY - bandRows + 1;
  const upperStart = lowerStart - bandRows;
  if (upperStart < component.bounds.minY) return null;

  let lower = 0;
  let upper = 0;
  for (const index of component.indices) {
    const y = Math.floor(index / width);
    if (y >= lowerStart && y <= maxY) lower += 1;
    else if (y >= upperStart && y < lowerStart) upper += 1;
  }
  if (upper === 0) return null;
  return lower / upper;
}

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

  // (a) Bare forearm: the blob runs off the bottom of the guide box.
  const touchesBottom = bottomEdgeRatio >= settings.minimumBottomEdgeRatio;

  // (b) Sleeved forearm: the blob stops short of the bottom, but ends in a flat
  // cut close to the edge rather than a rounded cap. Without this a long sleeve
  // makes the hand indistinguishable from a floating face and the game becomes
  // unplayable -- see maximumBottomGapRatio in constants.js.
  const bottomGapRatio = (height - 1 - component.bounds.maxY) / height;
  const bottomFlatness = touchesBottom
    ? null
    : measureBottomFlatness(component, width, height, settings);
  const hasCuffEntry =
    !touchesBottom &&
    bottomGapRatio <= settings.maximumBottomGapRatio &&
    bottomFlatness !== null &&
    bottomFlatness >= settings.minimumCuffFlatness;

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
    bottomGapRatio,
    bottomFlatness,
    entryMode: touchesBottom ? 'BOTTOM_EDGE' : hasCuffEntry ? 'SLEEVE_CUFF' : null,
    hasWristEntry: touchesBottom || hasCuffEntry,
  };
}

export function rejectHandComponent(component, width, height, overrides = {}) {
  const settings = { ...HAND_PRESENCE_CONFIG, ...overrides };
  if (!component) return 'NO_COMPONENT';
  const metrics = describeComponent(component, width, height, settings);

  if (metrics.areaRatio < settings.minimumAreaRatio) return 'AREA_TOO_SMALL';
  if (metrics.areaRatio > settings.maximumAreaRatio) return 'AREA_TOO_LARGE';
  // The decisive face rejector: a hand reaching in from below either runs off
  // the bottom edge (bare arm) or ends in a flat cuff cut just above it
  // (sleeved arm). A face floats clear of the edge and ends in a rounded chin.
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

// How far through the gates a blob got before being rejected, in the order
// rejectHandComponent applies them. Higher means it looked more like a hand,
// so its rejection reason is the most useful one to show the player.
const REJECTION_ORDER = [
  'NO_COMPONENT',
  'AREA_TOO_SMALL',
  'AREA_TOO_LARGE',
  'NO_WRIST_ENTRY',
  'TOO_SOLID_FOR_HAND',
  'FRAGMENTED',
  'TOO_WIDE_FOR_HAND',
  'OVERFLOWS_GUIDE_BOX',
];
function rejectionRank(reason) {
  const index = REJECTION_ORDER.indexOf(reason);
  return index === -1 ? 0 : index;
}

// Higher is more hand-like. Used only to choose between components that have
// ALREADY passed rejectHandComponent, so it never rescues an implausible blob.
function handScore(metrics) {
  // A sleeved hand has no bottom-edge contact at all, so score its cuff
  // evidence instead -- otherwise it would always lose a tie to a bare-armed
  // competitor, which is the same bias that made the sleeve case unplayable.
  const wristEvidence =
    metrics.entryMode === 'SLEEVE_CUFF'
      ? Math.min(1, metrics.bottomFlatness ?? 0)
      : Math.min(1, metrics.bottomEdgeRatio / 0.25);
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
    // Report the reason from the blob that came CLOSEST to being a hand, not
    // simply the largest. The player's hand is often not the biggest skin blob
    // in the box -- that is usually a face -- so reporting the largest blob's
    // reason explains the wrong object and sends the player the wrong hint.
    // Ranking by how many gates a blob passed surfaces the near miss instead.
    const nearest = [...candidates].sort(
      (first, second) => rejectionRank(second.rejection) - rejectionRank(first.rejection),
    )[0];
    return {
      component: null,
      rejection: nearest.rejection,
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
