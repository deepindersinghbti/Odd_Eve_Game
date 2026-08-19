# Browser-native geometric gesture recognition

Gameplay gesture recognition uses only browser camera APIs, Canvas 2D pixels, typed
arrays, and project-owned JavaScript. It does not load a trained model or send frames
off the device.

## Session calibration

Camera mode requires two short captures:

1. **Empty background:** 16 frames are combined with a trimmed per-pixel mean.
2. **Open palm:** central foreground pixels are converted to YCbCr. Median Cb/Cr and
   median absolute deviation define adaptive chroma tolerances. The foreground
   threshold is derived from the lower fifth of observed palm/background differences.

Only numeric calibration parameters remain in memory. Raw frames are not uploaded,
saved, logged, or placed in React state.

## The guide box

`GUIDE_BOX` in `src/gesture/constants.js` is the single definition of the analyzed
region: a square covering 52% of the camera frame's short edge, centred horizontally
and pushed below the vertical centre. Both the processing crop (`crop.js`) and the
on-screen dashed frame (`GestureGuide.jsx`) are derived from it, so the region the
player aims at and the pixels actually analyzed cannot drift apart.

It is positioned deliberately low to exclude the player's face. Keeping the face out
of the ROI is far more reliable than trying to tell a face from a hand by colour
afterwards -- they are the same colour.

## Per-frame pipeline

The 256×256 mirrored guide crop is processed at roughly 10 frames per second:

1. Require calibrated YCbCr skin membership (widened by a published skin gamut used
   only as a union fallback, never alone), plus **exposure-invariant** foreground
   evidence: chroma distance from the background, or a luminance ratio measured after
   dividing out the frame's median luminance shift. Consumer webcams re-run auto
   exposure constantly -- and a hand entering the frame is itself enough to trigger it
   -- so a raw RGB difference against a background snapshot lights up the whole ROI or
   none of it as soon as the camera re-exposes.
2. Apply a conservative 3×3 opening and closing.
3. Label **all** 8-connected components, then select the most hand-like plausible one
   (`handPresence.js`). Selection is structural, not by area:
   - the blob must reach the bottom band of the guide box (wrist/forearm entering from
     below) -- a face floats free of every edge, which is the primary face rejector;
   - a near-solid, box-filling blob is rejected as too regular to be a hand;
   - a blob much wider than tall is rejected.
   Two similarly sized plausible blobs (a face and a hand both in view) mark the frame
   ambiguous and halve confidence rather than guessing.
4. Find the palm centre at the maximum of a two-pass chamfer distance transform.
5. Suppress the wrist region below the palm.
6. Build and smooth a 240-bin radial silhouette signature.
7. Find every raw local maximum of that signature (deliberately over-generates:
   mask/rasterization noise, palm/wrist corners, and folded-finger knuckle bulges all
   register here), then **cluster** raw peaks that are within ~4 degrees of each other
   (the angular width of rasterization jitter on one fingertip, not the gap between two
   real fingers) into a single representative candidate per cluster.
8. Validate each cluster's representative candidate: it must clear a normalized-length
   floor, a topographic-prominence floor, and (unless its prominence is already
   unambiguous) a contour curvature/sharpness check that rejects broad rounded bulges in
   favour of sharp fingertip apexes. `normalizedLength = (tipDistance - palmRadius) /
   palmRadius`.
9. Run circular non-maximum suppression across validated candidates (minimum angular +
   contour-bin separation, handling the 0/360 wraparound), then a valley-evidence pass
   that merges any two accepted candidates lacking a real radial dip between them --
   unless they are already comfortably separated, since two fingers held close together
   can have very little mutual dip while still being genuinely different fingers.

All of the above thresholds live in `GEOMETRY_CONFIG` in `src/gesture/constants.js`,
documented with units and rationale. Zero accepted protrusions maps to game value 6 only
when a plausible, sufficiently compact hand component and palm are present. An absent or
invalid component is `NO_HAND`; contradictory evidence is `LOW_CONFIDENCE` and cannot
submit.

## Diagnosed failure: one raised finger counted as two or three

Real-camera testing showed a single raised index finger reported as 2 or 3. The cause
was relying on an **absolute** normalized-length threshold to separate raised fingers
from curled knuckles.

That threshold has to thread a gap that moves. With the hand at a comfortable distance
the curled knuckles of a "one finger" gesture measure ~0.70–0.75 normalized against a
raised index at ~1.85 — the 0.85 threshold sits between them, but only just. Move the
hand closer and the palm radius shrinks, which inflates *every* normalized length
proportionally: in `tests/gesture/fingerCountingRegression.test.js` the same knuckles
measure **1.32** against an index of **4.93**. They clear 0.85 comfortably and are
counted, turning one finger into three. Hand size, camera distance, and how tightly a
player curls their fingers all move the absolute numbers; no single constant survives
all of them.

The fix is a **relative** gate (`relativeLengthRatio`, 0.45): a candidate must also
reach 45% of the longest validated protrusion in the same frame. Ratios are stable
where absolutes are not — genuinely raised fingers on one hand are comparable in length
(the thumb, the shortest on an open palm, still measures ~0.70 of the longest) while a
knuckle bulge is well under half. Sweeping a partially extended neighbouring finger,
the count flips from 1 to 2 between 55% and 70% extension, which is a reasonable
boundary for "raised". The absolute floor is retained as a backstop for the
single-finger and closed-fist cases, where there is no longer protrusion to compare
against.

## Diagnosed failure: face accepted as a hand, real hand rejected

Real-camera testing showed the recognizer treating the player's face as a hand (a face
is solid and box-filling, so it read as a closed fist -- game value 6) while reporting
`NO_HAND` for an actual hand. Both came from one root cause: the processed ROI was
`getCenteredSquareCrop`, the largest centred square of the whole camera frame, while
the visible "guide box" was merely `inset: 0.7rem` on the preview. What the player
aimed at and what was analyzed were both effectively the entire frame.

From there the face was inside the ROI; `findLargestComponent` returned only the
biggest skin blob, and a face is routinely bigger than a hand, so the hand was
discarded before any check ran. Nothing required wrist entry, so a face floating
mid-frame passed every gate. Meanwhile a hand at normal distance fell below the
`areaRatio` and bounding-box floors in a full-frame ROI (`NO_HAND`), and moving it
closer made the fingers touch the top edge, which was an instant rejection.

The fix is the guide box, all-component labelling with structural selection, and
exposure-invariant foreground evidence, all described above. Regression fixtures live
in `tests/gesture/handVersusFace.test.js`, including the decisive case: a smaller
wrist-connected blob must be chosen over a strictly larger floating one.

## Diagnosed failure: two fingers counted as five

An early version of this pipeline validated each raw radial peak against only
`normalizedLength` and `prominence`, with no curvature/sharpness check, no clustering of
raw peaks, and a duplicate-separation threshold (~4.6 degrees) narrower than the window
used to measure a peak's own prominence (~18 degrees). Synthetic-mask diagnostics
(`scripts/diagnose-overcount.js`) reproduced the reported "2 raised fingers -> 5 raised
fingers detected" failure: on a two-raised-finger silhouette where the three folded
digits (thumb, ring, pinky) bulge the outline slightly at their knuckles -- normal,
since a curled finger is rarely perfectly flush with the palm -- those bulges
(normalized length ~0.6-0.7) individually cleared the same bare length/prominence
thresholds used for real fingertips (normalized length ~1.1-1.7) and were accepted as
extra "fingers." The fix raises the length floor to sit in the gap between those two
populations (0.85), adds the curvature/valley/clustering stages above, and is covered by
regression fixtures in `tests/gesture/fingerCountingRegression.test.js` that assert raw
peaks can exceed the true count while the validated, clustered result does not.

## Temporal safeguards

- Minimum per-frame confidence: 0.75
- Sliding window: 10 decisions
- Required agreement: 8 of 10
- Minimum continuous hold: 700 ms
- Cooldown: 1200 ms
- Hand removal required before rearming

## Operating constraints

For reliable silhouettes use one upright hand, palm facing the camera, wrist entering
from the bottom, separated fingers, a plain non-skin-coloured background, and stable
lighting. Buttons and keyboard remain available at all times.

Synthetic tests verify geometry and state transitions, but real-camera validation on
the exhibition laptop is still required. Record per-value results and a confusion
matrix before claiming exhibition readiness.
