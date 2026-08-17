import { describe, expect, it, vi } from 'vitest';

import {
  CAMERA_STATUS,
  DEFAULT_CAMERA_CONSTRAINTS,
  GESTURE_ERROR_CODES,
  attachCameraStream,
  cameraStatusForError,
  requestCameraStream,
  stopCameraStream,
} from '../../src/gesture/index.js';

describe('camera lifecycle helpers', () => {
  it('does not request permission merely by importing or constructing helpers', () => {
    const getUserMedia = vi.fn();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('requests only video with user-facing desktop constraints', async () => {
    const stream = { getTracks: () => [] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    await expect(requestCameraStream({ mediaDevices: { getUserMedia } })).resolves.toBe(
      stream,
    );
    expect(getUserMedia).toHaveBeenCalledWith(DEFAULT_CAMERA_CONSTRAINTS);
    expect(DEFAULT_CAMERA_CONSTRAINTS.audio).toBe(false);
    expect(DEFAULT_CAMERA_CONSTRAINTS.video.facingMode).toEqual({ ideal: 'user' });
  });

  it('attaches and starts a muted inline preview', async () => {
    const stream = {};
    const video = { play: vi.fn().mockResolvedValue(), srcObject: null };
    await attachCameraStream(video, stream);
    expect(video).toMatchObject({ srcObject: stream, muted: true, playsInline: true });
    expect(video.play).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'NotAllowedError',
      GESTURE_ERROR_CODES.CAMERA_PERMISSION_DENIED,
      CAMERA_STATUS.DENIED,
    ],
    ['NotFoundError', GESTURE_ERROR_CODES.CAMERA_NOT_FOUND, CAMERA_STATUS.MISSING],
    ['NotReadableError', GESTURE_ERROR_CODES.CAMERA_BUSY, CAMERA_STATUS.BUSY],
    ['UnknownError', GESTURE_ERROR_CODES.CAMERA_FAILURE, CAMERA_STATUS.ERROR],
  ])('maps %s into an accessible fallback error', async (name, code, status) => {
    const hostError = Object.assign(new Error(name), { name });
    const getUserMedia = vi.fn().mockRejectedValue(hostError);
    const error = await requestCameraStream({ mediaDevices: { getUserMedia } }).catch(
      (caught) => caught,
    );
    expect(error).toMatchObject({ code });
    expect(cameraStatusForError(error)).toBe(status);
  });

  it('reports a missing media API safely', async () => {
    await expect(requestCameraStream({ mediaDevices: null })).rejects.toMatchObject({
      code: GESTURE_ERROR_CODES.CAMERA_API_MISSING,
    });
  });

  it('stops every media track', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopCameraStream({ getTracks: () => tracks });
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledOnce());
  });
});
