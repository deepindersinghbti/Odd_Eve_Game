import { cleanMask } from './binaryMask.js';
import { rgbToYCbCr } from './color.js';
import { findComponents } from './connectedComponents.js';
import { SEGMENTATION_CONFIG } from './constants.js';
import { selectHandComponent } from './handPresence.js';

function passesFallbackSkin(colour, gamut) {
  return (
    colour.cb >= gamut.cbMin &&
    colour.cb <= gamut.cbMax &&
    colour.cr >= gamut.crMin &&
    colour.cr <= gamut.crMax
  );
}

// Median of a Float32Array-backed sample, via a copy so the input is not
// reordered. Used to estimate the frame's global exposure shift.
function medianOf(values, count) {
  if (!count) return 1;
  const sample = Array.prototype.slice.call(values, 0, count);
  sample.sort((first, second) => first - second);
  const middle = count >> 1;
  return count % 2 ? sample[middle] : (sample[middle - 1] + sample[middle]) / 2;
}

// Estimates how much the camera's auto-exposure has shifted the WHOLE frame
// since calibration, as a multiplicative luminance ratio. A global shift moves
// every pixel's ratio together, so its median is a robust estimate of the shift
// itself -- dividing it out leaves only genuine local changes (a hand).
export function estimateExposureRatio(data, calibration) {
  const { width, height } = calibration;
  const pixelCount = width * height;
  const stride = 7; // sparse sample; exposure is global, no need for every pixel
  const ratios = new Float32Array(Math.ceil(pixelCount / stride));
  let count = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    const reference = pixel * 3;
    const backgroundLuma =
      0.299 * calibration.background[reference] +
      0.587 * calibration.background[reference + 1] +
      0.114 * calibration.background[reference + 2];
    if (backgroundLuma < 8) continue;
    const luma =
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    ratios[count++] = luma / backgroundLuma;
  }
  const median = medianOf(ratios, count);
  return Number.isFinite(median) && median > 0.05 ? median : 1;
}

export function segmentHandPixels(data, calibration, output) {
  const { width, height } = calibration;
  if (data?.length !== width * height * 4) {
    throw new TypeError('Frame dimensions do not match calibration.');
  }
  const settings = { ...SEGMENTATION_CONFIG, ...(calibration.segmentation ?? {}) };
  const rawMask = output ?? new Uint8Array(width * height);
  rawMask.fill(0);

  const exposureRatio = estimateExposureRatio(data, calibration);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const reference = pixel * 3;
    const colour = rgbToYCbCr(data[offset], data[offset + 1], data[offset + 2]);

    if (colour.y < settings.minimumLuminance || colour.y > settings.maximumLuminance) {
      continue;
    }

    // --- Skin evidence -----------------------------------------------------
    // Calibrated ellipse first; the published gamut only widens it, and never
    // acts alone because the foreground test below still has to pass.
    const cbDistance = (colour.cb - calibration.cb) / calibration.cbTolerance;
    const crDistance = (colour.cr - calibration.cr) / calibration.crTolerance;
    const withinCalibratedSkin =
      cbDistance * cbDistance + crDistance * crDistance <= settings.skinEllipseCutoff;
    if (!withinCalibratedSkin && !passesFallbackSkin(colour, settings.fallbackSkin)) {
      continue;
    }

    // --- Foreground evidence (exposure invariant) --------------------------
    const background = rgbToYCbCr(
      calibration.background[reference],
      calibration.background[reference + 1],
      calibration.background[reference + 2],
    );
    const chromaDifference = Math.hypot(
      colour.cb - background.cb,
      colour.cr - background.cr,
    );
    // Undo the estimated global exposure shift before comparing luminance, so
    // a camera that re-exposed when the hand appeared does not mark the entire
    // ROI (or none of it) as foreground.
    const compensatedBackgroundLuma = background.y * exposureRatio;
    const luminanceRatio =
      compensatedBackgroundLuma > 1
        ? Math.abs(colour.y / compensatedBackgroundLuma - 1)
        : 0;

    if (
      chromaDifference >= settings.minimumChromaDifference ||
      luminanceRatio >= settings.minimumLuminanceRatio
    ) {
      rawMask[pixel] = 1;
    }
  }
  return cleanMask(rawMask, width, height);
}

// Returns the chosen hand component plus the evidence behind the choice, so
// callers can distinguish "no skin at all" from "skin present but it is not
// shaped like a hand reaching in from below" (typically a face).
export function extractHandComponent(data, calibration) {
  const mask = segmentHandPixels(data, calibration);
  const components = findComponents(mask, calibration.width, calibration.height);
  const selection = selectHandComponent(
    components,
    calibration.width,
    calibration.height,
  );
  return selection.component;
}

export function analyzeHandPresence(data, calibration) {
  const mask = segmentHandPixels(data, calibration);
  const components = findComponents(mask, calibration.width, calibration.height);
  return selectHandComponent(components, calibration.width, calibration.height);
}
