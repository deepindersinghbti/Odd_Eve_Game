# Offline gesture model

The runtime feature extractor is MobileNet V1 alpha 0.25 at 224×224. The graph and
weight shards are acquired once by `npm run vendor:model`, checked against pinned
SHA-256 digests, and served from `public/assets/models/mobilenet/`. Runtime code never
uses the upstream URL.

Upstream source:
`https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json`.
The TensorFlow.js MobileNet package and model are Apache-2.0 licensed.

The classifier is K-nearest neighbours over the model's 256-value
`global_average_pooling2d_1` layer. This exact layer name was verified from the
vendored LayersModel topology. Gameplay stores neither frames nor embeddings. The
development studio captures embeddings only and exports them to JSON when the operator
explicitly asks.

## Calibration protocol

- Collect at least 150–200 usable samples for each of `NO_HAND`, `ONE`, `TWO`,
  `THREE`, `FOUR`, `FIVE`, and `SIX`.
- Use 4–6 people, left and right hands where practical, varied distance/rotation,
  sleeves, backgrounds, skin tones, and exhibition-room lighting.
- Capture at controlled intervals, not every animation frame.
- Give `NO_HAND` extra difficult negatives: faces, sleeves, objects, partial hands.
- Keep held-out live validation captures separate from training.
- Record per-class accuracy and the confusion matrix from those held-out captures.
- Replace the uncalibrated dataset and metadata in
  `public/assets/models/hand-cricket-gestures/` only with genuine exports.
- Rebuild, disable Wi-Fi, complete a match, and profile the actual exhibition laptop
  for at least five minutes before claiming exhibition readiness.
