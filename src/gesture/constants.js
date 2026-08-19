export const GESTURE_LABELS = Object.freeze({
  NO_HAND: 'NO_HAND',
  ONE: 'ONE',
  TWO: 'TWO',
  THREE: 'THREE',
  FOUR: 'FOUR',
  FIVE: 'FIVE',
  SIX: 'SIX',
});

export const GESTURE_LABEL_LIST = Object.freeze(Object.values(GESTURE_LABELS));

export const GESTURE_TO_NUMBER = Object.freeze({
  [GESTURE_LABELS.ONE]: 1,
  [GESTURE_LABELS.TWO]: 2,
  [GESTURE_LABELS.THREE]: 3,
  [GESTURE_LABELS.FOUR]: 4,
  [GESTURE_LABELS.FIVE]: 5,
  [GESTURE_LABELS.SIX]: 6,
});

export const GESTURE_INSTRUCTIONS = Object.freeze([
  { label: GESTURE_LABELS.ONE, value: 1, description: 'Index finger' },
  { label: GESTURE_LABELS.TWO, value: 2, description: 'Index + middle fingers' },
  {
    label: GESTURE_LABELS.THREE,
    value: 3,
    description: 'Index + middle + ring fingers',
  },
  { label: GESTURE_LABELS.FOUR, value: 4, description: 'Four fingers, thumb folded' },
  { label: GESTURE_LABELS.FIVE, value: 5, description: 'Open palm' },
  { label: GESTURE_LABELS.SIX, value: 6, description: 'Closed fist' },
]);

export const INPUT_METHODS = Object.freeze({
  BUTTONS: 'BUTTONS',
  CAMERA: 'CAMERA',
});

export const RECOGNIZER_STATUS = Object.freeze({
  DISABLED: 'DISABLED',
  LOADING: 'LOADING',
  READY: 'READY',
  ERROR: 'ERROR',
});

export const CAMERA_STATUS = Object.freeze({
  IDLE: 'IDLE',
  PERMISSION_PENDING: 'PERMISSION_PENDING',
  GRANTED: 'GRANTED',
  DENIED: 'DENIED',
  MISSING: 'MISSING',
  BUSY: 'BUSY',
  ERROR: 'ERROR',
});

export const CALIBRATION_STATUS = Object.freeze({
  IDLE: 'IDLE',
  BACKGROUND_REQUIRED: 'BACKGROUND_REQUIRED',
  CAPTURING_BACKGROUND: 'CAPTURING_BACKGROUND',
  PALM_REQUIRED: 'PALM_REQUIRED',
  CAPTURING_PALM: 'CAPTURING_PALM',
  READY: 'READY',
  ERROR: 'ERROR',
});

export const DEFAULT_STABILITY_SETTINGS = Object.freeze({
  minimumConfidence: 0.75,
  windowSize: 10,
  requiredAgreement: 8,
  minimumHoldMs: 700,
  cooldownMs: 1200,
  predictionIntervalMs: 100,
});

export const GEOMETRIC_RECOGNITION_CONFIG = Object.freeze({
  processingSize: 256,
  calibrationFrameCount: 16,
  calibrationFrameIntervalMs: 70,
});

// The ONE definition of the hand guide region, as fractions of the camera
// frame. Both the processed crop (crop.js) and the on-screen overlay
// (GestureGuide.jsx) are derived from these numbers so the box the player aims
// at and the pixels actually analyzed can never drift apart.
//
// Sized and positioned deliberately to exclude the player's face: a square
// covering ~52% of the frame's short edge, centred horizontally and pushed
// below the vertical centre, where a hand held in front of the chest sits and a
// seated player's head does not. Excluding the face at the ROI stage is far
// more reliable than trying to tell a face from a hand by colour afterwards --
// they are the same colour.
export const GUIDE_BOX = Object.freeze({
  // Side length as a fraction of min(videoWidth, videoHeight).
  sizeRatio: 0.52,
  // Centre of the box as a fraction of the frame's width/height.
  centerXRatio: 0.5,
  centerYRatio: 0.62,
});

// Segmentation thresholds. Foreground evidence is deliberately built from
// EXPOSURE-INVARIANT quantities: consumer webcams continuously re-run auto
// exposure and auto white balance, and a hand entering the frame is itself a
// large enough scene change to trigger that. A raw per-pixel RGB difference
// against a background snapshot (the previous approach) therefore either lights
// up the whole ROI or none of it as soon as the camera re-exposes -- which is
// exactly the "a real hand reports NO_HAND" failure.
export const SEGMENTATION_CONFIG = Object.freeze({
  // Minimum chroma (Cb/Cr) distance from the calibrated background chroma for a
  // pixel to count as foreground. Chroma barely moves under exposure changes,
  // so this stays meaningful when luminance does not.
  minimumChromaDifference: 8,
  // Minimum |Y/Ybackground - 1| for a pixel to count as foreground on
  // brightness alone, measured AFTER subtracting the ROI's median luminance
  // ratio. A global exposure shift moves every pixel's ratio by the same
  // amount, so removing the median cancels it out and leaves genuine local
  // changes (a hand) standing proud.
  minimumLuminanceRatio: 0.22,
  // Squared-radius cutoff for the calibrated YCbCr skin ellipse.
  skinEllipseCutoff: 2.4,
  // A conservative, widely-published YCbCr skin gamut used as a UNION fallback
  // alongside the calibrated ellipse, so a poor calibration degrades accuracy
  // instead of detecting nothing at all. Never used as the only detector: a
  // pixel must still pass the foreground test, and any skin blob still has to
  // satisfy the hand-presence geometry to be counted.
  fallbackSkin: Object.freeze({
    cbMin: 77,
    cbMax: 133,
    crMin: 133,
    crMax: 180,
  }),
  minimumLuminance: 18,
  maximumLuminance: 248,
});

// Hand-presence gates, all as fractions of the guide box so they are
// resolution independent.
export const HAND_PRESENCE_CONFIG = Object.freeze({
  // Plausible blob area as a fraction of the guide box. The box is sized so a
  // correctly placed hand fills a substantial part of it, which is what makes
  // these bounds discriminating rather than nearly-always-true.
  minimumAreaRatio: 0.045,
  maximumAreaRatio: 0.72,
  // A hand reaches INTO the guide box from below, so its blob must touch the
  // bottom edge (wrist/forearm). A face, a background object, or a stray blob
  // floats free of that edge. This is the primary face rejector and encodes an
  // operating assumption the project already documents but never enforced.
  requireWristEntry: true,
  // Fraction of the bottom edge that must be covered to count as wrist entry.
  // Low enough to accept a narrow wrist, high enough to ignore a single-pixel
  // artifact clipping the edge.
  minimumBottomEdgeRatio: 0.04,
  // Contact with the other three edges is allowed but penalized, rather than
  // being an instant rejection: clipping one fingertip on the top edge should
  // lower confidence, not silently drop the whole frame to NO_HAND.
  maximumSideEdgeRatio: 0.55,
  // Largest share of the blob's bounding box it may fill while still being
  // plausibly a hand. A face is a near-solid convex ellipse and fills most of
  // its box; a hand (even a fist on a wrist) is less regular.
  maximumFillRatio: 0.92,
  minimumFillRatio: 0.14,
  // A hand plus forearm is taller than it is wide, or roughly square. A blob
  // much wider than tall is a face turned sideways, a shoulder line, or
  // background clutter.
  maximumAspectRatio: 1.9,
  // Minimum share of total foreground the chosen blob must hold. If two blobs
  // of similar size compete (e.g. face and hand both in view) the frame is
  // ambiguous and confidence should drop rather than guess.
  ambiguousComponentRatio: 0.62,
});

// Single immutable source of truth for every finger-counting geometry threshold.
// All values are normalized (fractions of palm radius, radians, or bin counts
// relative to `angleBins`) so behaviour does not depend on processing resolution.
export const GEOMETRY_CONFIG = Object.freeze({
  // Angular resolution of the polar boundary/radial signature. 240 bins over a
  // full circle = 1.5 degrees per bin.
  angleBins: 240,
  // Circular moving-average half-width (in bins) applied to the raw radial
  // signature before peak detection. Suppresses per-pixel rasterization and
  // morphology jaggedness without washing out genuinely separate fingertips.
  smoothingRadius: 3,
  // Minimum (distance(palmCenter, fingertip) - palmRadius) / palmRadius for a
  // candidate to be considered a visibly raised, straight protrusion. Raised
  // from an original 0.62: diagnostic fixtures showed a real gap between a
  // folded finger's knuckle bulge (normalized length ~0.6-0.7, since a curled
  // knuckle still pokes past the palm boundary a little) and a genuinely
  // raised finger (>=1.1 even for the shortest finger in a spread-open-palm
  // fixture) -- 0.85 sits in the middle of that gap with margin on both sides.
  minimumNormalizedLength: 0.85,
  // Relative protrusion gate. A candidate must also reach this fraction of the
  // LONGEST validated protrusion in the same frame to count as a raised finger.
  //
  // The absolute threshold above cannot carry this alone: on a real hand the
  // curled knuckles of a "one finger" gesture measure ~0.7-0.8 normalized while
  // the raised index measures ~1.8-2.0, so a single constant has to thread a
  // narrow gap that moves with hand size, camera distance, and how tightly the
  // player curls their fingers. Ratios are stable where absolutes are not:
  // genuinely raised fingers on one hand are comparable in length (the thumb,
  // the shortest, still measures ~0.7 of the longest on an open palm), while a
  // knuckle bulge is well under half the longest finger.
  relativeLengthRatio: 0.45,
  // Minimum candidate height above the higher of its two bounding valleys, as
  // a fraction of palm radius. Kept deliberately low: two fingers held close
  // together can have very little mutual TOPOGRAPHIC prominence even though
  // both are genuinely raised (a peak sitting on the immediate flank of a
  // taller sibling has near-zero prominence by definition, even though it is
  // a real finger) -- normalizedLength, curvature, and the separate
  // valley-between-accepted-candidates check carry most of the discriminating
  // weight. This threshold's job is only to reject near-flat rasterization
  // noise that technically qualifies as a local maximum.
  minimumProminence: 0.03,
  // Maximum bins walked each direction when measuring a peak's topographic
  // prominence (see computeProminence): the walk stops as soon as it reaches a
  // point at least as tall as the peak, so this is a safety cap against
  // wrapping most of the way around a flat/noisy silhouette, not the normal
  // stopping condition.
  peakNeighbourhood: 14,
  // Angular window (radians) used to group raw local maxima that plausibly
  // belong to the same physical fingertip lobe (e.g. rasterization jitter on a
  // single rounded fingertip) before validation. ~4.3 degrees -- intentionally
  // narrower than the closest realistic inter-finger spacing (two fully
  // adjacent raised fingers, e.g. index + middle, are still ~7+ degrees apart
  // at typical framing) so real neighbouring fingers are never folded into one
  // cluster.
  clusterAngularWindow: 0.075,
  // Minimum angle (radians) required between two ACCEPTED fingertips.
  // ~6.9 degrees -- rejects leftover near-duplicates after clustering while
  // staying below the closest realistic adjacent-finger spacing.
  minimumAngularSeparation: 0.12,
  // Minimum contour/bin-index gap required between two accepted fingertips,
  // enforced alongside the angular separation as an explicit safety net near
  // the 0/360 wraparound boundary where angle-only checks are easy to get
  // wrong.
  minimumBinSeparation: 4,
  // Fraction of palm radius used as the arc-length offset (converted to bins)
  // sampled on each side of a candidate to estimate contour curvature/sharpness.
  curvatureArcRatio: 0.6,
  // Maximum enclosed angle (degrees) at a candidate's curvature sample points.
  // A true fingertip apex is narrow/acute; a folded-finger knuckle bulge, the
  // palm-to-finger "shoulder", or a wrist corner is broad and exceeds this.
  maxCurvatureAngleDeg: 140,
  // A candidate whose prominence already clears minimumProminence by at least
  // this multiple is exempted from the curvature gate. Angle-bin-offset
  // curvature sampling can misfire on tightly packed adjacent fingers (the
  // offset can land on a neighbouring finger instead of the candidate's own
  // side); a candidate with strong, unambiguous prominence does not need a
  // second, noisier signal to confirm it. Marginal-prominence candidates
  // (exactly the profile of a folded-finger knuckle bulge) still need to pass
  // the curvature check to be accepted.
  curvatureExemptProminenceRatio: 1.8,
  // Minimum required fractional radial drop, relative to the smaller of two
  // adjacent accepted fingertips' radial distance, along the arc between them.
  // Two accepted candidates without a real dip between them are almost
  // certainly two lobes of the same finger and get merged (weaker one kept out).
  valleyDepthRatio: 0.14,
  // A candidate pair already separated by at least this multiple of
  // minimumBinSeparation is exempt from the valley-depth requirement. Two
  // fingers held close together (e.g. index + middle) can have very little
  // radial dip between their tips even though they are genuinely two separate
  // fingers -- the notch between them is often only visible near the base, not
  // along every ray from palm centre. Genuine duplicate lobes of one physical
  // fingertip are essentially always within a bin or two of the hard NMS
  // separation cutoff (minimumBinSeparation/minimumAngularSeparation already
  // reject anything closer); a pair that cleared that cutoff with real margin
  // is trusted on their independent per-candidate evidence instead.
  valleyExemptBinSeparationRatio: 1.5,
  // Palm centre is assumed to sit `wristOffsetRatio * palmRadius` below itself;
  // contour points below that line are excluded from fingertip search.
  wristOffsetRatio: 0.55,
  // Palm radius must be at least this fraction of min(width, height) of the
  // processed ROI to be treated as valid hand geometry.
  minimumPalmRadiusRatio: 0.035,
  // Hard cap on accepted fingertips per frame (a hand has 5 fingers).
  maxFingertips: 5,
});
