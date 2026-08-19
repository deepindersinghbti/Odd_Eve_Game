# Phase 4.5 — Model-Free Geometric Finger Counting in JavaScript

Copy this file into the Hand Cricket project root. It supersedes the earlier TensorFlow.js/model-training hand-recognition proposal.

---

Phase 4 is complete. Implement **Phase 4.5 — Model-Free Geometric Finger Counting**.

Read this file completely before modifying code. Also inspect the completed Phase 4 application, controller, engine, bot, selectors, tests, current camera-related code, and dependency tree.

## Architectural decision

The camera input must use deterministic classical image processing written directly in JavaScript.

Do not train, load, or run any machine-learning model.

Do not use:

- MediaPipe, directly or indirectly
- OpenCV or OpenCV.js
- TensorFlow.js
- Teachable Machine
- Hand-pose or landmark packages
- Cloud vision APIs
- Python
- WebAssembly computer-vision libraries
- A backend or remote inference service

Use only browser APIs, Canvas 2D pixel access, JavaScript typed arrays, and project-owned JavaScript algorithms.

If an earlier abandoned implementation added TensorFlow/model dependencies or assets, remove them safely after confirming they are unused. Preserve unrelated user work.

## What “finger length” means here

Without landmarks or a trained model, the application cannot measure anatomical bone or joint lengths. It must estimate **visible finger protrusion length from the segmented hand silhouette**.

For each fingertip candidate:

```text
visibleLength = distance(palmCenter, fingertip) - palmRadiusAlongThatDirection
normalizedLength = visibleLength / palmRadius
```

A sufficiently long, prominent protrusion is considered a straight/raised finger. A bent/folded finger should remain near the palm silhouette and fail the normalized-length/prominence tests.

Do not claim that the algorithm reconstructs joints or detects individual finger bones.

## Controlled operating assumptions

A model-free RGB silhouette method is reliable only under controlled conditions. Design the experience around these constraints:

- One hand only
- Palm facing the camera
- Hand approximately upright
- Wrist entering from the bottom of the guide box
- Fingers reasonably separated
- Hand fully inside the guide box
- Plain, non-skin-coloured background
- Stable exhibition lighting
- No face or second hand inside the guide box
- Sleeves kept outside the central palm area where practical

Show these instructions before enabling camera mode. Keep buttons and keyboard as permanent fallbacks.

## Game-value mapping

The geometric pipeline returns a raised-finger count from 0 through 5.

Map it to the game as follows:

| Detected shape | Raised count | Game value |
| --- | ---: | ---: |
| Closed fist with a valid hand blob | 0 | 6 |
| One straight finger | 1 | 1 |
| Two straight fingers | 2 | 2 |
| Three straight fingers | 3 | 3 |
| Four straight fingers | 4 | 4 |
| Open palm | 5 | 5 |
| No valid hand blob | none | no submission |

`NO_HAND` and `CLOSED_FIST` are different states. Blob area, palm geometry, foreground coverage, and silhouette quality must establish hand presence before a zero count can become game value 6.

## Preserve existing game boundaries

- Do not change the game engine.
- Do not change toss, scoring, dismissal, innings, target, result, or bot logic.
- Do not call the engine or computer opponent from camera code.
- A stable camera value must call the same existing controller command as buttons and keyboard:
  - Toss → `submitTossNumber(value)`
  - Innings → `submitPlayNumber(value)`
- Controller locking remains the final duplicate-submission guard.
- Existing button and keyboard input must remain fully playable if the camera is unavailable or inaccurate.

## Recommended module boundary

Implement focused modules approximately like:

```text
src/gesture/
├── constants.js
├── errors.js
├── camera.js
├── frame.js
├── color.js
├── calibration.js
├── binaryMask.js
├── morphology.js
├── connectedComponents.js
├── contour.js
├── distanceTransform.js
├── palmGeometry.js
├── radialSignature.js
├── fingertipDetection.js
├── fingerLength.js
├── confidence.js
├── stabilityFilter.js
├── geometricPipeline.js
├── createGestureRecognizer.js
└── index.js

src/hooks/
└── useGestureRecognition.js

src/components/gesture/
├── InputMethodToggle.jsx
├── CameraPanel.jsx
├── CalibrationWizard.jsx
├── HandGuide.jsx
├── DetectionOverlay.jsx
├── GestureCandidate.jsx
└── CameraFallback.jsx
```

Names may be adjusted to match the repository. Keep pure pixel/geometry algorithms independent from React and camera lifecycle.

## Frame and ROI contract

- Request video only after explicit user action.
- Prefer a user-facing camera.
- Render a mirrored preview for natural interaction.
- Define one square guide region and use exactly that crop for calibration and detection.
- Downscale the crop to a configurable processing resolution, initially 256×256.
- Reuse typed-array buffers instead of allocating large arrays every frame.
- Process approximately 10–15 frames per second, not every animation frame.
- Never begin a second frame analysis while the previous analysis is running.
- Keep display mirroring and processing coordinates consistent and tested.

## Calibration workflow

Calibration is deterministic parameter estimation, not model training.

Implement a short wizard:

### Step 1 — Background

- Ask the user to remove their hand from the guide.
- Capture approximately 20–30 frames.
- Compute a per-pixel or downsampled robust background reference.
- Use median or trimmed mean where practical to reduce transient noise.

### Step 2 — Skin colour

- Ask the user to place an open palm inside a smaller sample box.
- Sample only central palm pixels, not the entire frame.
- Convert sampled RGB pixels to a documented colour space such as YCbCr.
- Compute robust chroma statistics using median and median absolute deviation or bounded percentiles.
- Derive adaptive Cb/Cr ranges with minimum and maximum safety bounds.
- Do not use a fixed skin-tone range as the only detector.

### Step 3 — Open-palm geometry

- Capture several stable open-palm masks.
- Estimate typical palm radius, hand area, and radial-distance distribution.
- Derive normalized thresholds, never raw pixel-length thresholds tied to distance from camera.

### Step 4 — Closed fist

- Capture several stable fist masks.
- Confirm that a real hand blob is detected while zero valid long protrusions remain.
- Estimate the fist compactness/solidity range used to distinguish fist from noisy segmentation.

### Calibration result

Store a session-only object containing thresholds and quality metrics. Do not save raw frames. Persisting numeric calibration parameters in session storage is optional; default to recalibration after a new browser session.

Calibration must fail safely if:

- Too little foreground exists
- The mask is fragmented
- The hand touches several ROI borders
- Background and skin samples are insufficiently separable
- Lighting changes excessively

Offer Retry and Use Buttons instead.

## Segmentation pipeline

For every processed frame:

1. Read the ROI pixels using Canvas 2D `getImageData()`.
2. Convert RGB to the calibrated colour space in JavaScript.
3. Compute foreground difference from the calibrated background.
4. Compute adaptive skin-colour membership.
5. Combine foreground and skin evidence into a binary mask.
6. Reject pixels outside safe luminance/saturation limits.
7. Apply manually implemented binary morphology.
8. Retain the largest plausible connected component.
9. Reject the component if hand-presence quality checks fail.

The initial mask rule should conceptually require:

```text
foregroundDifference >= foregroundThreshold
AND
skinColourDistance <= calibratedSkinThreshold
```

Document the exact distance and thresholds implemented.

## Morphology

Implement binary morphology over `Uint8Array` masks:

- 3×3 erosion
- 3×3 dilation
- Opening to remove isolated foreground noise
- Closing to fill small holes

Make iteration counts configurable and conservative. Excessive erosion can remove fingers; excessive dilation can merge finger gaps.

Add deterministic tests using small hand-authored binary matrices.

## Connected components and hand presence

Implement 8-connected component labelling.

Retain the largest plausible component and calculate:

- Area
- Bounding box
- Centroid
- Border contacts
- Fill ratio
- Component fragmentation ratio

Reject as `NO_HAND` when, for example:

- Area is below a calibrated/minimum ROI percentage
- Area occupies an implausibly large fraction of the ROI
- Component is a thin strip or isolated noise
- Wrist/hand orientation is implausible
- Hand touches too many ROI boundaries
- Mask quality is too low

Use normalized ratios rather than fixed pixels.

## Contour extraction

Implement an ordered boundary tracing algorithm such as Moore-neighbour tracing.

Requirements:

- Return contour points in consistent winding order.
- Avoid duplicate runaway loops.
- Enforce a maximum iteration guard.
- Optionally simplify or uniformly resample the contour before curvature calculations.
- Test rectangles, circles, concave shapes, narrow fingers, and empty masks.

Do not merely collect unordered edge pixels; fingertip curvature and radial signatures require an ordered contour.

## Palm centre and radius

Implement a distance transform on the binary hand mask in JavaScript.

A two-pass chamfer approximation is acceptable if documented and tested.

- The pixel with the maximum distance to background is the primary palm-centre candidate.
- Its distance value estimates palm radius.
- Stabilize the centre across frames using a small temporal smoother.
- Reject implausible radius or centre location.
- Use palm radius as the scale reference for all finger-length thresholds.

Do not use the full hand centroid alone as palm centre; extended fingers shift the centroid upward.

## Wrist suppression

Assume the wrist enters from the bottom of the guide.

- Estimate a wrist exclusion line relative to palm centre and radius.
- Ignore contour points substantially below the palm when searching for fingertips.
- Do not allow lower wrist corners to become fingertip candidates.
- Expose a debug overlay for the exclusion line.

If orientation checks show the wrist is not entering from the expected side, mark the frame low-confidence and ask the user to straighten their hand.

## Radial signature

For every valid contour point above the wrist exclusion zone:

```text
radius(point) = distance(point, palmCenter)
angle(point) = atan2(point.y - center.y, point.x - center.x)
```

Build a circular or angle-binned radial signature using the outermost radius per angle bin.

Then:

- Smooth the signature with a small circular moving-average or Gaussian-like JavaScript kernel.
- Locate local maxima.
- Measure peak prominence relative to neighbouring valleys and palm radius.
- Merge peaks that are too close in angle or Euclidean distance.
- Limit final candidates to five.

Radial peaks provide the main evidence for visible straight fingers. Convex hull/defect calculations may be implemented as an additional geometric cross-check, but not as the sole counting method because convexity defects alone struggle to distinguish zero from one raised finger.

## Fingertip candidate validation

A radial maximum becomes a fingertip candidate only if it passes all relevant checks:

- Above the wrist exclusion zone
- Outside a minimum multiple of palm radius
- Sufficient radial prominence
- Sufficient contour curvature/sharpness
- Sufficient angular separation from accepted candidates
- Sufficient Euclidean separation
- Supported by a continuous finger-width region, not a one-pixel spike
- Not at an ROI border

For contour curvature, choose points a configurable arc-length offset before and after the candidate and calculate the enclosed angle. Reject broad palm/wrist corners.

Do not hard-code a single pixel offset; scale it with contour length or palm radius.

## Straight-versus-bent length calculation

For every validated fingertip candidate:

1. Cast or sample a ray from palm centre toward the fingertip.
2. Estimate where that ray exits the palm core, using palm radius or local distance-transform geometry.
3. Calculate visible protrusion length from palm boundary to fingertip.
4. Normalize by palm radius.

Example feature:

```js
normalizedLength =
  (distance(palmCenter, fingertip) - palmRadiusAlongRay) / palmRadius;
```

Classify the candidate as straight/raised only when:

- Normalized length exceeds the calibrated threshold
- Peak prominence exceeds its threshold
- Candidate remains stable across frames

Do not require exact named-finger identity. The game needs only the number of straight visible protrusions.

Use open-palm calibration to initialize the threshold, then apply documented safety limits. Avoid different absolute thresholds for different camera resolutions.

## Closed fist versus no hand

This distinction is essential because a fist represents game value 6.

Return `CLOSED_FIST` only when:

- Hand presence is valid
- Palm centre/radius are valid
- Blob area is plausible
- Silhouette is sufficiently compact/solid
- Zero raised fingertip candidates survive
- The result is temporally stable

Return `NO_HAND` when the hand blob or geometry is invalid.

One raised finger must be distinguishable from a fist through its long radial protrusion even though both shapes may have few or no deep inter-finger valleys.

## Per-frame output

The pure pipeline should return a serializable result similar to:

```js
{
  handPresent: true,
  state: 'FINGERS' | 'CLOSED_FIST' | 'NO_HAND' | 'LOW_CONFIDENCE',
  raisedFingerCount: 3,
  gameValue: 3,
  confidence: 0.91,
  palm: {
    center: { x: 126, y: 148 },
    radius: 34
  },
  fingertips: [
    {
      x: 91,
      y: 38,
      radialDistance: 115,
      normalizedLength: 2.38,
      prominence: 0.74,
      curvatureAngle: 46
    }
  ],
  quality: {
    mask: 0.9,
    geometry: 0.88,
    borderPenalty: 0
  }
}
```

Do not expose large masks/contours through React state. Provide diagnostic data only when a development debug flag is enabled.

## Confidence

Build confidence from documented geometric evidence, not an arbitrary constant:

- Foreground/skin separation quality
- Component plausibility
- Palm-centre/radius validity
- Border-contact penalty
- Fingertip peak prominence margins
- Normalized-length margins
- Agreement between radial peaks and optional convexity evidence
- Temporal stability

If evidence is contradictory, return `LOW_CONFIDENCE` and do not submit.

## Temporal stability

A single frame must never submit a number.

Use a pure, separately tested stability filter with configurable starting values:

- Process 10–15 frames per second
- Minimum per-frame confidence: 0.75 initially, tune after real testing
- Sliding window: 10 valid decisions
- Required agreement: at least 8 of 10
- Minimum continuous hold: 700 ms
- Cooldown after submission: 1200 ms
- Require `NO_HAND` before rearming for the next ball
- A low-confidence or changed count resets/decays hold progress according to one documented rule

The stable state may emit game values 1–6 only once per arm cycle.

## Camera/controller bridge

Camera recognition is permitted only when:

- Input mode is Camera
- Current screen accepts a number
- Controller controls are unlocked
- No computer-thinking/reveal state is active
- Stability filter is armed

When stable:

- Toss screen calls `submitTossNumber(gameValue)`
- Match screen calls `submitPlayNumber(gameValue)`

Do not use an unguarded React effect to submit. Use one imperative, token-guarded bridge so React Strict Mode cannot double-submit.

Whichever input method—camera, button, or keyboard—submits first wins. Controller locking blocks all later attempts.

## UI

Add a clearly labelled selector:

```text
Buttons | Camera
```

Camera mode must include:

- Explicit Enable Camera button
- Privacy text: “Camera frames are processed locally in this browser and are not uploaded or saved.”
- Mirrored preview
- Hand guide box
- Calibration wizard
- Live detected count/value
- Confidence/quality state
- Hold progress indicator
- Instructions such as “Palm forward · Wrist at bottom · Separate your fingers”
- “Closed fist = 6” reminder
- Recalibrate button
- Use Buttons Instead action

Show debug overlays—mask, contour, palm circle, wrist line, radial peaks, accepted/rejected fingertips, normalized lengths—only behind a development/debug flag.

Camera input must remain optional and accessible. Do not make gesture performance mandatory for users with limited hand mobility.

## Camera lifecycle and privacy

- Call `getUserMedia()` only after explicit activation.
- Request video only, never audio.
- Handle permission denied, missing API/device, camera busy, and stream interruption.
- Stop all tracks on disable, reset to setup, unmount, and recognizer destruction.
- Pause processing when the page is hidden.
- Never upload frames.
- Never save raw calibration/gameplay frames.
- Never log pixel arrays in production.
- Camera failure always falls back to buttons.

## Performance

- Start with 256×256 processing resolution.
- Reuse `Uint8Array`, `Uint16Array`, and numeric buffers.
- Avoid object allocation per pixel.
- Keep morphology and component passes linear in pixel count.
- Prevent overlapping frame processing.
- Profile on the actual exhibition laptop.
- Reduce processing resolution/rate before introducing worker complexity.
- If the main thread visibly stutters, move the pure pixel pipeline to a Web Worker using transferable buffers; keep camera access and controller submission on the main thread.

## Testing

Automated tests must not require a physical webcam.

### Colour and calibration

- RGB→YCbCr conversion against known values
- Robust median/MAD/percentile helpers
- Background difference
- Skin membership boundaries
- Invalid/insufficient calibration rejection

### Binary image operations

- Erosion and dilation on small matrices
- Opening removes isolated pixels
- Closing fills small holes
- Connected-component counts and largest component
- Border-contact calculations
- Empty/full mask safety

### Contour and geometry

- Ordered contour extraction
- Iteration guard
- Distance transform
- Palm centre/radius on synthetic shapes
- Wrist suppression
- Radial signature smoothing
- Peak detection/prominence
- Angular/spatial non-maximum suppression
- Curvature calculation
- Normalized finger-length calculation

### Synthetic hand silhouettes

Create deterministic binary fixtures for:

- No hand
- Closed fist
- One long finger
- Two through five long fingers
- Short/bent protrusions
- Wrist corners
- Touching ROI borders
- Fragmented/noisy masks
- Rotated/invalid orientation

Verify exact raised counts and fist/no-hand distinction. These fixtures validate geometry, not real-camera accuracy.

### Stability

- Single frame never submits
- 8-of-10 agreement
- Hold-time boundary
- Low-confidence rejection
- Count changes
- Fist maps to 6
- No-hand reset/rearm
- Cooldown
- One emission per arm cycle

### Integration

- Camera value calls existing toss command
- Camera value calls existing play command
- Locked/invalid phases ignore recognition
- Camera and button race produces one controller action
- Strict Mode does not double-submit
- New Match/disable/unmount stop processing and camera tracks
- No direct engine/bot imports from gesture subsystem

### Playwright

Use a fake MediaStream and injected deterministic frame/pipeline adapter.

Test camera activation, calibration states, stable value submission, fist→6, rearm requirement, fallback, and offline requests. Do not create a production-visible cheat interface.

## Manual validation

Classical silhouette methods are sensitive to lighting, background, distance, and finger separation. Automated synthetic-mask tests are insufficient.

On the actual exhibition laptop:

- Test the actual webcam and event background
- Test several people and skin tones
- Test left and right hands
- Test values 1–6 repeatedly
- Record a 6×6 confusion matrix for submitted game values
- Separately record `NO_HAND` false activations
- Measure latency and FPS
- Run for at least five minutes to check stability
- Change lighting slightly and retest
- Confirm fallback works instantly

Do not claim exhibition readiness until real-camera validation is complete.

## Required audits

Search source, dependency tree, lockfile, and build output for:

```text
mediapipe
opencv
tensorflow
teachablemachine
hand-pose
hand-landmark
cdn.jsdelivr
unpkg
tfhub
```

The first six categories must be absent from active dependencies and implementation. External runtime scripts/models must be absent.

Also audit for:

- Network requests
- Saved/uploaded camera frames
- Uncleared tracks
- Overlapping frame processing
- Per-frame large allocations
- React-effect duplicate submission
- Direct scoring or bot calls
- Raw-pixel production logging

## Scope restrictions

Do not add:

- ML training or inference
- Landmark estimation
- Face recognition
- Identity inference
- Two-hand gestures
- Remote assets or services
- Gesture recording during normal play
- Removal of button/keyboard fallback
- Changes to existing rules

## Required workflow

Before editing, report:

- Existing Phase 4 input/controller flow
- Whether any abandoned model-based files/dependencies already exist
- Planned module structure
- Exact segmentation/calibration approach
- Palm and finger-length formulas
- Fist/no-hand distinction
- Stability and submission lifecycle
- Test plan
- Known reliability limitations

Implement in small verified stages:

1. Pure binary-image primitives and tests
2. Contour/distance/palm geometry and tests
3. Radial peaks/finger length and synthetic silhouettes
4. Calibration and segmentation
5. Stability filter
6. Camera lifecycle
7. Controller/UI integration
8. E2E, offline audit, and real-camera validation

Run the full quality gate using the working Windows command path:

```text
npm.cmd run format:check
npm.cmd run lint
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run build
```

At completion report:

- Files and dependencies changed
- Exact algorithm and formulas
- Default/calibrated thresholds
- Synthetic fixture results
- New and total test counts
- Full quality-gate results
- Forbidden-dependency audit
- Offline network audit
- Actual webcam FPS/latency
- Per-value real-camera results and confusion matrix
- Known lighting/background constraints
- Fallback behavior

If code and synthetic tests pass but actual webcam validation has not been performed, report:

```text
Implementation complete; real-camera calibration and validation pending.
```

Do not report “exhibition-ready” without measured real-camera evidence.

