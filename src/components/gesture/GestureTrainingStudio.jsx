import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GESTURE_LABEL_LIST,
  attachCameraStream,
  createDatasetMetadata,
  createGestureClassifier,
  deserializeClassifierDataset,
  drawMirroredGuideCrop,
  loadLocalFeatureExtractor,
  requestCameraStream,
  serializeClassifierDataset,
  stopCameraStream,
} from '../../gesture/index.js';
import GestureGuide from './GestureGuide.jsx';

const emptyCounts = () =>
  Object.fromEntries(GESTURE_LABEL_LIST.map((label) => [label, 0]));
const emptyMatrix = () =>
  Object.fromEntries(
    GESTURE_LABEL_LIST.map((actual) => [
      actual,
      Object.fromEntries(GESTURE_LABEL_LIST.map((predicted) => [predicted, 0])),
    ]),
  );

function downloadJson(filename, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function GestureTrainingStudio() {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const streamRef = useRef(null);
  const featureRef = useRef(null);
  const classifierRef = useRef(null);
  const captureTimerRef = useRef(null);
  const captureBusyRef = useRef(false);
  const [status, setStatus] = useState('IDLE');
  const [selectedLabel, setSelectedLabel] = useState(GESTURE_LABEL_LIST[0]);
  const [counts, setCounts] = useState(emptyCounts);
  const [capturing, setCapturing] = useState(false);
  const [matrix, setMatrix] = useState(emptyMatrix);
  const [error, setError] = useState(null);

  const stopContinuousCapture = useCallback(() => {
    if (captureTimerRef.current !== null) clearInterval(captureTimerRef.current);
    captureTimerRef.current = null;
    setCapturing(false);
  }, []);

  const stopStudio = useCallback(() => {
    stopContinuousCapture();
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    classifierRef.current?.dispose();
    classifierRef.current = null;
    featureRef.current?.dispose();
    featureRef.current = null;
    setStatus('IDLE');
  }, [stopContinuousCapture]);

  useEffect(() => stopStudio, [stopStudio]);

  const startStudio = async () => {
    setStatus('LOADING');
    setError(null);
    try {
      const stream = await requestCameraStream();
      streamRef.current = stream;
      await attachCameraStream(videoRef.current, stream);
      const [feature, classifier] = await Promise.all([
        loadLocalFeatureExtractor(),
        createGestureClassifier(),
      ]);
      featureRef.current = feature;
      classifierRef.current = classifier;
      setCounts(classifier.getCounts());
      setStatus('READY');
    } catch (caught) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      setError(caught.message);
      setStatus('ERROR');
    }
  };

  const getEmbedding = () => {
    if (
      !featureRef.current ||
      !drawMirroredGuideCrop(videoRef.current, canvasRef.current)
    ) {
      throw new Error('Wait for a visible camera frame.');
    }
    return featureRef.current.infer(canvasRef.current);
  };

  const captureTrainingExample = useCallback(async () => {
    if (captureBusyRef.current || !classifierRef.current) return;
    captureBusyRef.current = true;
    let embedding;
    try {
      embedding = getEmbedding();
      classifierRef.current.addExample(selectedLabel, embedding);
      setCounts(classifierRef.current.getCounts());
      setError(null);
    } catch (caught) {
      setError(caught.message);
      stopContinuousCapture();
    } finally {
      embedding?.dispose();
      captureBusyRef.current = false;
    }
  }, [selectedLabel, stopContinuousCapture]);

  const startContinuousCapture = () => {
    if (capturing) return;
    setCapturing(true);
    void captureTrainingExample();
    captureTimerRef.current = setInterval(() => {
      void captureTrainingExample();
    }, 180);
  };

  const clearSelectedClass = () => {
    stopContinuousCapture();
    classifierRef.current?.clearClass(selectedLabel);
    setCounts(classifierRef.current?.getCounts() ?? emptyCounts());
  };

  const captureValidation = async () => {
    let embedding;
    try {
      embedding = getEmbedding();
      const prediction = await classifierRef.current.predict(embedding);
      setMatrix((current) => ({
        ...current,
        [selectedLabel]: {
          ...current[selectedLabel],
          [prediction.label]: current[selectedLabel][prediction.label] + 1,
        },
      }));
      setError(null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      embedding?.dispose();
    }
  };

  const exportDataset = async () => {
    const dataset = await serializeClassifierDataset(classifierRef.current.getDataset());
    const validation = {
      confusionMatrix: matrix,
      perClassAccuracy: Object.fromEntries(
        GESTURE_LABEL_LIST.map((label) => {
          const total = Object.values(matrix[label]).reduce(
            (sum, value) => sum + value,
            0,
          );
          return [label, total ? matrix[label][label] / total : null];
        }),
      ),
    };
    downloadJson('dataset.json', dataset);
    downloadJson(
      'metadata.json',
      createDatasetMetadata({ counts, validation, notes: 'Exported locally.' }),
    );
  };

  const importDataset = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !featureRef.current || !classifierRef.current) return;
    try {
      const tensors = deserializeClassifierDataset(
        await file.text(),
        featureRef.current.tf,
      );
      classifierRef.current.replaceDataset(tensors);
      setCounts(classifierRef.current.getCounts());
      setError(null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <main className="training-studio" aria-labelledby="training-title">
      <div>
        <p className="eyebrow">Development only</p>
        <h1 id="training-title">Gesture calibration studio</h1>
        <p>Frames stay local. Training stores MobileNet embeddings, not raw images.</p>
      </div>
      <section className="training-studio__workspace surface-card">
        <GestureGuide ref={videoRef} hidden={status !== 'READY'} />
        {status === 'IDLE' && (
          <button className="button button--primary" type="button" onClick={startStudio}>
            Start camera and local model
          </button>
        )}
        {status === 'LOADING' && <p role="status">Loading camera and local MobileNet…</p>}
        {status === 'ERROR' && <p role="alert">{error}</p>}
        {status === 'READY' && (
          <div className="training-studio__controls">
            <fieldset disabled={capturing}>
              <legend>Label to capture</legend>
              {GESTURE_LABEL_LIST.map((label) => (
                <label key={label}>
                  <input
                    type="radio"
                    name="training-label"
                    checked={selectedLabel === label}
                    onChange={() => setSelectedLabel(label)}
                  />
                  {label} ({counts[label]})
                </label>
              ))}
            </fieldset>
            <div className="training-studio__actions">
              <button
                className="button button--primary"
                type="button"
                onClick={captureTrainingExample}
              >
                Capture one embedding
              </button>
              {!capturing ? (
                <button
                  className="button button--quiet-dark"
                  type="button"
                  onClick={startContinuousCapture}
                >
                  Start controlled capture
                </button>
              ) : (
                <button
                  className="button button--danger"
                  type="button"
                  onClick={stopContinuousCapture}
                >
                  Stop capture
                </button>
              )}
              <button
                className="button button--quiet-dark"
                type="button"
                onClick={clearSelectedClass}
              >
                Delete selected class
              </button>
              <button
                className="button button--quiet-dark"
                type="button"
                onClick={captureValidation}
              >
                Add held-out validation sample
              </button>
              <label className="button button--quiet-dark training-studio__import">
                Import dataset
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={importDataset}
                />
              </label>
              <button
                className="button button--primary"
                type="button"
                onClick={exportDataset}
              >
                Export dataset + metadata
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        )}
      </section>
      <section
        className="training-studio__validation surface-card"
        aria-labelledby="validation-title"
      >
        <h2 id="validation-title">Held-out confusion matrix</h2>
        <div className="training-studio__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Actual ↓ / Predicted →</th>
                {GESTURE_LABEL_LIST.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GESTURE_LABEL_LIST.map((actual) => (
                <tr key={actual}>
                  <th>{actual}</th>
                  {GESTURE_LABEL_LIST.map((predicted) => (
                    <td key={predicted}>{matrix[actual][predicted]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
