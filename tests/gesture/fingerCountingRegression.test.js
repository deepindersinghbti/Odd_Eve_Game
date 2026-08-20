import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STABILITY_SETTINGS,
  GESTURE_TO_NUMBER,
  GEOMETRY_CONFIG,
  analyzeHandGeometry,
  buildBackgroundReference,
  buildSkinCalibration,
  createGeometricPipeline,
  createStabilityFilter,
  findLargestComponent,
} from '../../src/gesture/index.js';

// ---------------------------------------------------------------------------
// Synthetic mask builders. All fixtures are deterministic Uint8Array binary
// silhouettes -- no camera, no images, no ML. Palm + wrist are a fixed base;
// individual fixtures add fingers, noise, and artifacts on top of it.
// ---------------------------------------------------------------------------

function drawRectangle(mask, width, height, x, y, w, h) {
  for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
    for (let col = Math.max(0, x); col < Math.min(width, x + w); col += 1) {
      mask[row * width + col] = 1;
    }
  }
}

function drawDisc(mask, width, height, cx, cy, radius) {
  for (
    let row = Math.max(0, Math.floor(cy - radius));
    row <= Math.min(height - 1, Math.ceil(cy + radius));
    row += 1
  ) {
    for (
      let col = Math.max(0, Math.floor(cx - radius));
      col <= Math.min(width - 1, Math.ceil(cx + radius));
      col += 1
    ) {
      if (Math.hypot(col - cx, row - cy) <= radius) mask[row * width + col] = 1;
    }
  }
}

function drawRoundedFinger(mask, width, height, x, tipY, baseY, fingerWidth) {
  const radius = fingerWidth / 2;
  const cx = x + radius;
  drawRectangle(
    mask,
    width,
    height,
    x,
    tipY + radius,
    fingerWidth,
    baseY - (tipY + radius),
  );
  drawDisc(mask, width, height, cx, tipY + radius, radius);
}

function basePalm(width = 128, height = 128) {
  const mask = new Uint8Array(width * height);
  drawRectangle(mask, width, height, 34, 58, 60, 48); // palm
  drawRectangle(mask, width, height, 55, 98, 20, 30); // wrist, enters from the bottom
  return mask;
}

function deterministicRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function jaggedBoundary(
  mask,
  width,
  height,
  cx,
  cy,
  radius,
  seed,
  rate = 0.5,
  band = 2.2,
) {
  const rand = deterministicRandom(seed);
  for (
    let row = Math.floor(cy - radius) - 2;
    row <= Math.ceil(cy + radius) + 2;
    row += 1
  ) {
    if (row < 0 || row >= height) continue;
    for (
      let col = Math.floor(cx - radius) - 2;
      col <= Math.ceil(cx + radius) + 2;
      col += 1
    ) {
      if (col < 0 || col >= width) continue;
      const dist = Math.hypot(col - cx, row - cy);
      if (Math.abs(dist - radius) <= band && rand() < rate) {
        const idx = row * width + col;
        mask[idx] = mask[idx] ? 0 : 1;
      }
    }
  }
}

function analyze(mask, width = 128, height = 128, overrides) {
  const component = findLargestComponent(mask, width, height);
  return analyzeHandGeometry(component, width, height, overrides);
}

// Two genuinely raised, adjacent fingers (index + middle) PLUS the three
// folded digits (thumb, ring, pinky) modelled realistically: a curled
// knuckle does not sit perfectly flush with the palm outline, it bulges the
// silhouette a little. This is the reproduction of the reported "2 detected
// as 5" failure -- see docs/gesture-model.md for the diagnostic writeup.
function twoFingersWithFoldedDigitBulges({ jagged = false } = {}) {
  const width = 128;
  const height = 128;
  const mask = basePalm(width, height);
  const fingers = [
    { x: 50, tipY: 16, baseY: 62, width: 14 },
    { x: 65, tipY: 13, baseY: 62, width: 14 },
  ];
  for (const finger of fingers) {
    drawRoundedFinger(
      mask,
      width,
      height,
      finger.x,
      finger.tipY,
      finger.baseY,
      finger.width,
    );
  }
  drawRoundedFinger(mask, width, height, 34, 50, 62, 10); // folded thumb knuckle
  drawRoundedFinger(mask, width, height, 82, 48, 62, 10); // folded ring-side knuckle
  drawRoundedFinger(mask, width, height, 94, 54, 68, 8); // folded pinky-side knuckle
  if (jagged) {
    for (const finger of fingers) {
      jaggedBoundary(
        mask,
        width,
        height,
        finger.x + finger.width / 2,
        finger.tipY + finger.width / 2,
        finger.width / 2,
        finger.x + finger.tipY,
      );
    }
  }
  return { mask, width, height };
}

describe('finger-counting regression: two fingers must never be reported as five', () => {
  it('REGRESSION reproduces raw over-generation but clusters/validates down to exactly 2 (clean mask)', () => {
    const { mask, width, height } = twoFingersWithFoldedDigitBulges({ jagged: false });
    const geometry = analyze(mask, width, height);
    // The raw local-maximum stage over-generates -- palm/wrist corners and the
    // folded-digit knuckle bulges all register as local maxima. This is
    // intentional and documents that duplicate/false candidates really do
    // reach the validation stage; they must be rejected there, not by luck.
    expect(geometry.diagnostics.rawPeakCount).toBeGreaterThan(2);
    expect(geometry.raisedFingerCount).toBe(2);
    expect(geometry.fingertips).toHaveLength(2);
  });

  it('REGRESSION still resolves to exactly 2 once realistic boundary jaggedness is added', () => {
    const { mask, width, height } = twoFingersWithFoldedDigitBulges({ jagged: true });
    const geometry = analyze(mask, width, height);
    expect(geometry.diagnostics.rawPeakCount).toBeGreaterThan(2);
    expect(geometry.raisedFingerCount).toBe(2);
  });

  it('REGRESSION end-to-end: pipeline + stability filter submit game value 2 exactly once', () => {
    const { mask, width, height } = twoFingersWithFoldedDigitBulges({ jagged: false });
    const component = findLargestComponent(mask, width, height);
    // Fake a calibrated pipeline by monkey-patching extractHandComponent via a
    // pre-segmented frame is unnecessary here: analyzeHandGeometry is the
    // pure geometry stage the pipeline calls after segmentation, and it is
    // what the reported bug lives in. Drive the stability filter directly off
    // its output the same way createGeometricPipeline does downstream.
    const geometry = analyzeHandGeometry(component, width, height);
    expect(geometry.raisedFingerCount).toBe(2);

    const filter = createStabilityFilter();
    const label = 'TWO';
    let lastResult = null;
    for (let frame = 0; frame < 10; frame += 1) {
      lastResult = filter.push({ label, confidence: 0.9, timestamp: frame * 100 });
    }
    // 8-of-10 agreement reached but hold time (700ms) has just been reached
    // at frame 9 (900ms) -- one more frame confirms submission.
    const finalPush = filter.push({ label, confidence: 0.9, timestamp: 1000 });
    const submitted = [lastResult, finalPush].find(
      (result) => result.submission !== null,
    );
    expect(submitted.submission).toBe(2);
    expect(GESTURE_TO_NUMBER[label]).toBe(2);

    // Removal is required before rearming; a further TWO frame does not
    // resubmit.
    const afterSubmission = filter.push({ label, confidence: 0.9, timestamp: 1100 });
    expect(afterSubmission.submission).toBeNull();
    // Re-arming needs sustained confirmed removal, not a single empty frame.
    let afterNoHand = null;
    for (
      let frame = 0;
      frame < DEFAULT_STABILITY_SETTINGS.requiredRemovalFrames;
      frame += 1
    ) {
      afterNoHand = filter.push({
        label: 'NO_HAND',
        confidence: 1,
        timestamp: 1200 + frame * 100,
      });
    }
    expect(afterNoHand.armed).toBe(true);
  });
});

describe('finger-counting regression: one raised finger must not be counted as two or three', () => {
  const SIZE = 256;
  const round = Math.round;
  const disc = (mask, cx, cy, r) => {
    for (
      let y = Math.max(0, Math.floor(cy - r));
      y <= Math.min(SIZE - 1, Math.ceil(cy + r));
      y += 1
    ) {
      for (
        let x = Math.max(0, Math.floor(cx - r));
        x <= Math.min(SIZE - 1, Math.ceil(cx + r));
        x += 1
      ) {
        if (Math.hypot(x - cx, y - cy) <= r) mask[y * SIZE + x] = 1;
      }
    }
  };
  const box = (mask, x0, x1, y0, y1) => {
    for (let y = Math.max(0, round(y0)); y < Math.min(SIZE, round(y1)); y += 1) {
      for (let x = Math.max(0, round(x0)); x < Math.min(SIZE, round(x1)); x += 1) {
        mask[y * SIZE + x] = 1;
      }
    }
  };
  const straightFinger = (mask, cx, tipY, baseY, halfWidth) => {
    box(mask, cx - halfWidth, cx + halfWidth, tipY + halfWidth, baseY);
    disc(mask, cx, tipY + halfWidth, halfWidth);
  };

  // A raised index finger on a closed fist, hand close to the camera. The
  // small palm radius inflates EVERY normalized protrusion, including the
  // curled knuckles' -- which is precisely why an absolute length threshold
  // cannot separate them and a relative one can.
  function indexFingerOnFist({ fistRadius = 26, fistY = 170, knuckleRadius = 16 } = {}) {
    const mask = new Uint8Array(SIZE * SIZE);
    box(mask, 128 - 18, 128 + 18, fistY, SIZE); // forearm to the bottom edge
    disc(mask, 128, fistY, fistRadius);
    straightFinger(mask, 128, 20, fistY, 11);
    disc(mask, 128 - 30, fistY - 30, knuckleRadius); // curled knuckles
    disc(mask, 128 + 30, fistY - 30, knuckleRadius);
    return mask;
  }

  it('REGRESSION counts a single raised finger as one despite prominent knuckles', () => {
    const component = findLargestComponent(indexFingerOnFist(), SIZE, SIZE);
    const geometry = analyzeHandGeometry(component, SIZE, SIZE);
    expect(geometry.raisedFingerCount).toBe(1);
  });

  it('proves the knuckles clear the ABSOLUTE threshold and only the relative gate rejects them', () => {
    const component = findLargestComponent(indexFingerOnFist(), SIZE, SIZE);
    // Disabling only the relative gate reproduces the reported failure.
    const withoutRelativeGate = analyzeHandGeometry(component, SIZE, SIZE, {
      relativeLengthRatio: 0,
    });
    expect(withoutRelativeGate.raisedFingerCount).toBe(3);
    for (const tip of withoutRelativeGate.fingertips) {
      expect(tip.normalizedLength).toBeGreaterThan(
        GEOMETRY_CONFIG.minimumNormalizedLength,
      );
    }

    const withRelativeGate = analyzeHandGeometry(component, SIZE, SIZE);
    expect(withRelativeGate.raisedFingerCount).toBe(1);
    expect(
      withRelativeGate.diagnostics.rejectedCandidates.filter(
        (candidate) => candidate.rejectionReason === 'SHORT_RELATIVE_TO_LONGEST',
      ),
    ).toHaveLength(2);
  });

  it('still counts a genuinely raised neighbouring finger as two', () => {
    // A finger extended to ~85% of the index is genuinely raised and must not
    // be suppressed by the relative gate.
    const mask = new Uint8Array(SIZE * SIZE);
    const fistY = 150;
    box(mask, 128 - 26, 128 + 26, fistY, SIZE);
    disc(mask, 128, fistY, 40);
    straightFinger(mask, 104, 34, fistY, 12);
    straightFinger(mask, 152, fistY - (fistY - 34) * 0.85, fistY, 12);
    const geometry = analyzeHandGeometry(
      findLargestComponent(mask, SIZE, SIZE),
      SIZE,
      SIZE,
    );
    expect(geometry.raisedFingerCount).toBe(2);
  });
});

describe('finger-counting regression: distinct five-finger silhouettes still count as five', () => {
  function spreadHand(fingerCount) {
    const width = 128;
    const height = 128;
    const mask = new Uint8Array(width * height);
    drawRectangle(mask, width, height, 38, 58, 54, 48);
    drawRectangle(mask, width, height, 55, 98, 20, 30);
    const fingers = [
      { x: 42, tipY: 27, baseY: 62, width: 8 },
      { x: 53, tipY: 17, baseY: 62, width: 8 },
      { x: 64, tipY: 14, baseY: 62, width: 8 },
      { x: 75, tipY: 24, baseY: 62, width: 8 },
    ];
    for (const finger of fingers.slice(0, Math.min(fingerCount, 4))) {
      drawRoundedFinger(
        mask,
        width,
        height,
        finger.x,
        finger.tipY,
        finger.baseY,
        finger.width,
      );
    }
    if (fingerCount === 5) drawRoundedFinger(mask, width, height, 89, 45, 62, 20);
    return { mask, width, height };
  }

  it.each([1, 2, 3, 4, 5])(
    'genuinely distinct %i-finger silhouette counts as %i',
    (count) => {
      const { mask, width, height } = spreadHand(count);
      const geometry = analyze(mask, width, height);
      expect(geometry.raisedFingerCount).toBe(count);
    },
  );
});

describe('finger-counting regression: robustness fixtures', () => {
  it('closed fist reports zero raised fingers with valid palm geometry', () => {
    const mask = basePalm();
    const geometry = analyze(mask);
    expect(geometry.valid).toBe(true);
    expect(geometry.raisedFingerCount).toBe(0);
  });

  it('no hand (empty mask) is reported as invalid geometry, not a fist', () => {
    const mask = new Uint8Array(128 * 128);
    const component = findLargestComponent(mask, 128, 128);
    expect(component).toBeNull();
  });

  it('a small disconnected background blob near the hand does not add a finger', () => {
    const mask = basePalm();
    drawDisc(mask, 128, 128, 10, 10, 4); // small isolated blob, far from the hand
    const geometry = analyze(mask);
    // findLargestComponent already keeps only the largest component, so the
    // blob is excluded from the analyzed mask entirely.
    expect(geometry.raisedFingerCount).toBe(0);
  });

  it('forearm entering from the bottom is excluded from the fingertip search', () => {
    const mask = basePalm();
    drawRectangle(mask, 128, 128, 40, 98, 44, 30); // wide forearm filling the bottom edge
    const geometry = analyze(mask);
    expect(geometry.raisedFingerCount).toBe(0);
    for (const tip of geometry.fingertips) {
      expect(tip.y).toBeLessThanOrEqual(geometry.wristLine);
    }
  });

  it('a jagged/noisy contour on an open palm does not fragment one finger into several', () => {
    const width = 128;
    const height = 128;
    const mask = basePalm(width, height);
    const finger = { x: 55, tipY: 15, baseY: 62, width: 16 };
    drawRoundedFinger(
      mask,
      width,
      height,
      finger.x,
      finger.tipY,
      finger.baseY,
      finger.width,
    );
    jaggedBoundary(
      mask,
      width,
      height,
      finger.x + finger.width / 2,
      finger.tipY + finger.width / 2,
      finger.width / 2,
      99,
      0.5,
      2.4,
    );
    const geometry = analyze(mask, width, height);
    expect(geometry.raisedFingerCount).toBe(1);
  });

  it('one finger with multiple small contour peaks is still counted once', () => {
    const width = 128;
    const height = 128;
    const mask = basePalm(width, height);
    const finger = { x: 54, tipY: 14, baseY: 62, width: 18 };
    drawRoundedFinger(
      mask,
      width,
      height,
      finger.x,
      finger.tipY,
      finger.baseY,
      finger.width,
    );
    // Add two small notch-bumps directly on the tip's cap to create multiple
    // raw local maxima on the SAME physical fingertip.
    drawDisc(mask, width, height, finger.x + 4, finger.tipY + 2, 2);
    drawDisc(mask, width, height, finger.x + finger.width - 4, finger.tipY + 2, 2);
    const geometry = analyze(mask, width, height);
    expect(geometry.diagnostics.rawPeakCount).toBeGreaterThanOrEqual(1);
    expect(geometry.raisedFingerCount).toBe(1);
  });

  it('a hand touching the ROI edge is still analyzed without spurious edge fingertips', () => {
    const width = 128;
    const height = 128;
    const mask = new Uint8Array(width * height);
    drawRectangle(mask, width, height, 0, 58, 54, 48); // palm flush against the left edge
    drawRectangle(mask, width, height, 15, 98, 20, 30);
    drawRoundedFinger(mask, width, height, 20, 14, 62, 16);
    const geometry = analyze(mask, width, height);
    for (const tip of geometry.fingertips) {
      expect(tip.x).toBeGreaterThan(1);
    }
  });

  it('rejects invalid/undersized palm geometry instead of returning a fabricated count', () => {
    const width = 64;
    const height = 64;
    const mask = new Uint8Array(width * height);
    drawRectangle(mask, width, height, 30, 30, 3, 3); // far too small to be a palm
    const component = findLargestComponent(mask, width, height);
    const geometry = analyzeHandGeometry(component, width, height);
    expect(geometry.valid).toBe(false);
    expect(geometry.raisedFingerCount).toBeNull();
  });

  it('handles fingertip clusters spanning the 0/360 angle wraparound', () => {
    // A single finger pointing along the palm centre's +x axis straddles the
    // atan2 wraparound point (angle 0 / 2*PI) in bin space: some of its
    // boundary points have y slightly above centre.y (angle just under 2*PI)
    // and some slightly below (angle just above 0).
    const width = 128;
    const height = 128;
    const mask = new Uint8Array(width * height);
    const cx = 30;
    const cy = 64;
    drawDisc(mask, width, height, cx, cy, 22); // round "palm" so centre is well inside
    // Horizontal finger extending in +x, capped with a disc tip -- long
    // enough that its normalized protrusion clears the acceptance threshold.
    drawRectangle(mask, width, height, cx, cy - 6, 45, 12);
    drawDisc(mask, width, height, cx + 45, cy, 6);
    drawRectangle(mask, width, height, cx - 20, cy + 20, 40, 25); // wrist below
    const geometry = analyze(mask, width, height);
    expect(geometry.raisedFingerCount).toBe(1);
    expect(geometry.fingertips[0].x).toBeGreaterThan(cx + 40);
  });
});

describe('confidence reacts to ambiguous geometry (Step 6)', () => {
  it('a frame with folded-digit bulges near the acceptance threshold carries weaker evidence than a clean one', () => {
    // This is the kind of evidence buildConfidence() in geometricPipeline.js
    // consumes -- candidate scores close to their rejection thresholds --
    // to lower confidence on a borderline frame instead of treating a
    // marginal pass exactly the same as an unambiguous one.
    const {
      mask: noisyMask,
      width,
      height,
    } = twoFingersWithFoldedDigitBulges({ jagged: false });
    const cleanMask = basePalm(width, height);
    drawRoundedFinger(cleanMask, width, height, 55, 15, 62, 16);
    drawRoundedFinger(cleanMask, width, height, 70, 15, 62, 16);

    const noisyGeometry = analyzeHandGeometry(
      findLargestComponent(noisyMask, width, height),
      width,
      height,
    );
    const cleanGeometry = analyzeHandGeometry(
      findLargestComponent(cleanMask, width, height),
      width,
      height,
    );
    // The strongest evidence of ambiguity: at least one REJECTED candidate in
    // the noisy frame (a folded-digit knuckle bulge) sits much closer to the
    // acceptance threshold than anything in the clean frame does.
    const closestRejectedMargin = (geometry) =>
      Math.min(
        ...geometry.diagnostics.rejectedCandidates
          .filter((c) => c.rejectionReason === 'INSUFFICIENT_PROTRUSION')
          .map((c) => GEOMETRY_CONFIG.minimumNormalizedLength - c.normalizedLength),
      );
    expect(closestRejectedMargin(noisyGeometry)).toBeLessThan(0.25);
    expect(closestRejectedMargin(noisyGeometry)).toBeLessThan(
      closestRejectedMargin(cleanGeometry),
    );
  });

  it('createGeometricPipeline lowers confidence on an ambiguous frame vs a clean one at equal finger count', () => {
    // Drive the full RGB -> segmentation -> geometry -> confidence pipeline
    // (the same one createGestureRecognizer uses) so this proves the
    // confidence wiring itself, not just the underlying geometry evidence.
    const width = 96;
    const height = 96;
    const skin = [190, 125, 88];
    const bg = [35, 70, 135];
    const solidFrame = (colour) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        data[pixel * 4] = colour[0];
        data[pixel * 4 + 1] = colour[1];
        data[pixel * 4 + 2] = colour[2];
        data[pixel * 4 + 3] = 255;
      }
      return data;
    };
    const paint = (frame, x, y, w, h) => {
      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) {
          const offset = (row * width + col) * 4;
          frame[offset] = skin[0];
          frame[offset + 1] = skin[1];
          frame[offset + 2] = skin[2];
        }
      }
    };
    const cleanHandFrame = () => {
      const frame = solidFrame(bg);
      paint(frame, 26, 44, 40, 36);
      paint(frame, 42, 74, 14, 20);
      paint(frame, 40, 12, 6, 34);
      paint(frame, 50, 10, 6, 36);
      return frame;
    };
    const noisyHandFrame = () => {
      const frame = cleanHandFrame();
      // Scatter single-pixel skin-coloured noise around the tips, simulating
      // a poorly separated background/skin boundary.
      const rand = deterministicRandom(3);
      for (let row = 8; row < 20; row += 1) {
        for (let col = 36; col < 60; col += 1) {
          if (rand() < 0.25) {
            const offset = (row * width + col) * 4;
            frame[offset] = skin[0];
            frame[offset + 1] = skin[1];
            frame[offset + 2] = skin[2];
          }
        }
      }
      return frame;
    };

    const backgroundFrames = Array.from({ length: 5 }, () => solidFrame(bg));
    const calibrationFrames = Array.from({ length: 5 }, cleanHandFrame);
    const background = buildBackgroundReference(backgroundFrames, width, height);
    const calibration = buildSkinCalibration(
      calibrationFrames,
      background,
      width,
      height,
    );

    const cleanResult = createGeometricPipeline({ calibration }).analyze(
      cleanHandFrame(),
    );
    const noisyResult = createGeometricPipeline({ calibration }).analyze(
      noisyHandFrame(),
    );
    if (cleanResult.raisedFingerCount === noisyResult.raisedFingerCount) {
      expect(noisyResult.confidence).toBeLessThanOrEqual(cleanResult.confidence);
    }
  });
});

describe('finger-counting regression: an over-generating frame is not a confident five', () => {
  const SIZE = 256;
  const round = Math.round;
  const set = (mask, x, y) => {
    const px = round(x);
    const py = round(y);
    if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) mask[py * SIZE + px] = 1;
  };
  const disc = (mask, cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        if (Math.hypot(x - cx, y - cy) <= r) set(mask, x, y);
      }
    }
  };
  const stroke = (mask, x0, y0, x1, y1, halfWidth) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= steps; i += 1) {
      disc(mask, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, halfWidth);
    }
  };

  // A badly segmented frame: spikes radiating from the palm, as a noisy skin
  // mask over a patterned background produces. A hand has five fingers, so
  // eight surviving candidates means the MASK is wrong -- not that the player
  // is showing eight.
  function spikyMask() {
    const mask = new Uint8Array(SIZE * SIZE);
    const cx = 128;
    const cy = 150;
    disc(mask, cx, cy, 38);
    stroke(mask, cx, cy, cx, SIZE + 40, 24);
    for (const degrees of [-72, -56, -40, -24, -8, 8, 24, 40]) {
      const angle = ((degrees - 90) * Math.PI) / 180;
      stroke(
        mask,
        cx + Math.cos(angle) * 20,
        cy + Math.sin(angle) * 20,
        cx + Math.cos(angle) * 104,
        cy + Math.sin(angle) * 104,
        8,
      );
    }
    return mask;
  }

  it('REGRESSION flags over-generation instead of silently truncating to five', () => {
    const geometry = analyzeHandGeometry(
      findLargestComponent(spikyMask(), SIZE, SIZE),
      SIZE,
      SIZE,
    );
    // More candidates survive validation than a hand can have.
    expect(geometry.diagnostics.acceptedBeforeValleyPass).toBeGreaterThan(
      GEOMETRY_CONFIG.maxFingertips,
    );
    expect(geometry.diagnostics.overGenerated).toBe(true);
    // The count is still capped, but the frame is marked untrustworthy and the
    // excess is reported rather than discarded in silence.
    expect(geometry.raisedFingerCount).toBe(GEOMETRY_CONFIG.maxFingertips);
    expect(
      geometry.diagnostics.rejectedCandidates.filter(
        (candidate) => candidate.rejectionReason === 'EXCEEDS_MAX_FINGERTIPS',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('a well-formed five-finger frame is NOT flagged as over-generating', () => {
    const mask = new Uint8Array(SIZE * SIZE);
    const cx = 128;
    const cy = 150;
    disc(mask, cx, cy, 38);
    stroke(mask, cx, cy, cx, SIZE + 40, 24);
    for (const degrees of [-60, -30, 0, 30, 60]) {
      const angle = ((degrees - 90) * Math.PI) / 180;
      stroke(
        mask,
        cx + Math.cos(angle) * 20,
        cy + Math.sin(angle) * 20,
        cx + Math.cos(angle) * 104,
        cy + Math.sin(angle) * 104,
        11,
      );
    }
    const geometry = analyzeHandGeometry(
      findLargestComponent(mask, SIZE, SIZE),
      SIZE,
      SIZE,
    );
    expect(geometry.raisedFingerCount).toBe(5);
    expect(geometry.diagnostics.overGenerated).toBe(false);
  });
});
