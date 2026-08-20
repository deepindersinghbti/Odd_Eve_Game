# Browser-native geometric gesture recognition

Gameplay gesture recognition uses only browser camera APIs, Canvas 2D pixels, typed
arrays, and project-owned JavaScript. It does not load a trained model or send frames
off the device.

## Session calibration

Camera mode requires two short captures:

1. **Empty background:** 16 frames are combined with a trimmed per-pixel mean, then
   converted to YCbCr once and stored. The background never changes during a session,
   so converting it here instead of per pixel per frame removes the pipeline's largest
   per-frame cost.
2. **Open palm:** palm pixels are selected with exactly the same drift-corrected
   foreground test used during play, then stored in the background capture's colour
   space. Median Cb/Cr and median absolute deviation define adaptive chroma tolerances.

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

1. Divide out the camera's measured **per-channel gains**, then require calibrated
   YCbCr skin membership (widened by a published skin gamut used only as a union
   fallback, never alone), plus foreground evidence: chroma distance from the
   background, or a luminance ratio. Consumer webcams re-run auto exposure and auto
   white balance constantly -- and a hand entering the frame is itself enough to
   trigger both -- so comparing raw pixels to a background snapshot lights up the whole
   ROI or none of it the moment the camera re-tunes.

   The gains are modelled multiplicatively in RGB rather than as a chroma offset,
   because a channel gain shifts a pixel's chroma **in proportion to that pixel's own
   value**. One additive offset therefore cannot correct a dark background and bright
   skin at the same time. Because the YCbCr transform is linear, the correction folds
   into the conversion coefficients and costs nothing per pixel.
2. Apply a conservative 3×3 opening and closing.
3. Label **all** 8-connected components, then select the most hand-like plausible one
   (`handPresence.js`). Selection is structural, not by area:
   - the blob must enter from below, which is the primary face rejector. That is
     satisfied either by running off the bottom edge (bare forearm) or by ending in a
     flat, locally straight cut just above it (a sleeve cuff). A face floats clear of
     the edge and ends in a rounded chin, satisfying neither;
   - a near-solid, box-filling blob is rejected as too regular to be a hand;
   - a blob much wider than tall is rejected.
   Two similarly sized plausible blobs (a face and a hand both in view) mark the frame
   ambiguous and halve confidence rather than guessing.
4. Find the palm centre at the maximum of a two-pass chamfer distance transform. Pixels
   outside the ROI count as unknown rather than background, so a hand running off the
   guide box is not pinched at the edge -- otherwise an identical hand reports a smaller
   palm radius purely for sitting lower in the frame, and palm radius is the normaliser
   for every finger-length measurement.
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

## Capturing a real misread (development only)

Every fix in this subsystem so far was driven by synthetic fixtures, which means
each one only tested a failure that had already been imagined. The
one-finger-as-three bug survived four such fixtures because none of them modelled
a hand close to the camera.

In a development build the recognizer retains the last few frames alongside the
pipeline's own reasoning, reachable from the browser console:

```text
__HAND_CRICKET_GESTURE_DEBUG__.last()      // latest frame + reasoning
__HAND_CRICKET_GESTURE_DEBUG__.fixture()   // serialisable JSON record
__HAND_CRICKET_GESTURE_DEBUG__.download()  // save it (explicit action only)
__HAND_CRICKET_GESTURE_DEBUG__.clear()     // drop retained frames
```

A downloaded fixture replays through `fixtureToFrame()` to reproduce the exact
misread as a deterministic test, so a fix can be driven by what the camera
actually saw rather than by a silhouette someone guessed at.

Frames live in a small in-memory ring buffer and nowhere else. Nothing is written
to disk, storage, or the network unless a developer explicitly calls `download()`.
Production builds contain none of this: the recognizer defaults to an inert
recorder that the capture module is never imported for, and the bundle is
asserted to contain no trace of the capture or export code.

## Diagnosed failure: white balance drift made the hand disappear

Calibrating under one white balance and playing under another made the hand vanish
entirely -- `NO_HAND`, not a wrong count. Auto white balance scales the red and blue
channels against green, which moves chroma; since both the skin test and the foreground
test are chroma-based, a warm shift pushed skin outside the calibrated ellipse *and*
past the fallback gamut's `cr` ceiling of 180 (measured `cr` reached 184 at R x1.20).
Compensating exposure alone could not help, because the shift is not uniform across
channels.

The first attempt -- an additive chroma offset measured from the background -- fixed the
background but left bright skin about 22 chroma units off, still outside the ellipse. A
channel gain shifts chroma in proportion to the pixel's own channel value, so a single
additive offset cannot correct a dark background and bright skin simultaneously. The
working model estimates a **per-channel gain** (the median ratio of frame to calibrated
background, clamped to plausible camera movement) and divides it back out, which inverts
the camera's actual transformation at every brightness.

Calibration performs the same correction and stores its skin model in the background
capture's colour space, so the model is built from the same population it is later
applied to. Previously calibration selected palm pixels by raw RGB difference while
inference used drift-corrected evidence -- two different definitions of "foreground"
that could drift apart independently.

Folding the gains into the YCbCr coefficients removed the per-pixel object allocation
the old conversion helper caused (~130k objects per frame), making the whole pipeline
**2.7x faster** (10.5 ms to 3.9 ms per frame at 256x256) while adding the correction.

Residual limit: once a channel saturates at 255 its true value is unrecoverable and no
correction brings it back. The pipeline fails closed (`NO_HAND`) rather than reporting a
wrong count.

## Diagnosed failure: long sleeves made the game unplayable

The first version of the wrist-entry rule required the hand blob to touch the bottom
band of the guide box. That holds only for a **bare** forearm. With a long sleeve the
forearm is not skin-coloured, so the skin blob ends at the cuff and floats free of every
edge -- structurally identical to a face. The identical gesture went from `FINGERS`/2 to
`NO_HAND`/`NO_WRIST_ENTRY` purely by covering the arm, and the failure was closed
(unplayable) rather than degraded.

Entry from below is now satisfied two ways: the blob runs off the bottom edge, **or** it
ends near the bottom in a flat cut. The discriminator against a face is the *shape of the
terminating edge*, not merely its position: a blob that was cut off keeps its width right
to its lowest row, while a blob that ends naturally in a rounded cap -- a chin, or a fist
held clear of the frame edge -- narrows sharply. Both halves are load-bearing, and both
are tested: a face lowered far enough to pass the position check is still rejected by the
taper, and a flat-bottomed object floating high is rejected by position.

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
- Hand removal required before rearming: **3 consecutive confirmed-empty frames**, not
  one. Segmentation drops the blob occasionally, and a single glitch frame while the
  player still holds a gesture would re-arm and then auto-submit that same held gesture
  on the next ball without them choosing it. Only a definitively empty box counts:
  "a skin blob is present but is not hand-shaped" is a judgement call carrying lower
  confidence, and breaks the streak rather than extending it. Failing closed costs the
  player a moment's wait; failing open submits a number they did not pick.

## Operating constraints

For reliable silhouettes use one upright hand, palm facing the camera, wrist entering
from the bottom, separated fingers, a plain non-skin-coloured background, and stable
lighting. Buttons and keyboard remain available at all times.

Synthetic tests verify geometry and state transitions, but real-camera validation on
the exhibition laptop is still required. Record per-value results and a confusion
matrix before claiming exhibition readiness.
