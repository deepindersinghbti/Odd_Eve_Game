import { rgbToYCbCr } from './color.js';
import { SEGMENTATION_CONFIG } from './constants.js';

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// Shared definition of "this pixel is foreground", used by BOTH calibration and
// per-frame segmentation. Keeping one definition matters: when the two drifted
// apart, calibration selected palm pixels by raw RGB difference while inference
// selected them by exposure-invariant evidence, so the skin model was built
// from a different population than it was later applied to.

// Sparse sample: camera drift is global, so a few thousand pixels pin the
// median far more precisely than the thresholds need. Stride 19 over a 256x256
// ROI still yields ~3400 samples per channel, and the median's standard error
// falls as 1/sqrt(n) -- the extra precision from a denser sample buys nothing
// and three sorts per frame is the estimator's whole cost.
const SHIFT_STRIDE = 19;
const MINIMUM_BACKGROUND_LUMA = 8; // near-black pixels give meaningless ratios

// Converts the calibrated background to YCbCr once per session. The background
// never changes, so doing this here instead of per pixel per frame removes the
// single largest source of per-frame work in the pipeline.
export function buildBackgroundYCbCr(background, width, height) {
  const converted = new Float32Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 3;
    const colour = rgbToYCbCr(
      background[offset],
      background[offset + 1],
      background[offset + 2],
    );
    converted[offset] = colour.y;
    converted[offset + 1] = colour.cb;
    converted[offset + 2] = colour.cr;
  }
  return converted;
}

// Sorts in place on a typed array view: numeric by default and allocation free,
// unlike copying into a boxed JS array.
function medianOfTyped(values, count) {
  if (!count) return null;
  const view = values.subarray(0, count);
  view.sort();
  const middle = count >> 1;
  return count % 2 ? view[middle] : (view[middle - 1] + view[middle]) / 2;
}

// Estimates the camera's GLOBAL response drift since calibration as a PER
// CHANNEL GAIN, which is what the camera actually applies: auto exposure moves
// all three gains together, auto white balance moves red and blue against
// green. Each is the median ratio of the current frame to the calibrated
// background over a sparse sample -- a global change moves every pixel's ratio
// together, while the hand is a minority of pixels and barely perturbs a median.
//
// Modelling this multiplicatively in RGB rather than as an additive chroma
// offset matters. A channel gain shifts a pixel's chroma in proportion to that
// pixel's own channel value, so one additive offset cannot correct a dark
// background and bright skin at the same time: correcting the background left
// skin chroma ~22 units off, far enough outside the calibrated ellipse that
// the hand vanished entirely under a warm shift. Dividing the gain back out
// inverts the camera's actual transformation at every brightness.
export function estimateFrameShift(data, backgroundRgb, width, height, scratch) {
  const pixelCount = width * height;
  const buffers = scratch ?? scratchFor(width, height);
  let count = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += SHIFT_STRIDE) {
    const offset = pixel * 4;
    const reference = pixel * 3;
    const backgroundRed = backgroundRgb[reference];
    const backgroundGreen = backgroundRgb[reference + 1];
    const backgroundBlue = backgroundRgb[reference + 2];
    // Near-black channels give meaningless, explosive ratios.
    if (
      backgroundRed < MINIMUM_BACKGROUND_LUMA ||
      backgroundGreen < MINIMUM_BACKGROUND_LUMA ||
      backgroundBlue < MINIMUM_BACKGROUND_LUMA
    ) {
      continue;
    }
    buffers.red[count] = data[offset] / backgroundRed;
    buffers.green[count] = data[offset + 1] / backgroundGreen;
    buffers.blue[count] = data[offset + 2] / backgroundBlue;
    count += 1;
  }

  // Clamped to plausible camera drift. Beyond these bounds the SCENE changed
  // rather than the camera -- most obviously when an object covers nearly the
  // whole ROI, where the two are mathematically indistinguishable -- and
  // believing the estimate would divide away the very signal we need.
  const { minimumLuminanceShift: low, maximumLuminanceShift: high } = SEGMENTATION_CONFIG;
  const gain = (values) => {
    const measured = medianOfTyped(values, count);
    return Number.isFinite(measured) ? clamp(measured, low, high) : 1;
  };
  return {
    gainRed: gain(buffers.red),
    gainGreen: gain(buffers.green),
    gainBlue: gain(buffers.blue),
  };
}

export function createFrameShiftScratch(width, height) {
  const capacity = Math.ceil((width * height) / SHIFT_STRIDE);
  return {
    capacity,
    red: new Float32Array(capacity),
    green: new Float32Array(capacity),
    blue: new Float32Array(capacity),
  };
}

// Reused across frames so the estimator allocates nothing in the steady state.
// Safe to share: the buffers are pure scratch, fully rewritten up to `count`
// on every call and only ever read back within that same call, so results do
// not depend on what a previous frame left behind.
let sharedScratch = null;
function scratchFor(width, height) {
  const capacity = Math.ceil((width * height) / SHIFT_STRIDE);
  if (!sharedScratch || sharedScratch.capacity < capacity) {
    sharedScratch = createFrameShiftScratch(width, height);
  }
  return sharedScratch;
}

// True when the pixel differs from the calibrated background by more than
// camera drift explains. The caller passes values already divided by the
// measured per-channel gains, so they sit in the same colour space as the
// calibration and what remains is genuine local change.
export function isForegroundPixel(
  luma,
  cb,
  cr,
  backgroundY,
  backgroundCb,
  backgroundCr,
  settings,
) {
  const chromaDifference = Math.hypot(cb - backgroundCb, cr - backgroundCr);
  if (chromaDifference >= settings.minimumChromaDifference) return true;
  if (!(backgroundY > 1)) return false;
  return Math.abs(luma / backgroundY - 1) >= settings.minimumLuminanceRatio;
}
