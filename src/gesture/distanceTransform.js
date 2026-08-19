const ORTHOGONAL_COST = 3;
const DIAGONAL_COST = 4;

export function distanceTransform(mask, width, height) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError('Mask dimensions do not match its buffer.');
  }
  const distances = new Uint16Array(mask.length);
  const unreachable = 0xffff;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      distances[index] = Math.min(
        unreachable,
        (x + 1) * ORTHOGONAL_COST,
        (width - x) * ORTHOGONAL_COST,
        (y + 1) * ORTHOGONAL_COST,
        (height - y) * ORTHOGONAL_COST,
      );
      if (x > 0) distances[index] = Math.min(distances[index], distances[index - 1] + 3);
      if (y > 0)
        distances[index] = Math.min(distances[index], distances[index - width] + 3);
      if (x > 0 && y > 0)
        distances[index] = Math.min(
          distances[index],
          distances[index - width - 1] + DIAGONAL_COST,
        );
      if (x + 1 < width && y > 0)
        distances[index] = Math.min(
          distances[index],
          distances[index - width + 1] + DIAGONAL_COST,
        );
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (x + 1 < width)
        distances[index] = Math.min(distances[index], distances[index + 1] + 3);
      if (y + 1 < height)
        distances[index] = Math.min(distances[index], distances[index + width] + 3);
      if (x + 1 < width && y + 1 < height)
        distances[index] = Math.min(
          distances[index],
          distances[index + width + 1] + DIAGONAL_COST,
        );
      if (x > 0 && y + 1 < height)
        distances[index] = Math.min(
          distances[index],
          distances[index + width - 1] + DIAGONAL_COST,
        );
    }
  }
  return distances;
}

export function findPalmGeometry(mask, width, height) {
  const distances = distanceTransform(mask, width, height);
  let bestIndex = -1;
  let bestDistance = 0;
  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index] > bestDistance) {
      bestDistance = distances[index];
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestDistance === 0) return null;
  return {
    center: { x: bestIndex % width, y: Math.floor(bestIndex / width) },
    radius: bestDistance / ORTHOGONAL_COST,
    distances,
  };
}
