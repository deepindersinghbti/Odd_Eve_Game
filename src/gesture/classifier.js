import { GESTURE_LABEL_LIST } from './constants.js';
import { GESTURE_ERROR_CODES, GestureError } from './errors.js';

export async function createGestureClassifier({ knnModule } = {}) {
  const knn = knnModule ?? (await import('@tensorflow-models/knn-classifier'));
  const classifier = knn.create();
  let disposed = false;

  return {
    addExample(label, embedding) {
      if (!GESTURE_LABEL_LIST.includes(label)) {
        throw new GestureError(
          GESTURE_ERROR_CODES.INVALID_DATASET,
          `Unknown gesture label: ${String(label)}`,
        );
      }
      classifier.addExample(embedding, label);
    },
    async predict(embedding, k = 3) {
      if (classifier.getNumClasses() === 0) {
        throw new GestureError(
          GESTURE_ERROR_CODES.MODEL_NOT_CALIBRATED,
          'Gesture calibration data has not been collected yet.',
        );
      }
      const result = await classifier.predictClass(embedding, k);
      return {
        label: result.label,
        confidence: result.confidences[result.label] ?? 0,
        confidences: { ...result.confidences },
      };
    },
    clearClass(label) {
      if ((classifier.getClassExampleCount()[label] ?? 0) > 0) {
        classifier.clearClass(label);
      }
    },
    clearAll() {
      classifier.clearAllClasses();
    },
    getCounts() {
      const counts = classifier.getClassExampleCount();
      return Object.fromEntries(
        GESTURE_LABEL_LIST.map((label) => [label, counts[label] ?? 0]),
      );
    },
    getDataset() {
      return classifier.getClassifierDataset();
    },
    replaceDataset(dataset) {
      classifier.clearAllClasses();
      classifier.setClassifierDataset(dataset);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      classifier.dispose();
    },
  };
}
