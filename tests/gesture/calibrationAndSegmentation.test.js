import { describe, expect, it } from 'vitest';

import {
  buildBackgroundReference,
  buildSkinCalibration,
  createGeometricPipeline,
  extractHandComponent,
  median,
  medianAbsoluteDeviation,
  percentile,
  rgbToYCbCr,
} from '../../src/gesture/index.js';

function solidFrame(width, height, [red, green, blue]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = 255;
  }
  return data;
}

function paintRectangle(frame, width, x, y, rectangleWidth, rectangleHeight, colour) {
  for (let row = y; row < y + rectangleHeight; row += 1) {
    for (let column = x; column < x + rectangleWidth; column += 1) {
      const offset = (row * width + column) * 4;
      frame[offset] = colour[0];
      frame[offset + 1] = colour[1];
      frame[offset + 2] = colour[2];
    }
  }
}

function palmFrame(width, height, fingerCount = 5) {
  const frame = solidFrame(width, height, [35, 70, 135]);
  const skin = [190, 125, 88];
  const scale = width / 128;
  const scaledRectangle = (x, y, rectangleWidth, rectangleHeight) =>
    paintRectangle(
      frame,
      width,
      Math.round(x * scale),
      Math.round(y * scale),
      Math.round(rectangleWidth * scale),
      Math.round(rectangleHeight * scale),
      skin,
    );
  scaledRectangle(38, 58, 54, 48);
  // The wrist must reach the bottom edge of the guide box. A real hand is
  // continuous with the forearm entering from below, and the pipeline now
  // requires that wrist entry to distinguish a hand from a face (which floats
  // free of every edge). A fixture whose wrist stops short models a
  // disembodied floating hand, which is correctly rejected.
  scaledRectangle(55, 98, 20, 30);
  const fingers = [
    [42, 27, 8, 35],
    [53, 17, 8, 45],
    [64, 14, 8, 48],
    [75, 24, 8, 38],
  ];
  for (const [x, y, fingerWidth, fingerHeight] of fingers.slice(
    0,
    Math.min(fingerCount, 4),
  )) {
    scaledRectangle(x, y, fingerWidth, fingerHeight);
  }
  if (fingerCount === 5) scaledRectangle(84, 55, 31, 9);
  return frame;
}

describe('colour and calibration helpers', () => {
  it('converts known neutral RGB values to YCbCr', () => {
    expect(rgbToYCbCr(0, 0, 0)).toEqual({ y: 0, cb: 128, cr: 128 });
    const white = rgbToYCbCr(255, 255, 255);
    expect(white.y).toBeCloseTo(255);
    expect(white.cb).toBeCloseTo(128);
    expect(white.cr).toBeCloseTo(128);
  });

  it('computes robust scalar statistics', () => {
    expect(median([100, 2, 3, 4, 5])).toBe(4);
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 100], 3)).toBe(1);
    expect(percentile([0, 10, 20, 30, 40], 0.25)).toBe(10);
  });

  it('rejects palm calibration without enough foreground separation', () => {
    const frames = Array.from({ length: 5 }, () => solidFrame(32, 32, [30, 60, 90]));
    const background = buildBackgroundReference(frames, 32, 32);
    expect(() => buildSkinCalibration(frames, background, 32, 32)).toThrow(
      /could not separate/i,
    );
  });
});

describe('adaptive segmentation and geometric composition', () => {
  const width = 128;
  const height = 128;
  const backgroundFrames = Array.from({ length: 5 }, () =>
    solidFrame(width, height, [35, 70, 135]),
  );
  const palmFrames = Array.from({ length: 5 }, () => palmFrame(width, height, 5));
  const background = buildBackgroundReference(backgroundFrames, width, height);
  const calibration = buildSkinCalibration(palmFrames, background, width, height);

  it('segments the calibrated hand as the dominant component', () => {
    const component = extractHandComponent(palmFrames[0], calibration);
    expect(component.areaRatio).toBeGreaterThan(0.1);
    expect(component.foregroundShare).toBeGreaterThan(0.99);
  });

  it.each([1, 2, 3, 4, 5])('counts %i raised fingers from RGB pixels', (count) => {
    const result = createGeometricPipeline({ calibration }).analyze(
      palmFrame(width, height, count),
    );
    expect(result).toMatchObject({ state: 'FINGERS', raisedFingerCount: count });
  });

  it('maps a valid closed fist to game value 6', () => {
    const result = createGeometricPipeline({ calibration }).analyze(
      palmFrame(width, height, 0),
    );
    expect(result).toMatchObject({ state: 'CLOSED_FIST', gameValue: 6 });
  });

  it('keeps an empty calibrated frame distinct from a closed fist', () => {
    const result = createGeometricPipeline({ calibration }).analyze(backgroundFrames[0]);
    expect(result.state).toBe('NO_HAND');
    expect(result.gameValue).toBeUndefined();
  });

  it('keeps all five peaks distinct at the production processing resolution', () => {
    const processingSize = 256;
    const emptyFrames = Array.from({ length: 5 }, () =>
      solidFrame(processingSize, processingSize, [35, 70, 135]),
    );
    const openPalmFrames = Array.from({ length: 5 }, () =>
      palmFrame(processingSize, processingSize, 5),
    );
    const productionBackground = buildBackgroundReference(
      emptyFrames,
      processingSize,
      processingSize,
    );
    const productionCalibration = buildSkinCalibration(
      openPalmFrames,
      productionBackground,
      processingSize,
      processingSize,
    );
    const productionPipeline = createGeometricPipeline({
      calibration: productionCalibration,
    });

    for (let count = 1; count <= 5; count += 1) {
      const result = productionPipeline.analyze(
        palmFrame(processingSize, processingSize, count),
      );
      expect(result.raisedFingerCount).toBe(count);
      expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    }
  });
});
