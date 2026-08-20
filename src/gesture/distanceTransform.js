const ORTHOGONAL_COST = 3;
const DIAGONAL_COST = 4;

// Two-pass 3-4 chamfer distance transform. Distances are in chamfer units:
// divide by ORTHOGONAL_COST for pixels. The approximation error against true
// Euclidean distance is under ~5% for the blob sizes used here.
//
// Pixels OUTSIDE the ROI count as unknown, not as background. Seeding the
// border as background (the previous behaviour) pinched the distance of any
// blob running off the guide box, so an identical hand reported a smaller palm
// radius purely for sitting lower in the frame -- and palm radius is the
// normaliser for every finger-length measurement. The wrist-entry rule makes
// that worse by design, since it asks the player to place their hand low.
export function distanceTransform(mask, width, height) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError('Mask dimensions do not match its buffer.');
  }
  const distances = new Uint16Array(mask.length);
  // Bounded ceiling rather than a true infinity, so a pathological all-
  // foreground mask yields a large-but-finite radius that the palm validity
  // checks can reject, instead of NaN/overflow leaking downstream.
  const ceiling = Math.min(0xffff, Math.min(width, height) * ORTHOGONAL_COST);
  for (let index = 0; index < mask.length; index += 1) {
    distances[index] = mask[index] ? ceiling : 0;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let best = distances[index];
      if (x > 0) best = Math.min(best, distances[index - 1] + ORTHOGONAL_COST);
      if (y > 0) best = Math.min(best, distances[index - width] + ORTHOGONAL_COST);
      if (x > 0 && y > 0) {
        best = Math.min(best, distances[index - width - 1] + DIAGONAL_COST);
      }
      if (x + 1 < width && y > 0) {
        best = Math.min(best, distances[index - width + 1] + DIAGONAL_COST);
      }
      distances[index] = best;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let best = distances[index];
      if (x + 1 < width) best = Math.min(best, distances[index + 1] + ORTHOGONAL_COST);
      if (y + 1 < height) {
        best = Math.min(best, distances[index + width] + ORTHOGONAL_COST);
      }
      if (x + 1 < width && y + 1 < height) {
        best = Math.min(best, distances[index + width + 1] + DIAGONAL_COST);
      }
      if (x > 0 && y + 1 < height) {
        best = Math.min(best, distances[index + width - 1] + DIAGONAL_COST);
      }
      distances[index] = best;
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
