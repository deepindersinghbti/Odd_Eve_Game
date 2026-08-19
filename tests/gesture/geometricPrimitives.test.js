import { describe, expect, it } from 'vitest';

import {
  analyzeHandGeometry,
  calculateVisibleFingerLength,
  closeMask,
  dilate3x3,
  erode3x3,
  findLargestComponent,
  findPalmGeometry,
  openMask,
} from '../../src/gesture/index.js';

function maskFromRows(rows) {
  return Uint8Array.from(rows.join('').replaceAll('.', '0').replaceAll('#', '1'), Number);
}

function drawRectangle(mask, width, x, y, rectangleWidth, rectangleHeight) {
  for (let row = y; row < y + rectangleHeight; row += 1) {
    for (let column = x; column < x + rectangleWidth; column += 1) {
      mask[row * width + column] = 1;
    }
  }
}

function createSyntheticHand(fingerCount, { shortFinger = false } = {}) {
  const width = 128;
  const height = 128;
  const mask = new Uint8Array(width * height);
  drawRectangle(mask, width, 38, 58, 54, 48);
  drawRectangle(mask, width, 55, 98, 20, 30);
  const fingers = [
    { x: 42, y: 27, width: 8, height: 35 },
    { x: 53, y: 17, width: 8, height: 45 },
    { x: 64, y: 14, width: 8, height: 48 },
    { x: 75, y: 24, width: 8, height: 38 },
  ];
  for (const finger of fingers.slice(0, Math.min(fingerCount, 4))) {
    drawRectangle(
      mask,
      width,
      finger.x,
      shortFinger ? 48 : finger.y,
      finger.width,
      shortFinger ? 14 : finger.height,
    );
  }
  if (fingerCount === 5) drawRectangle(mask, width, 84, 55, 31, 9);
  return { mask, width, height };
}

describe('binary mask primitives', () => {
  it('erodes, dilates, opens noise, and closes a hole', () => {
    const block = maskFromRows(['.....', '.###.', '.###.', '.###.', '.....']);
    expect([...erode3x3(block, 5, 5)]).toEqual([
      ...maskFromRows(['.....', '.....', '..#..', '.....', '.....']),
    ]);
    expect([
      ...dilate3x3(maskFromRows(['.....', '.....', '..#..', '.....', '.....']), 5, 5),
    ]).toEqual([...block]);
    const noisy = maskFromRows(['#....', '.###.', '.###.', '.###.', '.....']);
    expect(openMask(noisy, 5, 5)[0]).toBe(0);
    const hole = maskFromRows(['.....', '.###.', '.#.#.', '.###.', '.....']);
    expect(closeMask(hole, 5, 5)[2 * 5 + 2]).toBe(1);
  });
});

describe('hand silhouette geometry', () => {
  it('keeps the largest 8-connected component and reports its geometry', () => {
    const mask = maskFromRows(['#....', '.....', '..##.', '..##.', '.....']);
    const component = findLargestComponent(mask, 5, 5);
    expect(component).toMatchObject({ area: 4, fillRatio: 1, foregroundShare: 0.8 });
  });

  it('finds the palm centre from maximum distance to the silhouette boundary', () => {
    const hand = createSyntheticHand(3);
    const palm = findPalmGeometry(hand.mask, hand.width, hand.height);
    expect(palm.center.x).toBeGreaterThan(50);
    expect(palm.center.x).toBeLessThan(80);
    expect(palm.center.y).toBeGreaterThan(70);
    expect(palm.radius).toBeGreaterThan(20);
  });

  it('normalizes visible protrusion height by palm radius', () => {
    expect(calculateVisibleFingerLength(70, 30, 20)).toBe(2);
  });

  it.each([0, 1, 2, 3, 4, 5])('counts %i raised protrusions', (fingerCount) => {
    const hand = createSyntheticHand(fingerCount);
    const component = findLargestComponent(hand.mask, hand.width, hand.height);
    expect(
      analyzeHandGeometry(component, hand.width, hand.height).raisedFingerCount,
    ).toBe(fingerCount);
  });

  it('does not count a short bent protrusion as raised', () => {
    const hand = createSyntheticHand(1, { shortFinger: true });
    const component = findLargestComponent(hand.mask, hand.width, hand.height);
    expect(
      analyzeHandGeometry(component, hand.width, hand.height).raisedFingerCount,
    ).toBe(0);
  });
});
