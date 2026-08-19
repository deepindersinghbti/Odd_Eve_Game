export function rgbToYCbCr(red, green, blue) {
  return {
    y: 0.299 * red + 0.587 * green + 0.114 * blue,
    cb: 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue,
    cr: 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue,
  };
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function medianAbsoluteDeviation(values, centre = median(values)) {
  if (!values.length || centre === null) return null;
  return median(values.map((value) => Math.abs(value - centre)));
}

export function percentile(values, fraction) {
  if (!values.length) return null;
  if (!(fraction >= 0 && fraction <= 1)) {
    throw new RangeError('Percentile fraction must be between zero and one.');
  }
  const sorted = [...values].sort((first, second) => first - second);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
