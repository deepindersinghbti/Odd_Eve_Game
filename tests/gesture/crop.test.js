import { describe, expect, it, vi } from 'vitest';

import { drawMirroredGuideCrop, getCenteredSquareCrop } from '../../src/gesture/index.js';

describe('square mirrored preprocessing crop', () => {
  it('centers a square within a landscape video', () => {
    expect(getCenteredSquareCrop({ videoWidth: 640, videoHeight: 480 })).toEqual({
      sourceX: 80,
      sourceY: 0,
      sourceSize: 480,
    });
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
    expect(drawMirroredGuideCrop(video, canvas, 224)).toBe(true);
    expect(context.translate).toHaveBeenCalledWith(224, 0);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledWith(
      video,
      0,
      80,
      480,
      480,
      0,
      0,
      224,
      224,
    );
  });
});
