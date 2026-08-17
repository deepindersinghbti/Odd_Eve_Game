import { DATASET_SCHEMA_VERSION, GESTURE_LABEL_LIST, MODEL_CONFIG } from './constants.js';
import { GESTURE_ERROR_CODES, GestureError } from './errors.js';

function invalid(message) {
  throw new GestureError(GESTURE_ERROR_CODES.INVALID_DATASET, message);
}

function parseDocument(input) {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    invalid('The classifier dataset is not valid JSON.');
  }
}

export async function serializeClassifierDataset(classifierDataset) {
  const classes = {};
  for (const label of GESTURE_LABEL_LIST) {
    const tensor = classifierDataset[label];
    if (!tensor) continue;
    classes[label] = {
      shape: [...tensor.shape],
      dtype: tensor.dtype,
      data: Array.from(await tensor.data()),
    };
  }
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    featureExtractor: { ...MODEL_CONFIG },
    classes,
  };
}

export function deserializeClassifierDataset(
  input,
  tf,
  { requireAllClasses = false } = {},
) {
  const document = parseDocument(input);
  if (!document || typeof document !== 'object') invalid('Dataset must be an object.');
  if (document.schemaVersion !== DATASET_SCHEMA_VERSION) {
    invalid(`Unsupported dataset schema: ${String(document.schemaVersion)}.`);
  }
  if (
    document.featureExtractor?.name !== MODEL_CONFIG.name ||
    document.featureExtractor?.alpha !== MODEL_CONFIG.alpha ||
    document.featureExtractor?.embeddingSize !== MODEL_CONFIG.embeddingSize
  ) {
    invalid('Dataset feature extractor does not match the bundled MobileNet model.');
  }
  if (!document.classes || typeof document.classes !== 'object') {
    invalid('Dataset classes are missing.');
  }

  const unknown = Object.keys(document.classes).filter(
    (label) => !GESTURE_LABEL_LIST.includes(label),
  );
  if (unknown.length) invalid(`Unknown dataset label: ${unknown[0]}.`);

  const tensors = {};
  try {
    for (const label of GESTURE_LABEL_LIST) {
      const entry = document.classes[label];
      if (!entry) {
        if (requireAllClasses) invalid(`Dataset is missing ${label} samples.`);
        continue;
      }
      if (
        entry.dtype !== 'float32' ||
        !Array.isArray(entry.shape) ||
        entry.shape.length !== 2 ||
        !Number.isInteger(entry.shape[0]) ||
        entry.shape[0] < 1 ||
        entry.shape[1] !== MODEL_CONFIG.embeddingSize ||
        !Array.isArray(entry.data) ||
        entry.data.length !== entry.shape[0] * entry.shape[1] ||
        entry.data.some((value) => !Number.isFinite(value))
      ) {
        invalid(`Dataset tensor for ${label} is invalid.`);
      }
      tensors[label] = tf.tensor(entry.data, entry.shape, entry.dtype);
    }
    return tensors;
  } catch (error) {
    Object.values(tensors).forEach((tensor) => tensor.dispose());
    throw error;
  }
}

export function createDatasetMetadata({ counts, validation = null, notes = '' }) {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    calibrated: GESTURE_LABEL_LIST.every((label) => (counts[label] ?? 0) > 0),
    createdAt: new Date().toISOString(),
    featureExtractor: { ...MODEL_CONFIG },
    sampleCounts: Object.fromEntries(
      GESTURE_LABEL_LIST.map((label) => [label, counts[label] ?? 0]),
    ),
    validation,
    notes,
  };
}
