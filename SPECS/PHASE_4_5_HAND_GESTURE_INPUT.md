# Phase 4.5 — Offline JavaScript Hand-Gesture Input

Copy this file into the project root and give the complete contents to the coding agent.

---

Phase 4 is complete. Implement **Phase 4.5 — Camera Hand-Gesture Input** without regressing the completed button/keyboard game.

Before editing, read all project specifications and inspect the actual Phase 4 UI, controller, engine, bot, selectors, tests, and dependency tree.

## Non-negotiable constraints

- All application, training, preprocessing, inference, and integration logic must be JavaScript.
- Do not use Python anywhere.
- Do not install, import, vendor, call, or indirectly depend on MediaPipe.
- Do not install, import, vendor, call, or indirectly depend on OpenCV or OpenCV.js.
- Do not use `@tensorflow-models/hand-pose-detection` or another hand-landmark package backed by MediaPipe.
- Do not add a backend, API, database, cloud inference, telemetry, uploads, or internet requirement.
- Runtime must work on localhost with Wi-Fi disabled.
- Webcam frames must remain on the laptop.
- Existing buttons and keyboard keys 1–6 must remain fully functional as the fallback input method.
- Do not modify scoring, toss, bot, target, dismissal, winner, or controller fairness rules.

## Required technical approach

Implement gesture recognition as a **custom whole-image classifier in TensorFlow.js**, not a landmark/finger-counting system.

Use the official TensorFlow.js webcam transfer-learning pattern:

- TensorFlow.js in the browser
- A locally bundled MobileNet feature extractor
- A small JavaScript-trained classifier over MobileNet embeddings
- Prefer the official TensorFlow.js KNN classifier for the first reliable implementation, unless a small dense classification head is demonstrably better and equally exportable
- All model assets loaded from local project paths

Permitted packages are limited to JavaScript packages such as:

```text
@tensorflow/tfjs
@tensorflow-models/mobilenet
@tensorflow-models/knn-classifier
```

Verify current compatible versions before installation and commit the lockfile. Do not load libraries from script-tag CDNs.

Relevant official references:

- https://www.tensorflow.org/js/tutorials/transfer/image_classification
- https://github.com/tensorflow/tfjs-examples/tree/master/webcam-transfer-learning
- https://www.tensorflow.org/js/guide/save_load
- https://js.tensorflow.org/api/latest/

## Gesture vocabulary

Use one hand with the palm facing the camera and these canonical gestures:

| Class | Gesture |
| --- | --- |
| `NO_HAND` | No hand clearly inside the guide box |
| `ONE` | Index finger raised |
| `TWO` | Index and middle fingers raised |
| `THREE` | Index, middle, and ring fingers raised |
| `FOUR` | Four fingers raised, thumb folded |
| `FIVE` | Open palm |
| `SIX` | Closed fist |

The emitted game value is 1–6. `NO_HAND` never submits a game action and resets the stability candidate.

Do not silently support multiple conflicting representations of the same number in the first version. Consistent exhibition instructions are more reliable than an ambiguous classifier.

## Architecture

Create a separate feature boundary approximately like:

```text
src/gesture/
├── constants.js
├── errors.js
├── camera.js
├── crop.js
├── modelLoader.js
├── classifier.js
├── datasetSerializer.js
├── predictionLoop.js
├── stabilityFilter.js
├── createGestureRecognizer.js
└── index.js

src/hooks/
└── useGestureRecognition.js

src/components/gesture/
├── InputMethodToggle.jsx
├── CameraPanel.jsx
├── CameraPermissionState.jsx
├── GestureGuide.jsx
├── GestureCandidate.jsx
└── GestureTrainingStudio.jsx
```

Adjust names to match the existing project, but keep camera, ML inference, temporal filtering, controller integration, and presentation concerns separate.

## Input-method contract

Add an input abstraction so the existing UI can receive a final number from either:

```text
BUTTON
KEYBOARD
CAMERA_GESTURE
```

All three methods must call the same existing controller command:

- Toss phase → `submitTossNumber(value)`
- Innings phase → `submitPlayNumber(value)`

The gesture subsystem must not call the engine or bot directly.

The gesture recognizer may emit a stable candidate only when:

- The current screen permits a number selection.
- Controller controls are unlocked.
- No reveal or computer-thinking operation is active.
- Camera input mode is active.
- The recognizer is not in cooldown.

The existing controller remains responsible for synchronous locking and duplicate protection.

## Camera behavior

Use `navigator.mediaDevices.getUserMedia()` with a user-facing camera preference and reasonable desktop constraints.

Requirements:

- Request permission only after an explicit `Enable camera` action.
- Never request the webcam automatically on initial page load.
- Show clear states for permission pending, granted, denied, missing camera, busy camera, and unexpected failure.
- Mirror the video preview for natural interaction.
- Keep preprocessing orientation consistent with training.
- Show a prominent square hand-placement guide.
- Crop only the guide region for classification.
- Stop all media tracks when camera mode is disabled, the component unmounts, the match resets to setup, or the recognizer is destroyed.
- Pause or throttle inference when the page is hidden.
- Never capture audio.
- Do not retain frames during ordinary gameplay.
- Do not print frame data or embeddings to production logs.

Camera failure must never block the game. Offer `Use buttons instead` immediately.

## Local model assets

Runtime must not fetch MobileNet or classifier data from Google Storage, jsDelivr, unpkg, TensorFlow Hub, or any external origin.

Use local paths such as:

```text
public/assets/models/mobilenet/model.json
public/assets/models/mobilenet/*.bin
public/assets/models/hand-cricket-gestures/dataset.json
public/assets/models/hand-cricket-gestures/metadata.json
```

If the selected MobileNet API normally downloads remote weights, vendor the exact required model JSON and weight shards into `public/assets/models/mobilenet/` during development and load them using a verified local model URL supported by the installed package.

Any one-time asset acquisition script must be JavaScript/Node.js, checksum the downloaded files, document their upstream source and license, and never run automatically at exhibition runtime.

The production build must be tested with all network access blocked.

If compatible local base-model assets cannot be obtained or legally bundled, stop and report the blocker. Do not silently restore remote loading or switch to MediaPipe/OpenCV.

## JavaScript training studio

An actual classifier requires labeled camera examples. Implement a local training/calibration studio in JavaScript.

It must be accessible only through an explicit development/training entry point, not a prominent control in the exhibition UI. A development-only query parameter or build flag is acceptable if it is excluded or hidden in the production showcase build.

The studio must:

1. Start the camera only after permission.
2. Display the same mirrored preview and crop guide used during gameplay.
3. Let the developer select `NO_HAND`, `ONE`, `TWO`, `THREE`, `FOUR`, `FIVE`, or `SIX`.
4. Capture embeddings rather than permanently storing raw webcam frames by default.
5. Show sample counts for each class.
6. Prevent accidental mixed-label capture.
7. Allow deleting and recapturing a class.
8. Run local validation against held-out live samples.
9. Show per-class accuracy and a confusion matrix.
10. Export classifier data and metadata as downloadable files.
11. Import a previously exported dataset for continued training.
12. Dispose tensors after every capture and prediction.

For a KNN implementation, serialize each classifier tensor with label, shape, dtype, and numeric data, then reconstruct it using the official classifier dataset setter. Validate imported files strictly.

Do not use JavaScript object serialization that loses tensor shape/dtype information.

## Dataset collection protocol

Document and follow this minimum collection plan before calling recognition exhibition-ready:

- At least 150–200 usable samples per class.
- Samples from multiple people, ideally 4–6 participants.
- Both left and right hands where practical.
- Small variations in distance, rotation, skin tone, sleeves, and background.
- Samples under the actual exhibition-room lighting.
- Separate validation captures not reused as training examples.
- Extra `NO_HAND` examples containing faces, sleeves, background objects, and partially visible hands.

Capture continuous frames at a controlled interval so the dataset is not hundreds of near-identical frames.

Do not claim the model is complete if only synthetic tests or one person’s single capture session has been evaluated.

## Preprocessing

Use the same preprocessing for training and inference:

1. Read the square guide region.
2. Preserve the expected mirrored orientation.
3. Convert video/canvas pixels using TensorFlow.js browser pixel utilities.
4. Resize to the MobileNet input expected by the installed model.
5. Apply the normalization required by that exact model API.
6. Obtain a documented MobileNet embedding layer.
7. Dispose intermediate tensors with `tf.tidy()` or explicit `dispose()`.

Do not invent normalization values or embedding-layer names. Inspect and verify the installed model API.

Add a long-running memory test or diagnostic proving tensor count remains approximately stable during repeated inference.

## Prediction loop

Do not classify every animation frame.

Target roughly 8–12 predictions per second on the exhibition laptop, configurable after profiling. Prevent overlapping inference calls; a new prediction must not begin while the previous one is unresolved.

Expose recognizer state similar to:

```js
{
  status: 'DISABLED' | 'LOADING' | 'READY' | 'ERROR',
  rawLabel: 'NO_HAND' | 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE' | 'SIX' | null,
  confidence: 0,
  stableLabel: null,
  holdProgress: 0,
  cooldown: false,
  error: null
}
```

Do not expose tensors or mutable model objects through React state.

## Temporal stability and submission

A single frame must never submit a number.

Implement a pure, separately tested stability filter with configurable defaults:

- Minimum confidence: 0.85
- Sliding window: last 10 accepted predictions
- Required agreement: at least 8 of 10 predictions for the same non-`NO_HAND` class
- Minimum continuous hold: 700 ms
- Submission cooldown: 1200 ms
- `NO_HAND` resets the candidate and hold progress
- Falling below threshold resets or decays the candidate according to one documented rule

Recommended user flow:

1. User places a hand inside the guide.
2. UI shows candidate label and confidence.
3. A visible ring fills while the gesture remains stable.
4. Stable hold locks the detected number.
5. The existing controller receives the number once.
6. Camera input enters cooldown until the hand is removed or controller reaches the next selectable round.

Require hand removal/`NO_HAND` before the same gesture can be submitted again in a later round. This prevents one held pose from automatically playing multiple balls.

Do not use a React effect that can double-submit under Strict Mode. Submission must pass through one guarded imperative recognition/controller bridge.

## UI integration

Add a clearly labeled input selector on number-selection screens:

```text
Buttons | Camera
```

Behavior:

- Default to Buttons until the user explicitly enables Camera.
- Remember the preference only for the current session unless existing preference architecture safely supports it.
- Keep number buttons visible or one click away as fallback.
- Explain the gesture for six: `Closed fist = 6`.
- Show a compact guide for all six gestures.
- When camera mode is active, keyboard input may remain enabled unless it creates ambiguity; whichever method submits first wins and controller locking blocks the others.
- Hide or pause the preview on non-number screens to reduce distraction and GPU use.
- Do not change the established visual design language.

Accessibility:

- Camera recognition must be optional.
- All camera actions need keyboard-accessible controls.
- Announce recognized candidate, hold completion, submission, permission errors, and fallback availability through a restrained `aria-live` region.
- Do not announce confidence changes on every frame.
- Never make the game impossible for a player who cannot perform the gestures.

## Privacy copy

Display concise local-processing text near camera activation:

> Camera frames are processed locally in this browser and are not uploaded or saved during gameplay.

This must accurately match implementation.

## Tests

Use injected camera, model, clock, scheduler, and prediction adapters. Automated tests must not require a physical webcam.

Add tests for:

### Camera lifecycle

- No permission request before explicit activation.
- Correct video-only constraints.
- Successful stream attachment.
- Permission denied.
- Missing camera/API.
- Track cleanup on disable, reset, unmount, and destroy.
- Page-hidden pause/resume.

### Model and assets

- Model-loading state and failure.
- All runtime model URLs are local.
- Missing/corrupt dataset produces safe fallback.
- Imported classifier validation.
- Class-to-number mapping, including fist → 6.
- Tensor disposal/no monotonic leak over repeated fake inference.

### Stability filter

- Low confidence never submits.
- One-frame prediction never submits.
- 8-of-10 agreement behavior.
- Hold duration boundary.
- `NO_HAND` reset.
- Cooldown.
- Hand removal required before reuse.
- Label change during hold.
- Clock moving through controlled fake time.

### Controller integration

- Camera uses the same toss command as buttons.
- Camera uses the same delivery command as buttons.
- Input is ignored in invalid phases.
- Input is ignored while controller is locked.
- Exactly one submission occurs in React Strict Mode.
- Button and camera racing in the same tick cannot produce two resolutions.
- New Match cancels recognition and stops camera.
- Pending computer number remains private.
- Camera subsystem never calls engine or bot directly.

### UI

- Button mode remains default and functional.
- Camera permission states are accessible.
- Candidate and hold progress render.
- Fallback remains available after every error.
- Privacy copy is visible before/after activation.
- `Closed fist = 6` is visible.

### End-to-end

Use a fake MediaStream and fake prediction adapter in Playwright; do not expose a production cheat panel.

Test:

1. Enable camera.
2. Grant mocked permission.
3. Feed stable fake predictions.
4. Verify one toss/ball submission.
5. Verify cooldown and removal requirement.
6. Switch back to buttons.
7. Verify no external network request.

## Performance and event verification

On the actual exhibition laptop, record:

- Model load time from cold localhost start.
- Average inference time.
- Prediction rate.
- Tensor/memory behavior after at least five minutes.
- CPU/GPU impact.
- Accuracy per class.
- Confusion matrix.
- Performance under actual lighting and background.

Target responsive UI and avoid blocking the main thread for long synchronous work. If necessary, reduce prediction frequency before adding worker complexity.

## Required audit

Search the dependency tree, source, lockfile, and built output for:

```text
mediapipe
opencv
hand-pose-detection
cdn.jsdelivr
unpkg
tfhub
storage.googleapis.com
```

The first three must be absent. External model/runtime URLs must be absent from production execution and build output. Any upstream source URL may appear only in developer documentation or a one-time vendoring script, never in runtime code.

Also audit for:

- Webcam frames uploaded or persisted during gameplay
- Uncleared media tracks
- Overlapping prediction loops
- Undisposed tensors
- React-effect double submission
- Direct engine or bot access from gesture code
- Remote fonts, scripts, models, or analytics

## Scope restrictions

Do not add:

- Face recognition or identity inference
- Gesture recording during ordinary gameplay
- Background uploads
- Leaderboards or analytics
- Automatic difficulty changes
- Multiplayer or backend code
- A fragile handwritten skin-color threshold/contour algorithm
- Changes to existing game rules
- Removal of buttons or keyboard fallback

## Completion requirements

Before editing, report:

- Existing Phase 4 input flow
- Proposed gesture architecture
- Verified TensorFlow.js packages and local asset-loading plan
- Training/export format
- Stability/submission algorithm
- Controller integration point
- Test plan
- Any missing model/data blocker

Then implement in small steps.

Run the complete project quality gate using the working Windows command path:

```text
npm.cmd run format:check
npm.cmd run lint
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run build
```

Do not claim Phase 4.5 is exhibition-ready unless:

- Full existing game remains playable with buttons.
- Camera mode submits correct values through the existing controller.
- Actual locally bundled model assets exist.
- A real multi-person gesture dataset has been collected.
- Held-out live validation has been performed.
- The app completes a match with Wi-Fi disabled.
- The forbidden-dependency audit passes.
- Camera-denied and model-failure fallbacks work.
- All quality checks pass.

At completion report:

- Files and dependencies changed
- Exact classifier approach
- Local model asset paths and sizes
- Dataset class/sample counts
- Validation accuracy and confusion matrix
- Confidence/stability settings
- Camera lifecycle behavior
- Test counts and quality-gate results
- Offline network audit
- Actual-laptop performance
- Remaining limitations

If code is complete but real training samples have not yet been collected, state **“implementation complete; model calibration pending”**, not “Phase 4.5 complete.”

