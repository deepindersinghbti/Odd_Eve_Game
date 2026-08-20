import { median, medianAbsoluteDeviation } from './color.js';
import { SEGMENTATION_CONFIG } from './constants.js';
import {
  buildBackgroundYCbCr,
  estimateFrameShift,
  isForegroundPixel,
} from './foreground.js';

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
  const backgroundYCbCr = buildBackgroundYCbCr(background, width, height);
  const cbValues = [];
  const crValues = [];

  for (const frame of frames) {
    // Palm pixels are selected with exactly the same foreground test used at
    // inference time, including correction for camera drift. Auto exposure and
    // auto white balance routinely fire when a hand enters the frame, so the
    // palm capture is frequently taken under different camera settings than
    // the background capture that preceded it. Selecting by raw RGB difference
    // (the previous approach) then marked the whole sample box as "hand" and
    // contaminated the skin model with background colour.
    const shift = estimateFrameShift(frame, background, width, height);
    for (let y = startY; y < startY + boxHeight; y += 2) {
      for (let x = startX; x < startX + boxWidth; x += 2) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        const reference = pixel * 3;
        const rawRed = frame[offset];
        const rawGreen = frame[offset + 1];
        const rawBlue = frame[offset + 2];
        const rawLuma = 0.299 * rawRed + 0.587 * rawGreen + 0.114 * rawBlue;
        if (rawLuma < SEGMENTATION_CONFIG.minimumLuminance) continue;
        if (rawLuma > SEGMENTATION_CONFIG.maximumLuminance) continue;

        // Stored gain-corrected, so the model lives in the background
        // capture's colour space and inference can correct into that same
        // frame of reference.
        const red = rawRed / shift.gainRed;
        const green = rawGreen / shift.gainGreen;
        const blue = rawBlue / shift.gainBlue;
        const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
        const cb = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
        const cr = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
        if (
          !isForegroundPixel(
            luma,
            cb,
            cr,
            backgroundYCbCr[reference],
            backgroundYCbCr[reference + 1],
            backgroundYCbCr[reference + 2],
            SEGMENTATION_CONFIG,
          )
        ) {
          continue;
        }
        cbValues.push(cb);
        crValues.push(cr);
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
    backgroundYCbCr,
    cb,
    cr,
    cbTolerance: clamp(cbMad * 3 + 7, 12, 34),
    crTolerance: clamp(crMad * 3 + 7, 12, 34),
  });
}
