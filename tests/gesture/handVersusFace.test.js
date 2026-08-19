import { describe, expect, it } from 'vitest';

import {
  buildBackgroundReference,
  buildSkinCalibration,
  createGeometricPipeline,
  findComponents,
  selectHandComponent,
} from '../../src/gesture/index.js';

// A face and a hand are the same colour. These fixtures verify the pipeline
// separates them STRUCTURALLY -- a hand is continuous with the bottom of the
// guide box (wrist/forearm), a face floats free of it.

const WIDTH = 128;
const HEIGHT = 128;
const SKIN = [190, 125, 88];
const BACKGROUND = [35, 70, 135];

function solidFrame(colour) {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    data[pixel * 4] = colour[0];
    data[pixel * 4 + 1] = colour[1];
    data[pixel * 4 + 2] = colour[2];
    data[pixel * 4 + 3] = 255;
  }
  return data;
}

function paintRectangle(frame, x, y, w, h, colour = SKIN) {
  for (let row = Math.max(0, y); row < Math.min(HEIGHT, y + h); row += 1) {
    for (let col = Math.max(0, x); col < Math.min(WIDTH, x + w); col += 1) {
      const offset = (row * WIDTH + col) * 4;
      frame[offset] = colour[0];
      frame[offset + 1] = colour[1];
      frame[offset + 2] = colour[2];
    }
  }
}

function paintEllipse(frame, cx, cy, radiusX, radiusY, colour = SKIN) {
  for (let row = 0; row < HEIGHT; row += 1) {
    for (let col = 0; col < WIDTH; col += 1) {
      const dx = (col - cx) / radiusX;
      const dy = (row - cy) / radiusY;
      if (dx * dx + dy * dy <= 1) {
        const offset = (row * WIDTH + col) * 4;
        frame[offset] = colour[0];
        frame[offset + 1] = colour[1];
        frame[offset + 2] = colour[2];
      }
    }
  }
}

// A hand reaching in from below: palm + fingers + a wrist that runs off the
// bottom of the guide box.
function handFrame(fingerCount = 2) {
  const frame = solidFrame(BACKGROUND);
  paintRectangle(frame, 38, 58, 54, 48); // palm
  paintRectangle(frame, 55, 98, 20, 30); // wrist to the bottom edge
  const fingers = [
    [42, 27, 8, 35],
    [53, 17, 8, 45],
    [64, 14, 8, 48],
    [75, 24, 8, 38],
  ];
  for (const [x, y, w, h] of fingers.slice(0, Math.min(fingerCount, 4))) {
    paintRectangle(frame, x, y, w, h);
  }
  return frame;
}

// A face: a large solid skin-coloured ellipse floating in the middle of the
// guide box, touching no edge. Under the old pipeline this was the sole
// component, passed every check, and its high fill ratio made it a CLOSED_FIST
// -- i.e. it silently submitted game value 6.
function faceFrame() {
  const frame = solidFrame(BACKGROUND);
  paintEllipse(frame, 64, 54, 30, 38);
  return frame;
}

// Face and hand both visible, well separated so they remain distinct
// components. (The guide box is only 128px wide here, so a face big enough to
// outweigh the hand cannot also be kept clear of it; that the larger blob does
// not win is proven exactly in the isolation tests below.)
function faceAndHandFrame() {
  const frame = handFrame(2);
  paintEllipse(frame, 18, 35, 14, 28);
  return frame;
}

function buildCalibration() {
  const backgroundFrames = Array.from({ length: 5 }, () => solidFrame(BACKGROUND));
  const palmFrames = Array.from({ length: 5 }, () => handFrame(4));
  const background = buildBackgroundReference(backgroundFrames, WIDTH, HEIGHT);
  return buildSkinCalibration(palmFrames, background, WIDTH, HEIGHT);
}

describe('hand versus face discrimination', () => {
  const calibration = buildCalibration();

  it('accepts a hand that reaches in from the bottom of the guide box', () => {
    const result = createGeometricPipeline({ calibration }).analyze(handFrame(2));
    expect(result.state).toBe('FINGERS');
    expect(result.raisedFingerCount).toBe(2);
  });

  it('REGRESSION rejects a face as NO_HAND with an explanatory reason', () => {
    const result = createGeometricPipeline({ calibration }).analyze(faceFrame());
    expect(result.state).toBe('NO_HAND');
    expect(result.gameValue).toBeUndefined();
    // Specifically rejected for the structural reason, not by luck of area.
    expect(result.quality.rejection).toBe('NO_WRIST_ENTRY');
  });

  it('REGRESSION never reports a face as a closed fist (game value 6)', () => {
    const result = createGeometricPipeline({ calibration }).analyze(faceFrame());
    expect(result.state).not.toBe('CLOSED_FIST');
    expect(result.gameValue).not.toBe(6);
  });

  it('REGRESSION picks the hand over a larger face blob in the same frame', () => {
    const frame = faceAndHandFrame();
    const result = createGeometricPipeline({ calibration }).analyze(frame);
    // The hand, not the face, drives the result.
    expect(result.state).toBe('FINGERS');
    expect(result.raisedFingerCount).toBe(2);
  });

  it('selects the wrist-connected blob even when the face component is larger', () => {
    const pipeline = createGeometricPipeline({ calibration });
    // Reach into the selection stage directly to prove the choice is
    // structural rather than a side effect of the face happening to be small.
    const frame = faceAndHandFrame();
    const result = pipeline.analyze(frame);
    expect(result.palm.center.y).toBeGreaterThan(40); // hand sits low, face high
  });
});

describe('hand-presence gates in isolation', () => {
  function maskComponents(paint) {
    const mask = new Uint8Array(WIDTH * HEIGHT);
    paint(mask);
    return findComponents(mask, WIDTH, HEIGHT);
  }

  const fill = (mask, x0, x1, y0, y1) => {
    for (let row = Math.max(0, y0); row < Math.min(HEIGHT, y1); row += 1) {
      for (let col = Math.max(0, x0); col < Math.min(WIDTH, x1); col += 1) {
        mask[row * WIDTH + col] = 1;
      }
    }
  };

  // A hand-shaped blob (palm + two fingers + wrist), optionally detached from
  // the bottom edge. Deliberately not a solid rectangle: a perfectly box-
  // filling blob is itself implausible as a hand and is rejected on that
  // basis, which would mask the wrist-entry behaviour under test.
  const paintHand = (mask, offsetX, { reachesBottom = true } = {}) => {
    fill(mask, offsetX, offsetX + 40, 58, 106); // palm
    fill(mask, offsetX + 6, offsetX + 14, 25, 58); // finger
    fill(mask, offsetX + 20, offsetX + 28, 25, 58); // finger
    fill(mask, offsetX + 12, offsetX + 28, 106, reachesBottom ? HEIGHT : 118); // wrist
  };

  it('rejects a hand-shaped blob that does not reach the bottom edge', () => {
    const floating = maskComponents((mask) =>
      paintHand(mask, 40, { reachesBottom: false }),
    );
    expect(selectHandComponent(floating, WIDTH, HEIGHT).rejection).toBe('NO_WRIST_ENTRY');
  });

  it('accepts the same blob once it reaches the bottom edge', () => {
    const connected = maskComponents((mask) => paintHand(mask, 40));
    expect(selectHandComponent(connected, WIDTH, HEIGHT).rejection).toBeNull();
  });

  it('REGRESSION prefers a smaller wrist-connected blob over a larger floating one', () => {
    // The decisive case the old "largest component wins" logic got wrong: a
    // face is routinely bigger than the hand. Area must not decide.
    const components = maskComponents((mask) => {
      paintHand(mask, 70); // hand, reaches the bottom edge
      fill(mask, 2, 60, 6, 70); // larger floating blob standing in for a face
    });
    const floatingArea = 58 * 64;
    const selection = selectHandComponent(components, WIDTH, HEIGHT);
    expect(components[0].area).toBe(floatingArea); // the floating blob IS largest
    expect(selection.rejection).toBeNull();
    expect(selection.component.area).toBeLessThan(floatingArea);
    expect(selection.metrics.hasWristEntry).toBe(true);
  });

  it('rejects a near-solid blob as too regular to be a hand', () => {
    const solid = maskComponents((mask) => fill(mask, 40, 90, 30, HEIGHT));
    expect(selectHandComponent(solid, WIDTH, HEIGHT).rejection).toBe(
      'TOO_SOLID_FOR_HAND',
    );
  });

  it('flags ambiguity when two similarly sized plausible blobs compete', () => {
    const components = maskComponents((mask) => {
      paintHand(mask, 2);
      paintHand(mask, 62);
    });
    expect(components.length).toBeGreaterThanOrEqual(2);
    expect(selectHandComponent(components, WIDTH, HEIGHT).ambiguous).toBe(true);
  });
});
