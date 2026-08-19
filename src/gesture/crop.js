import { GEOMETRIC_RECOGNITION_CONFIG, GUIDE_BOX } from './constants.js';

// The guide box in SOURCE VIDEO pixel coordinates. Derived from the single
// GUIDE_BOX definition so the analyzed crop and the on-screen overlay cannot
// diverge. Clamped so the box always stays inside the frame even for unusual
// aspect ratios.
export function getGuideBoxCrop(video) {
  const width = Number(video?.videoWidth) || 0;
  const height = Number(video?.videoHeight) || 0;
  if (width <= 0 || height <= 0) return null;

  const shortEdge = Math.min(width, height);
  const size = Math.max(1, Math.round(shortEdge * GUIDE_BOX.sizeRatio));
  const maxX = width - size;
  const maxY = height - size;
  const sourceX = Math.min(
    maxX,
    Math.max(0, Math.round(width * GUIDE_BOX.centerXRatio - size / 2)),
  );
  const sourceY = Math.min(
    maxY,
    Math.max(0, Math.round(height * GUIDE_BOX.centerYRatio - size / 2)),
  );

  return { sourceX, sourceY, sourceSize: size };
}

// Retained for callers that need the legacy full-frame square (and so the
// change in analyzed region is explicit rather than silent).
export function getCenteredSquareCrop(video) {
  const width = Number(video?.videoWidth) || 0;
  const height = Number(video?.videoHeight) || 0;
  const size = Math.min(width, height);
  if (size <= 0) return null;
  return {
    sourceX: Math.floor((width - size) / 2),
    sourceY: Math.floor((height - size) / 2),
    sourceSize: size,
  };
}

export function drawMirroredGuideCrop(
  video,
  canvas,
  outputSize = GEOMETRIC_RECOGNITION_CONFIG.processingSize,
) {
  const crop = getGuideBoxCrop(video);
  const context = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!crop || !context) return false;

  if (canvas.width !== outputSize) canvas.width = outputSize;
  if (canvas.height !== outputSize) canvas.height = outputSize;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, outputSize, outputSize);
  context.translate(outputSize, 0);
  context.scale(-1, 1);
  context.drawImage(
    video,
    crop.sourceX,
    crop.sourceY,
    crop.sourceSize,
    crop.sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  );
  context.restore();
  return true;
}

export function readMirroredGuideFrame(video, canvas, outputSize) {
  if (!drawMirroredGuideCrop(video, canvas, outputSize)) return null;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const image = context?.getImageData?.(0, 0, canvas.width, canvas.height);
  return image?.data ? new Uint8ClampedArray(image.data) : null;
}
