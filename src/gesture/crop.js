import { MODEL_CONFIG } from './constants.js';

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
  outputSize = MODEL_CONFIG.inputSize,
) {
  const crop = getCenteredSquareCrop(video);
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
