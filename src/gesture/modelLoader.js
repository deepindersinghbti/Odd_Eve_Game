import { MODEL_ASSET_PATHS, MODEL_CONFIG } from './constants.js';
import { GESTURE_ERROR_CODES, GestureError, toGestureError } from './errors.js';

export function assertLocalAssetUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new GestureError(
      GESTURE_ERROR_CODES.MODEL_LOAD_FAILED,
      'A local model path is required.',
    );
  }
  if (/^(?:[a-z]+:)?\/\//i.test(url) || /^data:/i.test(url)) {
    throw new GestureError(
      GESTURE_ERROR_CODES.MODEL_LOAD_FAILED,
      'External model URLs are not allowed.',
    );
  }
  return url;
}

async function loadTensorFlowLayersRuntime() {
  const [core, layers] = await Promise.all([
    import('@tensorflow/tfjs-core'),
    import('@tensorflow/tfjs-layers'),
    import('@tensorflow/tfjs-backend-webgl'),
    import('@tensorflow/tfjs-backend-cpu'),
  ]);
  return {
    ...core,
    loadLayersModel: layers.loadLayersModel,
    model: layers.model,
  };
}

export async function loadLocalFeatureExtractor({
  modelUrl = MODEL_ASSET_PATHS.mobilenet,
  tfModule,
} = {}) {
  assertLocalAssetUrl(modelUrl);
  try {
    const tf = tfModule ?? (await loadTensorFlowLayersRuntime());
    await tf.ready();
    const sourceModel = await tf.loadLayersModel(modelUrl);
    const featureModel = tf.model({
      inputs: sourceModel.inputs,
      outputs: sourceModel.getLayer(MODEL_CONFIG.embeddingLayer).output,
    });
    const warmup = tf.tidy(() => {
      const input = tf.zeros([1, MODEL_CONFIG.inputSize, MODEL_CONFIG.inputSize, 3]);
      return featureModel.predict(input);
    });
    await warmup.data();
    warmup.dispose();
    let disposed = false;

    return {
      tf,
      infer(image) {
        return tf.tidy(() => {
          const pixels = tf.browser.fromPixels(image);
          const resized =
            pixels.shape[0] === MODEL_CONFIG.inputSize &&
            pixels.shape[1] === MODEL_CONFIG.inputSize
              ? pixels
              : tf.image.resizeBilinear(
                  pixels,
                  [MODEL_CONFIG.inputSize, MODEL_CONFIG.inputSize],
                  true,
                );
          const normalized = tf.sub(tf.div(tf.cast(resized, 'float32'), 127.5), 1);
          const batched = tf.reshape(normalized, [
            1,
            MODEL_CONFIG.inputSize,
            MODEL_CONFIG.inputSize,
            3,
          ]);
          return featureModel.predict(batched);
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        try {
          featureModel.dispose();
        } finally {
          sourceModel.dispose();
        }
      },
    };
  } catch (error) {
    throw toGestureError(
      error,
      GESTURE_ERROR_CODES.MODEL_LOAD_FAILED,
      'The local gesture model could not be loaded. Use buttons instead.',
    );
  }
}
