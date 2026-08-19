import { describe, expect, it, vi } from 'vitest';

import {
  GUIDE_BOX,
  drawMirroredGuideCrop,
  getCenteredSquareCrop,
  getGuideBoxCrop,
} from '../../src/gesture/index.js';

describe('square mirrored preprocessing crop', () => {
  it('centers a square within a landscape video', () => {
    expect(getCenteredSquareCrop({ videoWidth: 640, videoHeight: 480 })).toEqual({
      sourceX: 80,
      sourceY: 0,
      sourceSize: 480,
    });
  });

  it('derives the guide-box crop from the shared GUIDE_BOX definition', () => {
    const crop = getGuideBoxCrop({ videoWidth: 640, videoHeight: 480 });
    const expectedSize = Math.round(480 * GUIDE_BOX.sizeRatio);
    expect(crop.sourceSize).toBe(expectedSize);
    expect(crop.sourceX).toBe(
      Math.round(640 * GUIDE_BOX.centerXRatio - expectedSize / 2),
    );
    expect(crop.sourceY).toBe(
      Math.round(480 * GUIDE_BOX.centerYRatio - expectedSize / 2),
    );
  });

  it('analyzes a strict subregion that excludes the upper-centre of the frame', () => {
    // Faces sit high and centred; the guide box must not reach them, which is
    // what stops a face being segmented as the hand in the first place.
    const videoWidth = 640;
    const videoHeight = 480;
    const crop = getGuideBoxCrop({ videoWidth, videoHeight });
    expect(crop.sourceSize).toBeLessThan(Math.min(videoWidth, videoHeight));
    // The top of the guide box sits below the upper third of the frame.
    expect(crop.sourceY).toBeGreaterThan(videoHeight / 3);
  });

  it('keeps the guide box inside the frame for extreme aspect ratios', () => {
    for (const video of [
      { videoWidth: 1920, videoHeight: 480 },
      { videoWidth: 320, videoHeight: 1200 },
      { videoWidth: 200, videoHeight: 200 },
    ]) {
      const crop = getGuideBoxCrop(video);
      expect(crop.sourceX).toBeGreaterThanOrEqual(0);
      expect(crop.sourceY).toBeGreaterThanOrEqual(0);
      expect(crop.sourceX + crop.sourceSize).toBeLessThanOrEqual(video.videoWidth);
      expect(crop.sourceY + crop.sourceSize).toBeLessThanOrEqual(video.videoHeight);
    }
  });

  it('returns null without a usable video frame', () => {
    expect(getGuideBoxCrop({ videoWidth: 0, videoHeight: 0 })).toBeNull();
    expect(getGuideBoxCrop(undefined)).toBeNull();
  });

  it('uses the same mirrored transform for every crop', () => {
    const context = {
      save: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    const video = { videoWidth: 480, videoHeight: 640 };
    const crop = getGuideBoxCrop(video);
    expect(drawMirroredGuideCrop(video, canvas, 224)).toBe(true);
    expect(context.translate).toHaveBeenCalledWith(224, 0);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledWith(
      video,
      crop.sourceX,
      crop.sourceY,
      crop.sourceSize,
      crop.sourceSize,
      0,
      0,
      224,
      224,
    );
  });
});
