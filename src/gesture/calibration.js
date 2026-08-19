import { median, medianAbsoluteDeviation, percentile, rgbToYCbCr } from './color.js';

function validateFrames(frames, width, height) {
  if (!Array.isArray(frames) || frames.length < 3) {
    throw new TypeError('At least three calibration frames are required.');
  }
  const expectedLength = width * height * 4;
  if (frames.some((frame) => frame?.length !== expectedLength)) {
    throw new TypeError('Calibration frame dimensions do not match.');
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function backgroundDifference(data, background, pixelIndex) {
  const offset = pixelIndex * 4;
  const reference = pixelIndex * 3;
  return (
    (Math.abs(data[offset] - background[reference]) +
      Math.abs(data[offset + 1] - background[reference + 1]) +
      Math.abs(data[offset + 2] - background[reference + 2])) /
    3
  );
}

export function buildBackgroundReference(frames, width, height) {
  validateFrames(frames, width, height);
  const background = new Float32Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const sourceOffset = pixel * 4;
    const targetOffset = pixel * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      let total = 0;
      let minimum = 255;
      let maximum = 0;
      for (const frame of frames) {
        const value = frame[sourceOffset + channel];
        total += value;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
      const divisor = frames.length > 4 ? frames.length - 2 : frames.length;
      background[targetOffset + channel] =
        frames.length > 4 ? (total - minimum - maximum) / divisor : total / divisor;
    }
  }
  return background;
}

export function buildSkinCalibration(
  frames,
  background,
  width,
  height,
  { sampleBoxRatio = 0.42 } = {},
) {
  validateFrames(frames, width, height);
  if (!(background instanceof Float32Array) || background.length !== width * height * 3) {
    throw new TypeError('A matching background reference is required.');
  }

  const boxWidth = Math.floor(width * sampleBoxRatio);
  const boxHeight = Math.floor(height * sampleBoxRatio);
  const startX = Math.floor((width - boxWidth) / 2);
  const startY = Math.floor((height - boxHeight) / 2);
  const cbValues = [];
  const crValues = [];
  const differences = [];

  for (const frame of frames) {
    for (let y = startY; y < startY + boxHeight; y += 2) {
      for (let x = startX; x < startX + boxWidth; x += 2) {
        const pixel = y * width + x;
        const difference = backgroundDifference(frame, background, pixel);
        if (difference < 12) continue;
        const offset = pixel * 4;
        const colour = rgbToYCbCr(frame[offset], frame[offset + 1], frame[offset + 2]);
        if (colour.y < 20 || colour.y > 245) continue;
        cbValues.push(colour.cb);
        crValues.push(colour.cr);
        differences.push(difference);
      }
    }
  }

  const minimumSamples = Math.max(100, Math.floor(boxWidth * boxHeight * 0.08));
  if (cbValues.length < minimumSamples) {
    throw new Error(
      'Open-palm calibration could not separate the hand from the background.',
    );
  }

  const cb = median(cbValues);
  const cr = median(crValues);
  const cbMad = medianAbsoluteDeviation(cbValues, cb);
  const crMad = medianAbsoluteDeviation(crValues, cr);
  return Object.freeze({
    width,
    height,
    background,
    cb,
    cr,
    cbTolerance: clamp(cbMad * 3 + 7, 12, 34),
    crTolerance: clamp(crMad * 3 + 7, 12, 34),
    foregroundThreshold: clamp(percentile(differences, 0.2) * 0.45, 14, 42),
    minimumLuminance: 18,
    maximumLuminance: 248,
  });
}
