import { describe, expect, it, vi } from 'vitest';

import {
  CAMERA_STATUS,
  GESTURE_LABELS,
  RECOGNIZER_STATUS,
  createGestureRecognizer,
} from '../../src/gesture/index.js';

function createVideoAndCanvas() {
  const context = {
    save: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
  };
  return {
    video: {
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn().mockResolvedValue(),
      srcObject: null,
    },
    canvas: { width: 0, height: 0, getContext: () => context },
  };
}

function createRecognizerHarness(overrides = {}) {
  const { video, canvas } = createVideoAndCanvas();
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  const featureExtractor = {
    infer: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
  };
  const classifier = { predict: vi.fn(), dispose: vi.fn() };
  const loops = [];
  const loopFactory = vi.fn((options) => {
    const loop = {
      options,
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    };
    loops.push(loop);
    return loop;
  });
  let now = 0;
  let eligible = true;
  const onSubmit = vi.fn(() => true);
  const states = [];
  const recognizer = createGestureRecognizer({
    video,
    canvas,
    mediaDevices: { getUserMedia },
    runtimeLoader:
      overrides.runtimeLoader ??
      vi.fn().mockResolvedValue({ featureExtractor, classifier }),
    loopFactory,
    clock: () => now,
    isEligible: () => eligible,
    onSubmit,
    onStateChange: (state) => states.push(state),
  });
  return {
    recognizer,
    video,
    track,
    getUserMedia,
    featureExtractor,
    classifier,
    loops,
    onSubmit,
    states,
    setNow(value) {
      now = value;
    },
    setEligible(value) {
      eligible = value;
    },
  };
}

describe('gesture recognizer orchestration', () => {
  it('does not request camera access before explicit enable', () => {
    const harness = createRecognizerHarness();
    expect(harness.getUserMedia).not.toHaveBeenCalled();
    expect(harness.recognizer.getState().status).toBe(RECOGNIZER_STATUS.DISABLED);
  });

  it('loads after permission and starts only when active', async () => {
    const harness = createRecognizerHarness();
    harness.recognizer.setActive(true);
    await expect(harness.recognizer.enable()).resolves.toBe(true);
    expect(harness.getUserMedia).toHaveBeenCalledOnce();
    expect(harness.video.srcObject).not.toBeNull();
    expect(harness.recognizer.getState()).toMatchObject({
      status: RECOGNIZER_STATUS.READY,
      cameraStatus: CAMERA_STATUS.GRANTED,
    });
    expect(harness.loops[0].start).toHaveBeenCalledOnce();
  });

  it('releases tracks and model tensors on disable and destroy', async () => {
    const harness = createRecognizerHarness();
    await harness.recognizer.enable();
    harness.recognizer.disable();
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.featureExtractor.dispose).toHaveBeenCalledOnce();
    expect(harness.classifier.dispose).toHaveBeenCalledOnce();
    expect(harness.video.srcObject).toBeNull();
    harness.recognizer.destroy();
    expect(harness.track.stop).toHaveBeenCalledOnce();
  });

  it('rebinds the active stream when React replaces the preview element', async () => {
    const harness = createRecognizerHarness();
    const nextVideo = {
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn().mockResolvedValue(),
      srcObject: null,
    };
    harness.recognizer.setActive(true);
    await harness.recognizer.enable();

    await harness.recognizer.setVideo(null);
    expect(harness.video.srcObject).toBeNull();
    expect(harness.track.stop).not.toHaveBeenCalled();
    expect(harness.loops[0].stop).toHaveBeenCalledOnce();

    await expect(harness.recognizer.setVideo(nextVideo)).resolves.toBe(true);
    expect(nextVideo.srcObject).not.toBeNull();
    expect(nextVideo.play).toHaveBeenCalledOnce();
    expect(harness.loops[0].start).toHaveBeenCalledTimes(2);
    expect(harness.track.stop).not.toHaveBeenCalled();
  });

  it('offers a safe error state and releases the camera when model loading fails', async () => {
    const harness = createRecognizerHarness({
      runtimeLoader: vi.fn().mockRejectedValue(new Error('corrupt local model')),
    });
    await expect(harness.recognizer.enable()).resolves.toBe(false);
    expect(harness.recognizer.getState()).toMatchObject({
      status: RECOGNIZER_STATUS.ERROR,
      cameraStatus: CAMERA_STATUS.ERROR,
      error: { message: expect.stringMatching(/Use buttons/i) },
    });
    expect(harness.track.stop).toHaveBeenCalledOnce();
  });

  it('submits one stable prediction and requires hand removal', async () => {
    const harness = createRecognizerHarness();
    harness.recognizer.setActive(true);
    await harness.recognizer.enable();
    const { onPrediction } = harness.loops[0].options;
    for (let index = 0; index < 10; index += 1) {
      harness.setNow(index * 100);
      onPrediction({ label: GESTURE_LABELS.FOUR, confidence: 0.95 });
    }
    expect(harness.onSubmit).toHaveBeenCalledOnce();
    expect(harness.onSubmit).toHaveBeenCalledWith(4, GESTURE_LABELS.FOUR);
    for (let index = 10; index < 30; index += 1) {
      harness.setNow(index * 100);
      onPrediction({ label: GESTURE_LABELS.FOUR, confidence: 0.95 });
    }
    expect(harness.onSubmit).toHaveBeenCalledOnce();
    harness.setNow(3000);
    onPrediction({ label: GESTURE_LABELS.NO_HAND, confidence: 0.95 });
    expect(harness.recognizer.getState().lastSubmittedValue).toBeNull();
  });

  it('ignores stable predictions whenever the controller is ineligible', async () => {
    const harness = createRecognizerHarness();
    harness.recognizer.setActive(true);
    await harness.recognizer.enable();
    harness.setEligible(false);
    for (let index = 0; index < 12; index += 1) {
      harness.setNow(index * 100);
      harness.loops[0].options.onPrediction({
        label: GESTURE_LABELS.ONE,
        confidence: 1,
      });
    }
    expect(harness.onSubmit).not.toHaveBeenCalled();
  });

  it('disposes the embedding after every prediction', async () => {
    const harness = createRecognizerHarness();
    const dispose = vi.fn();
    harness.featureExtractor.infer.mockReturnValue({ dispose });
    harness.classifier.predict.mockResolvedValue({
      label: GESTURE_LABELS.NO_HAND,
      confidence: 1,
    });
    await harness.recognizer.enable();
    for (let index = 0; index < 50; index += 1) {
      await harness.loops[0].options.predict();
    }
    expect(dispose).toHaveBeenCalledTimes(50);
  });
});
