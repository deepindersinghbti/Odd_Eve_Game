import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STABILITY_SETTINGS,
  GESTURE_LABELS,
  createStabilityFilter,
} from '../../src/gesture/index.js';

const prediction = (label, timestamp, confidence = 0.95) => ({
  label,
  confidence,
  timestamp,
});

function feed(filter, labels, step = 100, start = 0) {
  return labels.map((label, index) =>
    filter.push(prediction(label, start + index * step)),
  );
}

// Removal requires several consecutive confirmed-empty frames, not one -- see
// requiredRemovalFrames. Helper so tests express intent rather than a count.
const REMOVAL_FRAMES = DEFAULT_STABILITY_SETTINGS.requiredRemovalFrames;
function removeHand(filter, start = 0, step = 100) {
  return feed(filter, Array(REMOVAL_FRAMES).fill(GESTURE_LABELS.NO_HAND), step, start);
}

describe('gesture stability filter', () => {
  it('never submits a single confident frame', () => {
    const filter = createStabilityFilter();
    expect(filter.push(prediction(GESTURE_LABELS.ONE, 0)).submission).toBeNull();
  });

  it('resets on a low-confidence frame', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(7).fill(GESTURE_LABELS.TWO));
    const reset = filter.push(prediction(GESTURE_LABELS.TWO, 700, 0.65));
    expect(reset).toMatchObject({
      rawLabel: GESTURE_LABELS.TWO,
      confidence: 0.65,
      candidateLabel: null,
      holdProgress: 0,
    });
    expect(
      feed(filter, Array(3).fill(GESTURE_LABELS.TWO), 100, 800).at(-1).submission,
    ).toBeNull();
  });

  it('rejects geometric decisions below the frame confidence threshold', () => {
    const filter = createStabilityFilter();
    const results = Array.from({ length: 10 }, (_, index) =>
      filter.push(prediction(GESTURE_LABELS.THREE, index * 100, 2 / 3)),
    );
    expect(results.at(-1).submission).toBeNull();
  });

  it('accepts exactly 8 of 10 agreement after the hold time', () => {
    const filter = createStabilityFilter();
    const labels = [
      GESTURE_LABELS.THREE,
      GESTURE_LABELS.THREE,
      GESTURE_LABELS.TWO,
      GESTURE_LABELS.THREE,
      GESTURE_LABELS.THREE,
      GESTURE_LABELS.THREE,
      GESTURE_LABELS.TWO,
      GESTURE_LABELS.THREE,
      GESTURE_LABELS.THREE,
      GESTURE_LABELS.THREE,
    ];
    const result = feed(filter, labels).at(-1);
    expect(result).toMatchObject({ agreement: 8, submission: 3, cooldown: true });
  });

  it('rejects 7 of 10 agreement', () => {
    const filter = createStabilityFilter();
    const labels = Array(10).fill(GESTURE_LABELS.FOUR);
    labels[2] = GESTURE_LABELS.FIVE;
    labels[5] = GESTURE_LABELS.FIVE;
    labels[8] = GESTURE_LABELS.FIVE;
    expect(feed(filter, labels).at(-1).submission).toBeNull();
  });

  it('honors the 700ms hold boundary independently of frame count', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(10).fill(GESTURE_LABELS.FIVE), 50);
    expect(filter.push(prediction(GESTURE_LABELS.FIVE, 699)).submission).toBeNull();
    expect(filter.push(prediction(GESTURE_LABELS.FIVE, 700)).submission).toBe(5);
  });

  it('maps a closed fist to six', () => {
    const filter = createStabilityFilter();
    expect(feed(filter, Array(10).fill(GESTURE_LABELS.SIX)).at(-1).submission).toBe(6);
  });

  it('NO_HAND clears a candidate immediately and rearms after sustained removal', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(10).fill(GESTURE_LABELS.ONE));
    const removed = removeHand(filter, 1000);
    expect(removed.at(-1)).toMatchObject({ candidateLabel: null, armed: true });
    // The candidate is dropped on the very first empty frame, even though
    // re-arming waits for the full streak.
    expect(removed[0].candidateLabel).toBeNull();
  });

  it('REGRESSION does not rearm on a single NO_HAND frame', () => {
    // A lone dropped-blob frame while the player is still holding a gesture
    // must not re-arm: the held gesture would then auto-submit on the next
    // ball without them choosing it.
    const filter = createStabilityFilter();
    feed(filter, Array(10).fill(GESTURE_LABELS.ONE));
    const glitch = filter.push(prediction(GESTURE_LABELS.NO_HAND, 1000));
    expect(glitch.armed).toBe(false);
    // Still holding ONE: it must not submit again.
    expect(
      feed(filter, Array(20).fill(GESTURE_LABELS.ONE), 100, 1100).at(-1).submission,
    ).toBeNull();
  });

  it('REGRESSION requires the removal frames to be consecutive', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(10).fill(GESTURE_LABELS.ONE));
    // Empty frames interrupted by the hand reappearing never complete a streak.
    for (let repeat = 0; repeat < 4; repeat += 1) {
      filter.push(prediction(GESTURE_LABELS.NO_HAND, 1000 + repeat * 200));
      filter.push(prediction(GESTURE_LABELS.ONE, 1100 + repeat * 200));
    }
    expect(filter.getState(2000).armed).toBe(false);
  });

  it('REGRESSION an ambiguous NO_HAND does not count toward removal', () => {
    // "A skin blob is present but is not hand-shaped" is a judgement call, not
    // proof the player removed their hand, so it carries low confidence and
    // must not re-arm however many times it repeats.
    const filter = createStabilityFilter();
    feed(filter, Array(10).fill(GESTURE_LABELS.ONE));
    for (let frame = 0; frame < REMOVAL_FRAMES * 3; frame += 1) {
      filter.push(prediction(GESTURE_LABELS.NO_HAND, 1000 + frame * 100, 0.5));
    }
    expect(filter.getState(3000).armed).toBe(false);
  });

  it('requires both cooldown expiry and hand removal before reuse', () => {
    const filter = createStabilityFilter();
    expect(feed(filter, Array(10).fill(GESTURE_LABELS.TWO)).at(-1).submission).toBe(2);
    expect(
      feed(filter, Array(20).fill(GESTURE_LABELS.TWO), 100, 1000).at(-1).submission,
    ).toBeNull();
    removeHand(filter, 3000);
    expect(
      feed(filter, Array(10).fill(GESTURE_LABELS.TWO), 100, 3400).at(-1).submission,
    ).toBe(2);
  });

  it('does not re-submit after removal while cooldown is active', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(10).fill(GESTURE_LABELS.ONE));
    filter.push(prediction(GESTURE_LABELS.NO_HAND, 1000));
    expect(
      feed(filter, Array(10).fill(GESTURE_LABELS.ONE), 50, 1050).at(-1).submission,
    ).toBeNull();
  });

  it('switches candidate only after sustained label change', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(5).fill(GESTURE_LABELS.ONE));
    filter.push(prediction(GESTURE_LABELS.TWO, 500));
    filter.push(prediction(GESTURE_LABELS.TWO, 600));
    const changed = filter.push(prediction(GESTURE_LABELS.TWO, 700));
    expect(changed).toMatchObject({
      candidateLabel: GESTURE_LABELS.TWO,
      windowLength: 1,
    });
  });

  it('clears progress whenever controller eligibility is false', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(7).fill(GESTURE_LABELS.THREE));
    expect(
      filter.push({ ...prediction(GESTURE_LABELS.THREE, 700), eligible: false }),
    ).toMatchObject({ candidateLabel: null, submission: null });
  });
});
