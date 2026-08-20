import { cleanMask } from './binaryMask.js';
import { findComponents } from './connectedComponents.js';
import { SEGMENTATION_CONFIG } from './constants.js';
import { estimateFrameShift, isForegroundPixel } from './foreground.js';
import { selectHandComponent } from './handPresence.js';

function passesFallbackSkin(cb, cr, gamut) {
  return cb >= gamut.cbMin && cb <= gamut.cbMax && cr >= gamut.crMin && cr <= gamut.crMax;
}

export function segmentHandPixels(data, calibration, output) {
  const { width, height } = calibration;
  if (data?.length !== width * height * 4) {
    throw new TypeError('Frame dimensions do not match calibration.');
  }
  const settings = { ...SEGMENTATION_CONFIG, ...(calibration.segmentation ?? {}) };
  const rawMask = output ?? new Uint8Array(width * height);
  rawMask.fill(0);

  const backgroundYCbCr = calibration.backgroundYCbCr;
  const shift = estimateFrameShift(data, calibration.background, width, height);

  // The gain correction is a per-channel scale and the YCbCr transform is
  // linear, so the two fold into one set of coefficients. This applies the
  // white-balance correction for free -- same arithmetic per pixel as an
  // uncorrected conversion, no divisions in the inner loop.
  const invRed = 1 / shift.gainRed;
  const invGreen = 1 / shift.gainGreen;
  const invBlue = 1 / shift.gainBlue;
  const yR = 0.299 * invRed;
  const yG = 0.587 * invGreen;
  const yB = 0.114 * invBlue;
  const cbR = -0.168736 * invRed;
  const cbG = -0.331264 * invGreen;
  const cbB = 0.5 * invBlue;
  const crR = 0.5 * invRed;
  const crG = -0.418688 * invGreen;
  const crB = -0.081312 * invBlue;

  // YCbCr is computed inline rather than through rgbToYCbCr so the inner loop
  // allocates nothing. At 256x256 the object-returning version allocated
  // ~130k short-lived objects per frame.
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const reference = pixel * 3;
    const rawRed = data[offset];
    const rawGreen = data[offset + 1];
    const rawBlue = data[offset + 2];

    // Sensor-clipping bound, applied to the RAW signal: once a channel
    // saturates its true value is unrecoverable, and no gain correction can
    // bring it back.
    const rawLuma = 0.299 * rawRed + 0.587 * rawGreen + 0.114 * rawBlue;
    if (rawLuma < settings.minimumLuminance || rawLuma > settings.maximumLuminance) {
      continue;
    }

    // Gain-corrected YCbCr in one step, putting the pixel back into the colour
    // space the calibration was taken in so both tests below compare like with
    // like.
    const luma = yR * rawRed + yG * rawGreen + yB * rawBlue;
    const cb = 128 + cbR * rawRed + cbG * rawGreen + cbB * rawBlue;
    const cr = 128 + crR * rawRed + crG * rawGreen + crB * rawBlue;

    // --- Skin evidence -----------------------------------------------------
    // Calibrated ellipse first; the published gamut only widens it, and never
    // acts alone because the foreground test below still has to pass.
    const cbDistance = (cb - calibration.cb) / calibration.cbTolerance;
    const crDistance = (cr - calibration.cr) / calibration.crTolerance;
    const withinCalibratedSkin =
      cbDistance * cbDistance + crDistance * crDistance <= settings.skinEllipseCutoff;
    if (!withinCalibratedSkin && !passesFallbackSkin(cb, cr, settings.fallbackSkin)) {
      continue;
    }

    // --- Foreground evidence (camera-drift invariant) ----------------------
    if (
      isForegroundPixel(
        luma,
        cb,
        cr,
        backgroundYCbCr[reference],
        backgroundYCbCr[reference + 1],
        backgroundYCbCr[reference + 2],
        settings,
      )
    ) {
      rawMask[pixel] = 1;
    }
  }
  return cleanMask(rawMask, width, height);
}

// Returns the chosen hand component plus the evidence behind the choice, so
// callers can distinguish "no skin at all" from "skin present but it is not
// shaped like a hand reaching in from below" (typically a face).
export function analyzeHandPresence(data, calibration) {
  const mask = segmentHandPixels(data, calibration);
  const components = findComponents(mask, calibration.width, calibration.height);
  return selectHandComponent(components, calibration.width, calibration.height);
}

// Convenience wrapper for callers that only want the component. Delegates
// rather than repeating the segment/label/select sequence, so there is one
// path that can drift.
export function extractHandComponent(data, calibration) {
  return analyzeHandPresence(data, calibration).component;
}
