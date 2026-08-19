# KNN confidence threshold tuning

> Superseded: gameplay no longer uses KNN. Geometric evidence now produces per-frame
> confidence and the temporal filter starts at 0.75.

## Context

The gesture classifier uses `k = 3`, so its winning confidence is a vote ratio:
`1`, `2 / 3`, or `1 / 3`. The original `0.85` threshold therefore accepted only
unanimous three-neighbour votes. In a leave-one-out audit of the bundled 269-example
dataset, 58 examples (21.6%) produced a two-of-three majority and were discarded.
Low-confidence labels were also removed before reaching the UI, making valid classifier
activity appear as no detection.

## Decision

Use `0.66` as the frame-level threshold so a two-of-three majority is eligible. Keep
the independent stability safeguards: 8 agreeing decisions in a 10-frame window, a
700 ms hold, a 1200 ms cooldown, and hand removal before rearming. Continue rejecting
one-of-three votes.

Expose the raw label and confidence when a frame is below the threshold. This feedback
helps the operator distinguish poor framing or calibration from a stopped prediction
loop without weakening submission rules.

## Validation requirement

Automated tests verify the vote boundary and temporal safeguards. Actual-camera
validation on the exhibition laptop is still required before calling gesture input
reliable. The bundled metadata contains no held-out validation results and does not
meet the documented 150–200 examples per class target.
