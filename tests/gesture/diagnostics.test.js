import { describe, expect, it } from 'vitest';

import {
  CONFIDENCE_CONFIG,
  createGeometricPipeline,
  buildBackgroundReference,
  buildSkinCalibration,
} from '../../src/gesture/index.js';
import {
  createDiagnosticsRecorder,
  decodeBytes,
  encodeBytes,
  fixtureToFrame,
} from '../../src/gesture/diagnostics.js';

const SIZE = 64;

function solidFrame(colour) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let pixel = 0; pixel < SIZE * SIZE; pixel += 1) {
    data[pixel * 4] = colour[0];
    data[pixel * 4 + 1] = colour[1];
    data[pixel * 4 + 2] = colour[2];
    data[pixel * 4 + 3] = 255;
  }
  return data;
}

describe('diagnostics recorder', () => {
  it('is completely inert unless explicitly enabled', () => {
    // This is what production ships. It must retain nothing at all.
    const recorder = createDiagnosticsRecorder();
    expect(recorder.enabled).toBe(false);
    recorder.record(solidFrame([1, 2, 3]), { state: 'FINGERS' }, {});
    expect(recorder.last()).toBeNull();
    expect(recorder.all()).toEqual([]);
    expect(recorder.toFixture()).toBeNull();
  });

  it('copies frames rather than retaining the pipeline buffer', () => {
    // The pipeline reuses buffers between frames, so holding the reference
    // would leave every entry pointing at the same mutated pixels.
    const recorder = createDiagnosticsRecorder({ enabled: true });
    const frame = solidFrame([10, 20, 30]);
    recorder.record(frame, { state: 'FINGERS' }, { width: SIZE, height: SIZE });
    frame.fill(0);
    expect(recorder.last().frame[0]).toBe(10);
  });

  it('retains only the most recent frames', () => {
    const recorder = createDiagnosticsRecorder({ enabled: true, capacity: 3 });
    for (let index = 0; index < 7; index += 1) {
      recorder.record(solidFrame([index, 0, 0]), { raisedFingerCount: index }, {});
    }
    expect(recorder.all()).toHaveLength(3);
    expect(recorder.last().result.raisedFingerCount).toBe(6);
  });

  it('clears on request', () => {
    const recorder = createDiagnosticsRecorder({ enabled: true });
    recorder.record(solidFrame([1, 1, 1]), {}, {});
    recorder.clear();
    expect(recorder.last()).toBeNull();
  });
});

describe('fixture round-trip', () => {
  it('encodes and decodes bytes losslessly at every length remainder', () => {
    // Base64 pads differently for each length mod 3; all three must survive.
    for (const length of [0, 1, 2, 3, 4, 5, 255, 256, 257]) {
      const bytes = new Uint8ClampedArray(length);
      for (let index = 0; index < length; index += 1) bytes[index] = (index * 7) % 256;
      expect([...decodeBytes(encodeBytes(bytes))]).toEqual([...bytes]);
    }
  });

  it('REGRESSION a captured frame replays through the pipeline to the same result', () => {
    // The whole point of the recorder: a real-camera misread must be
    // reproducible as a deterministic fixture, so a fix can be driven by what
    // the camera actually saw rather than by a silhouette I imagined.
    const background = [35, 70, 135];
    const skin = [190, 125, 88];
    const paint = (frame, x, y, w, h) => {
      for (let row = y; row < y + h; row += 1) {
        for (let col = x; col < x + w; col += 1) {
          const offset = (row * SIZE + col) * 4;
          frame[offset] = skin[0];
          frame[offset + 1] = skin[1];
          frame[offset + 2] = skin[2];
        }
      }
    };
    const handFrame = () => {
      const frame = solidFrame(background);
      paint(frame, 19, 29, 27, 24); // palm
      paint(frame, 27, 49, 10, 15); // wrist to the bottom edge
      paint(frame, 26, 8, 4, 23); // finger
      paint(frame, 32, 7, 4, 24); // finger
      return frame;
    };

    const calibration = buildSkinCalibration(
      Array.from({ length: 5 }, handFrame),
      buildBackgroundReference(
        Array.from({ length: 5 }, () => solidFrame(background)),
        SIZE,
        SIZE,
      ),
      SIZE,
      SIZE,
    );

    const live = handFrame();
    const original = createGeometricPipeline({ calibration }).analyze(live);

    const recorder = createDiagnosticsRecorder({ enabled: true });
    recorder.record(live, original, { width: SIZE, height: SIZE });
    const fixture = recorder.toFixture();

    // Survives serialisation, which is how it would reach a test file.
    const revived = fixtureToFrame(JSON.parse(JSON.stringify(fixture)));
    const replayed = createGeometricPipeline({ calibration }).analyze(revived);

    expect([...revived]).toEqual([...live]);
    expect(replayed.state).toBe(original.state);
    expect(replayed.raisedFingerCount).toBe(original.raisedFingerCount);
  });

  it('rejects a fixture whose pixel count contradicts its dimensions', () => {
    expect(() =>
      fixtureToFrame({
        width: 64,
        height: 64,
        frameBase64: encodeBytes(new Uint8ClampedArray(8)),
      }),
    ).toThrow(/needs/i);
  });

  it('returns null for a fixture with no frame', () => {
    expect(fixtureToFrame(null)).toBeNull();
    expect(fixtureToFrame({})).toBeNull();
  });
});

describe('confidence configuration invariants', () => {
  it('evidence weights sum to exactly one', () => {
    // Confidence gates every submission twice -- at the pipeline floor and at
    // the stability filter's. If the weights stop summing to 1 the whole scale
    // silently shifts and both thresholds start meaning something else.
    const total = Object.values(CONFIDENCE_CONFIG.weights).reduce(
      (sum, weight) => sum + weight,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it('keeps every confidence parameter in a usable range', () => {
    for (const [name, value] of Object.entries(CONFIDENCE_CONFIG.weights)) {
      expect(value, `weight ${name}`).toBeGreaterThan(0);
      expect(value, `weight ${name}`).toBeLessThan(1);
    }
    expect(CONFIDENCE_CONFIG.minimumReportable).toBeGreaterThan(0);
    expect(CONFIDENCE_CONFIG.minimumReportable).toBeLessThan(1);
    expect(CONFIDENCE_CONFIG.palmRadiusMin).toBeLessThan(CONFIDENCE_CONFIG.palmRadiusMax);
  });
});
