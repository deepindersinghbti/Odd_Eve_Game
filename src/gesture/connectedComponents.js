const NEIGHBOURS = Object.freeze([
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]);

// Labels every 8-connected component and returns them all, largest first, each
// with its own mask and metrics.
//
// Returning ALL components (rather than only the biggest) is essential for
// telling a hand from a face: both are skin-coloured blobs, and a face is
// frequently the LARGER of the two. Keeping only the largest silently discards
// the hand before any hand-plausibility test can run. Selection is the caller's
// job -- see selectHandComponent in handPresence.js.
export function findComponents(mask, width, height, { maximumMasks = 4 } = {}) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError('Mask dimensions do not match its buffer.');
  }

  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  let foregroundArea = 0;

  for (const value of mask) foregroundArea += value ? 1 : 0;

  // Wrist entry is measured against a BAND at the bottom of the ROI, not the
  // single last pixel row: 3x3 morphology never writes the outermost row, so
  // an exact-last-row test can never be satisfied after cleanMask, and real
  // segmentation regularly drops a row or two at the frame edge anyway.
  const bottomBandStart = height - Math.max(2, Math.round(height * 0.04));

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let borderContacts = 0;
    let bottomBandContacts = 0;
    const borderSides = { top: 0, right: 0, bottom: 0, left: 0 };
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        borderContacts += 1;
      }
      if (y === 0) borderSides.top += 1;
      if (x === width - 1) borderSides.right += 1;
      if (y === height - 1) borderSides.bottom += 1;
      if (x === 0) borderSides.left += 1;
      if (y >= bottomBandStart) bottomBandContacts += 1;

      for (const [offsetX, offsetY] of NEIGHBOURS) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    components.push({
      indices: Int32Array.from(queue.subarray(0, tail)),
      area,
      bounds: { minX, minY, maxX, maxY },
      centroid: { x: sumX / area, y: sumY / area },
      borderContacts,
      borderSides,
      bottomBandContacts,
    });
  }

  components.sort((first, second) => second.area - first.area);

  // Only the largest few components can plausibly be the hand, and building a
  // full-size mask per component is the expensive part -- cap it so a noisy
  // frame with hundreds of specks stays linear and allocation-light.
  return components.slice(0, maximumMasks).map((component) => {
    const boundsWidth = component.bounds.maxX - component.bounds.minX + 1;
    const boundsHeight = component.bounds.maxY - component.bounds.minY + 1;
    const componentMask = new Uint8Array(mask.length);
    for (const index of component.indices) componentMask[index] = 1;
    return {
      ...component,
      mask: componentMask,
      fillRatio: component.area / (boundsWidth * boundsHeight),
      foregroundShare: foregroundArea ? component.area / foregroundArea : 0,
      areaRatio: component.area / mask.length,
      boundsWidth,
      boundsHeight,
    };
  });
}

export function findLargestComponent(mask, width, height) {
  const components = findComponents(mask, width, height, { maximumMasks: 1 });
  return components.length ? components[0] : null;
}
