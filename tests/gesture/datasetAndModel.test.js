import * as tf from '@tensorflow/tfjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  GESTURE_LABELS,
  GESTURE_LABEL_LIST,
  MODEL_ASSET_PATHS,
  MODEL_CONFIG,
  assertLocalAssetUrl,
  createGestureClassifier,
  deserializeClassifierDataset,
  serializeClassifierDataset,
} from '../../src/gesture/index.js';

function datasetDocument(classes) {
  return {
    schemaVersion: 1,
    featureExtractor: { ...MODEL_CONFIG },
    classes,
  };
}

describe('local model and classifier dataset', () => {
  beforeAll(async () => {
    await tf.setBackend('cpu');
    await tf.ready();
  });

  afterAll(() => tf.disposeVariables());

  it('uses only local runtime asset paths', () => {
    Object.values(MODEL_ASSET_PATHS).forEach((path) => {
      expect(assertLocalAssetUrl(path)).toBe(path);
      expect(path).toMatch(/^\/assets\//);
    });
    expect(() => assertLocalAssetUrl('https://example.com/model.json')).toThrow(
      /External model URLs/,
    );
  });

  it('round-trips label, shape, dtype, and numeric embedding data', async () => {
    const source = {
      [GESTURE_LABELS.ONE]: tf.tensor(
        Array(MODEL_CONFIG.embeddingSize).fill(0.25),
        [1, MODEL_CONFIG.embeddingSize],
        'float32',
      ),
    };
    const serialized = await serializeClassifierDataset(source);
    expect(serialized.classes.ONE).toMatchObject({
      shape: [1, MODEL_CONFIG.embeddingSize],
      dtype: 'float32',
    });
    const restored = deserializeClassifierDataset(serialized, tf);
    expect(await restored.ONE.data()).toEqual(await source.ONE.data());
    source.ONE.dispose();
    restored.ONE.dispose();
  });

  it.each([
    [
      'unknown label',
      datasetDocument({
        PALM: { shape: [1, 256], dtype: 'float32', data: Array(256).fill(0) },
      }),
    ],
    [
      'wrong shape',
      datasetDocument({
        ONE: { shape: [1, 255], dtype: 'float32', data: Array(255).fill(0) },
      }),
    ],
    [
      'wrong dtype',
      datasetDocument({
        ONE: { shape: [1, 256], dtype: 'int32', data: Array(256).fill(0) },
      }),
    ],
    [
      'non-finite data',
      datasetDocument({
        ONE: { shape: [1, 256], dtype: 'float32', data: [...Array(255).fill(0), null] },
      }),
    ],
  ])('rejects a corrupt import: %s', (_name, document) => {
    expect(() => deserializeClassifierDataset(document, tf)).toThrow();
  });

  it('requires all seven classes for the runtime dataset', () => {
    expect(() =>
      deserializeClassifierDataset(datasetDocument({}), tf, { requireAllClasses: true }),
    ).toThrow(/NO_HAND/);
  });

  it('classifies closed-fist embeddings as SIX and keeps tensor count stable', async () => {
    const classifier = await createGestureClassifier();
    for (const [index, label] of GESTURE_LABEL_LIST.entries()) {
      const embedding = tf
        .oneHot(index, MODEL_CONFIG.embeddingSize)
        .toFloat()
        .reshape([1, MODEL_CONFIG.embeddingSize]);
      classifier.addExample(label, embedding);
      embedding.dispose();
    }
    const fist = tf
      .oneHot(6, MODEL_CONFIG.embeddingSize)
      .toFloat()
      .reshape([1, MODEL_CONFIG.embeddingSize]);
    expect(await classifier.predict(fist, 1)).toMatchObject({
      label: GESTURE_LABELS.SIX,
      confidence: 1,
    });
    const stableCount = tf.memory().numTensors;
    for (let index = 0; index < 100; index += 1) {
      await classifier.predict(fist, 1);
    }
    expect(tf.memory().numTensors).toBe(stableCount);
    fist.dispose();
    classifier.dispose();
  });
});
