import { GEOMETRY_CONFIG } from './constants.js';
import { findPalmGeometry } from './distanceTransform.js';

const TWO_PI = Math.PI * 2;

function angleDistance(first, second) {
  const difference = Math.abs(first - second) % TWO_PI;
  return Math.min(difference, TWO_PI - difference);
}

function circularBinDistance(first, second, totalBins) {
  const difference = Math.abs(first - second) % totalBins;
  return Math.min(difference, totalBins - difference);
}

function smoothCircular(values, radius) {
  const smoothed = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    let total = 0;
    let weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sample = values[(index + offset + values.length) % values.length];
      const sampleWeight = radius + 1 - Math.abs(offset);
      total += sample * sampleWeight;
      weight += sampleWeight;
    }
    smoothed[index] = total / weight;
  }
  return smoothed;
}

function isBoundary(mask, width, height, x, y) {
  if (!mask[y * width + x]) return false;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= width ||
        nextY >= height ||
        !mask[nextY * width + nextX]
      ) {
        return true;
      }
    }
  }
  return false;
}

function findPeakPoint(points, radial, index, searchRadius) {
  let bestPoint = null;
  let bestDistance = 0;
  for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
    const sampleIndex = (index + offset + points.length) % points.length;
    if (points[sampleIndex] && radial[sampleIndex] > bestDistance) {
      bestPoint = points[sampleIndex];
      bestDistance = radial[sampleIndex];
    }
  }
  return bestPoint;
}

export function calculateVisibleFingerLength(
  radialDistance,
  palmRadiusAlongRay,
  palmRadius,
) {
  if (!(palmRadius > 0)) return 0;
  return Math.max(0, radialDistance - palmRadiusAlongRay) / palmRadius;
}

// Every local maximum of the smoothed radial signature, unfiltered. This is the
// raw-candidate stage: it deliberately over-generates (mask/rasterization noise,
// palm/wrist corners, and folded-finger knuckle bulges all show up here) so that
// every later stage can reject with a documented reason instead of silently
// dropping evidence.
function findRawPeaks(smoothed) {
  const peaks = [];
  const length = smoothed.length;
  for (let index = 0; index < length; index += 1) {
    const distance = smoothed[index];
    const previous = smoothed[(index - 1 + length) % length];
    const next = smoothed[(index + 1) % length];
    if (distance < previous) continue;
    if (distance <= next) continue;
    peaks.push(index);
  }
  return peaks;
}

// Standard topographic prominence: walk outward from the peak in each
// direction, tracking the lowest point seen, until a point at least as tall as
// the peak itself is reached (its "key col" in that direction) or the walk
// hits `maxSteps`. Prominence is the peak's height above the HIGHER of its two
// cols -- the side that is harder to "escape" from, so a peak sandwiched
// between two taller/comparable neighbours is correctly scored as low
// prominence on that side. This adapts to actual finger spacing instead of a
// fixed-size window, which either missed real valleys just past its edge (for
// widely spaced fingers) or reached across a close sibling's own peak into
// unrelated terrain (for tightly spaced fingers).
function computeProminence(smoothed, index, maxSteps, palmRadius) {
  const length = smoothed.length;
  const distance = smoothed[index];

  const walk = (direction) => {
    let valley = distance;
    for (let offset = 1; offset <= maxSteps; offset += 1) {
      const sample = smoothed[(index + direction * offset + length) % length];
      valley = Math.min(valley, sample);
      if (sample >= distance) break;
    }
    return valley;
  };

  const leftValley = walk(-1);
  const rightValley = walk(1);
  return (distance - Math.max(leftValley, rightValley)) / palmRadius;
}

// Groups raw peak bin-indices that are within `clusterAngularWindow` of each
// other (converted to bins) into the same physical-fingertip cluster, handling
// the 0/360 wraparound correctly since bins are compared circularly.
function clusterRawPeaks(rawPeakBins, totalBins, clusterAngularWindow) {
  if (rawPeakBins.length === 0) return [];
  const windowBins = Math.max(1, Math.round((clusterAngularWindow / TWO_PI) * totalBins));
  const sorted = [...rawPeakBins].sort((first, second) => first - second);
  const clusters = [];
  let current = [sorted[0]];
  for (let index = 1; index < sorted.length; index += 1) {
    const bin = sorted[index];
    if (bin - current[current.length - 1] <= windowBins) {
      current.push(bin);
    } else {
      clusters.push(current);
      current = [bin];
    }
  }
  clusters.push(current);
  // Merge the first and last cluster if they actually wrap around 0/360.
  if (
    clusters.length > 1 &&
    sorted[0] + totalBins - sorted[sorted.length - 1] <= windowBins
  ) {
    const wrapped = clusters.pop();
    clusters[0] = [...wrapped, ...clusters[0]];
  }
  return clusters;
}

// Contour curvature/sharpness at a candidate: sample two boundary points at an
// arc-length offset scaled by palm radius (never a fixed pixel offset) on each
// side of the candidate, along the polar-ordered boundary, and measure the
// enclosed angle at the candidate. A true fingertip apex is narrow; a broad
// rounded bulge (folded-finger knuckle, palm/finger "shoulder", wrist corner)
// is not. Returns null when there isn't enough silhouette support to measure it
// at all -- that is treated as a rejection, never a silent pass.
function computeCurvatureAngleDeg(points, radial, index, palmRadius, settings) {
  const distance = radial[index];
  if (!(distance > 0) || !(palmRadius > 0)) return null;
  const angleOffset = (settings.curvatureArcRatio * palmRadius) / distance;
  const binOffset = Math.max(2, Math.round((angleOffset / TWO_PI) * settings.angleBins));
  const centre = points[index];
  const left = findPeakPoint(points, radial, index - binOffset, 2);
  const right = findPeakPoint(points, radial, index + binOffset, 2);
  if (!centre || !left || !right) return null;
  const v1x = left.x - centre.x;
  const v1y = left.y - centre.y;
  const v2x = right.x - centre.x;
  const v2y = right.y - centre.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 < 1 || len2 < 1) return null;
  const cosine = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (len1 * len2)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function validateCandidate({
  point,
  normalizedLength,
  prominence,
  curvatureAngle,
  wristLine,
  width,
  settings,
}) {
  if (!point) return 'NO_SILHOUETTE_SUPPORT';
  if (point.y > wristLine) return 'WRIST_EXCLUSION';
  if (point.x <= 1 || point.y <= 1 || point.x >= width - 2) return 'ROI_BORDER';
  if (normalizedLength < settings.minimumNormalizedLength)
    return 'INSUFFICIENT_PROTRUSION';
  if (prominence < settings.minimumProminence) return 'INSUFFICIENT_PROMINENCE';
  // Strongly prominent candidates are exempt from the curvature gate (see
  // curvatureExemptProminenceRatio doc in constants.js): angle-bin-offset
  // curvature sampling is not reliable when fingers are packed close together,
  // so it is only load-bearing for marginal candidates -- exactly the profile
  // of a folded-finger knuckle bulge or a palm/wrist "shoulder" point.
  if (
    prominence >=
    settings.minimumProminence * settings.curvatureExemptProminenceRatio
  ) {
    return null;
  }
  if (curvatureAngle === null) return 'NO_CURVATURE_SUPPORT';
  if (curvatureAngle > settings.maxCurvatureAngleDeg) return 'NOT_SHARP_ENOUGH';
  return null;
}

function candidateStrength(candidate) {
  return candidate.normalizedLength + candidate.prominence;
}

// Circular non-maximum suppression across validated candidates: strongest
// candidate first, reject anything too close in angle OR bin index to an
// already-accepted candidate. Handles the 0/360 boundary via angleDistance /
// circularBinDistance, both of which are already circular.
function suppressDuplicates(candidates, settings, totalBins, rejectedOut) {
  const sorted = [...candidates].sort(
    (a, b) => candidateStrength(b) - candidateStrength(a),
  );
  const accepted = [];
  for (const candidate of sorted) {
    const duplicate = accepted.some(
      (existing) =>
        angleDistance(existing.angle, candidate.angle) <
          settings.minimumAngularSeparation ||
        circularBinDistance(existing.binIndex, candidate.binIndex, totalBins) <
          settings.minimumBinSeparation,
    );
    if (duplicate) {
      rejectedOut.push({ ...candidate, rejectionReason: 'DUPLICATE_OF_ACCEPTED' });
      continue;
    }
    accepted.push(candidate);
    if (accepted.length >= settings.maxFingertips) break;
  }
  return accepted;
}

// Topological cross-check: two adjacent accepted fingertips without a real dip
// between them are almost certainly two lobes of the same finger, not two
// separate fingers. Walks the accepted set in angular order (including the
// wraparound pair) and merges any pair lacking sufficient valley depth,
// dropping the weaker candidate. A single accepted candidate is left alone --
// one raised finger must remain distinguishable without any valley evidence.
function enforceValleyEvidence(accepted, radial, settings, palmRadius, rejectedOut) {
  if (accepted.length < 2) return accepted;
  let current = [...accepted].sort((a, b) => a.angle - b.angle);
  const totalBins = radial.length;

  // Uses the RAW (unsmoothed) per-bin signal, not the smoothed one: a genuine
  // valley between two closely spaced but distinct fingers is often only a
  // handful of bins wide, and the circular smoothing pass already blurs a dip
  // that narrow, which would make two real adjacent fingers look like one
  // shallow lobe. The raw per-bin max-radius signal preserves it.
  const minimumBetween = (fromBin, toBin) => {
    const forwardSpan = (toBin - fromBin + totalBins) % totalBins;
    let minimum = Infinity;
    for (let step = 1; step < forwardSpan; step += 1) {
      const sample = radial[(fromBin + step) % totalBins];
      if (sample > 0) minimum = Math.min(minimum, sample);
    }
    return { minimum, span: forwardSpan };
  };

  let merged = true;
  while (merged && current.length > 1) {
    merged = false;
    for (let index = 0; index < current.length; index += 1) {
      const a = current[index];
      const b = current[(index + 1) % current.length];
      if (a === b) continue;
      const binGap = circularBinDistance(a.binIndex, b.binIndex, totalBins);
      const exemptGap =
        settings.minimumBinSeparation * settings.valleyExemptBinSeparationRatio;
      if (binGap >= exemptGap) continue;
      const { minimum: valley, span } = minimumBetween(a.binIndex, b.binIndex);
      // A span this short does not carry enough independent samples for a
      // meaningful valley measurement -- the bin/angular-separation NMS pass
      // already guarantees a minimum gap, so trust that instead of forcing a
      // valley verdict out of too little data.
      if (span <= settings.minimumBinSeparation || !Number.isFinite(valley)) continue;
      const smallerPeak = Math.min(a.radialDistance, b.radialDistance);
      const depthRatio = (smallerPeak - valley) / smallerPeak;
      if (depthRatio < settings.valleyDepthRatio) {
        const weaker = candidateStrength(a) <= candidateStrength(b) ? a : b;
        rejectedOut.push({ ...weaker, rejectionReason: 'INSUFFICIENT_VALLEY_EVIDENCE' });
        current = current.filter((item) => item !== weaker);
        merged = true;
        break;
      }
    }
  }
  return current;
}

export function analyzeHandGeometry(component, width, height, overrides = {}) {
  const settings = { ...GEOMETRY_CONFIG, ...overrides };
  const palm = findPalmGeometry(component.mask, width, height);
  if (!palm || palm.radius < Math.min(width, height) * settings.minimumPalmRadiusRatio) {
    return {
      valid: false,
      raisedFingerCount: null,
      fingertips: [],
      palm: null,
      diagnostics: { invalidReason: 'INVALID_PALM_GEOMETRY' },
    };
  }

  const radial = new Float32Array(settings.angleBins);
  const points = Array(settings.angleBins).fill(null);
  const wristLine = palm.center.y + palm.radius * settings.wristOffsetRatio;
  for (let y = 0; y < height; y += 1) {
    if (y > wristLine) continue;
    for (let x = 0; x < width; x += 1) {
      if (!isBoundary(component.mask, width, height, x, y)) continue;
      const deltaX = x - palm.center.x;
      const deltaY = y - palm.center.y;
      const distance = Math.hypot(deltaX, deltaY);
      let angle = Math.atan2(deltaY, deltaX);
      if (angle < 0) angle += TWO_PI;
      const bin = Math.round((angle / TWO_PI) * settings.angleBins) % settings.angleBins;
      if (distance > radial[bin]) {
        radial[bin] = distance;
        points[bin] = { x, y };
      }
    }
  }

  const smoothed = smoothCircular(radial, settings.smoothingRadius);
  const rawPeakBins = findRawPeaks(smoothed);
  const clusters = clusterRawPeaks(
    rawPeakBins,
    smoothed.length,
    settings.clusterAngularWindow,
  );

  const validated = [];
  const rejected = [];
  for (const cluster of clusters) {
    const repIndex = cluster.reduce(
      (best, index) => (smoothed[index] > smoothed[best] ? index : best),
      cluster[0],
    );
    const distance = smoothed[repIndex];
    const point = findPeakPoint(points, radial, repIndex, settings.smoothingRadius + 1);
    const prominence = computeProminence(
      smoothed,
      repIndex,
      settings.peakNeighbourhood,
      palm.radius,
    );
    const normalizedLength = calculateVisibleFingerLength(
      distance,
      palm.radius,
      palm.radius,
    );
    const curvatureAngle = computeCurvatureAngleDeg(
      points,
      radial,
      repIndex,
      palm.radius,
      settings,
    );
    const angle = (repIndex / smoothed.length) * TWO_PI;
    const record = {
      x: point?.x ?? null,
      y: point?.y ?? null,
      angle,
      binIndex: repIndex,
      clusterSize: cluster.length,
      radialDistance: distance,
      normalizedLength,
      prominence,
      curvatureAngle,
    };
    const rejectionReason = validateCandidate({
      point,
      normalizedLength,
      prominence,
      curvatureAngle,
      wristLine,
      width,
      settings,
    });
    if (rejectionReason) rejected.push({ ...record, rejectionReason });
    else validated.push(record);
  }

  // Relative protrusion gate: keep only candidates comparable in length to the
  // longest one in this frame. Self-normalizes to hand size, camera distance,
  // and finger curl, which a single absolute threshold cannot do -- see
  // relativeLengthRatio in constants.js.
  const longestProtrusion = validated.reduce(
    (longest, candidate) => Math.max(longest, candidate.normalizedLength),
    0,
  );
  const relativeFloor = longestProtrusion * settings.relativeLengthRatio;
  const longEnough = [];
  for (const candidate of validated) {
    if (candidate.normalizedLength < relativeFloor) {
      rejected.push({ ...candidate, rejectionReason: 'SHORT_RELATIVE_TO_LONGEST' });
    } else {
      longEnough.push(candidate);
    }
  }

  const accepted = suppressDuplicates(longEnough, settings, smoothed.length, rejected);
  const fingertips = enforceValleyEvidence(
    accepted,
    radial,
    settings,
    palm.radius,
    rejected,
  );
  fingertips.sort((first, second) => first.x - second.x);

  return {
    valid: true,
    raisedFingerCount: fingertips.length,
    fingertips,
    palm: { center: palm.center, radius: palm.radius },
    wristLine,
    radialSignature: smoothed,
    diagnostics: {
      rawPeakCount: rawPeakBins.length,
      clusterCount: clusters.length,
      acceptedBeforeValleyPass: accepted.length,
      rejectedCandidates: rejected,
    },
  };
}
