function assertDimensions(mask, width, height) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError('Mask dimensions do not match its buffer.');
  }
}

export function erode3x3(mask, width, height, output = new Uint8Array(mask.length)) {
  assertDimensions(mask, width, height);
  output.fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let keep = 1;
      for (let offsetY = -1; offsetY <= 1 && keep; offsetY += 1) {
        const row = (y + offsetY) * width;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (!mask[row + x + offsetX]) {
            keep = 0;
            break;
          }
        }
      }
      output[y * width + x] = keep;
    }
  }
  return output;
}

export function dilate3x3(mask, width, height, output = new Uint8Array(mask.length)) {
  assertDimensions(mask, width, height);
  output.fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let found = 0;
      for (let offsetY = -1; offsetY <= 1 && !found; offsetY += 1) {
        const row = (y + offsetY) * width;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (mask[row + x + offsetX]) {
            found = 1;
            break;
          }
        }
      }
      output[y * width + x] = found;
    }
  }
  return output;
}

export function openMask(mask, width, height, output = new Uint8Array(mask.length)) {
  const scratch = new Uint8Array(mask.length);
  erode3x3(mask, width, height, scratch);
  return dilate3x3(scratch, width, height, output);
}

export function closeMask(mask, width, height, output = new Uint8Array(mask.length)) {
  const scratch = new Uint8Array(mask.length);
  dilate3x3(mask, width, height, scratch);
  return erode3x3(scratch, width, height, output);
}

export function cleanMask(mask, width, height, output = new Uint8Array(mask.length)) {
  const opened = openMask(mask, width, height);
  return closeMask(opened, width, height, output);
}
