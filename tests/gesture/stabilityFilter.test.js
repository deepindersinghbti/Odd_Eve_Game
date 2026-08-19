import { describe, expect, it } from 'vitest';

import { GESTURE_LABELS, createStabilityFilter } from '../../src/gesture/index.js';

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

  it('NO_HAND clears a candidate and rearms after submission', () => {
    const filter = createStabilityFilter();
    feed(filter, Array(10).fill(GESTURE_LABELS.ONE));
    const removed = filter.push(prediction(GESTURE_LABELS.NO_HAND, 1000));
    expect(removed).toMatchObject({ candidateLabel: null, armed: true });
  });

  it('requires both cooldown expiry and hand removal before reuse', () => {
    const filter = createStabilityFilter();
    expect(feed(filter, Array(10).fill(GESTURE_LABELS.TWO)).at(-1).submission).toBe(2);
    expect(
      feed(filter, Array(20).fill(GESTURE_LABELS.TWO), 100, 1000).at(-1).submission,
    ).toBeNull();
    filter.push(prediction(GESTURE_LABELS.NO_HAND, 3000));
    expect(
      feed(filter, Array(10).fill(GESTURE_LABELS.TWO), 100, 3100).at(-1).submission,
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
