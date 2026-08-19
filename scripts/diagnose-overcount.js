// Dev-only diagnostic script. Proves the 2-finger -> 5-finger overcounting hypothesis
// against the CURRENT (pre-fix) geometric pipeline using deterministic synthetic masks.
// Run with: node scripts/diagnose-overcount.mjs
import { analyzeHandGeometry, findLargestComponent } from '../src/gesture/index.js';

function drawRectangle(mask, width, x, y, w, h) {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      if (col >= 0 && col < width && row >= 0) mask[row * width + col] = 1;
    }
  }
}

function drawDisc(mask, width, height, cx, cy, radius) {
  for (let row = Math.floor(cy - radius); row <= Math.ceil(cy + radius); row += 1) {
    if (row < 0 || row >= height) continue;
    for (let col = Math.floor(cx - radius); col <= Math.ceil(cx + radius); col += 1) {
      if (col < 0 || col >= width) continue;
      if (Math.hypot(col - cx, row - cy) <= radius) mask[row * width + col] = 1;
    }
  }
}

// A realistic finger silhouette: a straight rectangular shaft capped with a
// ROUNDED tip (a disc), the way a real hand's skin-segmented finger looks --
// not a blocky rectangle. Rounded tips are what actually create multiple close
// local radial maxima along the cap under per-angle-bin boundary sampling.
function drawRoundedFinger(mask, width, height, x, tipY, baseY, fingerWidth) {
  const radius = fingerWidth / 2;
  const cx = x + radius;
  drawRectangle(mask, width, x, tipY + radius, fingerWidth, baseY - (tipY + radius));
  drawDisc(mask, width, height, cx, tipY + radius, radius);
}

// Two adjacent (near-touching) raised fingers (index + middle), palm + wrist,
// with rounded tips. `jagged` adds a deterministic pseudo-random single-pixel
// stagger around each rounded tip, the kind of boundary noise that real
// per-pixel skin/background segmentation + 3x3 morphology produces on a real
// camera frame (staircase edges, uneven single-pixel fill/erosion).
function createNoisyTwoFingerHand({ jagged }) {
  const width = 128;
  const height = 128;
  const mask = new Uint8Array(width * height);
  drawRectangle(mask, width, 34, 58, 60, 48); // palm
  drawRectangle(mask, width, 55, 98, 20, 30); // wrist
  const fingers = [
    { x: 50, tipY: 16, baseY: 62, width: 14 }, // index (raised)
    { x: 65, tipY: 13, baseY: 62, width: 14 }, // middle (raised)
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
  // The three FOLDED digits (thumb, ring, pinky) are not perfectly flush with the
  // palm outline -- a real curled knuckle bulges the silhouette a little above the
  // flat palm edge. Model each as a short rounded bump sitting on the palm top/side.
  drawRoundedFinger(mask, width, height, 34, 50, 62, 10); // folded thumb stub, left side
  drawRoundedFinger(mask, width, height, 82, 48, 62, 10); // folded ring-side bump, right side
  drawRoundedFinger(mask, width, height, 94, 54, 68, 8); // folded pinky-side bump, far right
  drawRoundedFinger(mask, width, height, 40, 96, 106, 9); // wrist/forearm corner bulge, bottom-left

  if (jagged) {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (const finger of fingers) {
      const cx = finger.x + finger.width / 2;
      const cy = finger.tipY + finger.width / 2;
      const r = finger.width / 2;
      for (let row = Math.floor(cy - r) - 2; row <= Math.ceil(cy + r) + 2; row += 1) {
        if (row < 0 || row >= height) continue;
        for (let col = Math.floor(cx - r) - 2; col <= Math.ceil(cx + r) + 2; col += 1) {
          if (col < 0 || col >= width) continue;
          const dist = Math.hypot(col - cx, row - cy);
          const idx = row * width + col;
          if (Math.abs(dist - r) <= 2.2 && rand() < 0.5) {
            mask[idx] = mask[idx] ? 0 : 1;
          }
        }
      }
    }
  }

  return { mask, width, height };
}

for (const jagged of [false, true]) {
  const hand = createNoisyTwoFingerHand({ jagged });
  const component = findLargestComponent(hand.mask, hand.width, hand.height);
  const geometry = analyzeHandGeometry(component, hand.width, hand.height);
  console.log(`\n=== two raised fingers, jagged=${jagged} ===`);
  console.log('raisedFingerCount:', geometry.raisedFingerCount);
  console.log(
    'fingertips:',
    geometry.fingertips.map((f) => ({
      x: f.x,
      y: f.y,
      angleDeg: +((f.angle * 180) / Math.PI).toFixed(1),
      normalizedLength: +f.normalizedLength.toFixed(3),
      prominence: +f.prominence.toFixed(3),
      curvatureAngle: f.curvatureAngle === null ? null : +f.curvatureAngle.toFixed(1),
    })),
  );
  console.log(
    'rejected:',
    geometry.diagnostics.rejectedCandidates.map((f) => ({
      x: f.x,
      y: f.y,
      angleDeg: +((f.angle * 180) / Math.PI).toFixed(1),
      normalizedLength: +f.normalizedLength.toFixed(3),
      prominence: +f.prominence.toFixed(3),
      curvatureAngle: f.curvatureAngle === null ? null : +f.curvatureAngle.toFixed(1),
      reason: f.rejectionReason,
    })),
  );
}
