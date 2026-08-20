import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CAMERA_STATUS,
  INPUT_METHODS,
  RECOGNIZER_STATUS,
  createGestureRecognizer,
} from '../gesture/index.js';
// Imported from the module directly, not the barrel: this reference sits inside
// an import.meta.env.DEV branch, so the bundler can drop the whole capture and
// export module from production rather than shipping it switched off.
import { createDiagnosticsRecorder } from '../gesture/diagnostics.js';

const disabledState = {
  status: RECOGNIZER_STATUS.DISABLED,
  cameraStatus: CAMERA_STATUS.IDLE,
  rawLabel: null,
  confidence: 0,
  stableLabel: null,
  candidateLabel: null,
  holdProgress: 0,
  cooldown: false,
  error: null,
  lastSubmittedValue: null,
  calibrationStatus: null,
  calibrationProgress: 0,
  detectionState: null,
  raisedFingerCount: null,
};

// Development-only frame capture. Attaches a recorder and exposes it on the
// global object so a developer can inspect or export a misread frame from the
// console. Production takes the other branch entirely: no recorder is created,
// so no camera frame is ever retained.
//
//   __HAND_CRICKET_GESTURE_DEBUG__.last()      -- latest frame + reasoning
//   __HAND_CRICKET_GESTURE_DEBUG__.fixture()   -- serialisable JSON record
//   __HAND_CRICKET_GESTURE_DEBUG__.download()  -- save it (explicit action)
//   __HAND_CRICKET_GESTURE_DEBUG__.clear()     -- drop retained frames
function attachDevelopmentDiagnostics(options) {
  const diagnosticsRecorder = createDiagnosticsRecorder({ enabled: true });
  globalThis.__HAND_CRICKET_GESTURE_DEBUG__ = {
    last: () => diagnosticsRecorder.last(),
    all: () => diagnosticsRecorder.all(),
    clear: () => diagnosticsRecorder.clear(),
    fixture: (index = -1) => diagnosticsRecorder.toFixture(index),
    download(index = -1, filename = 'gesture-fixture.json') {
      const fixture = diagnosticsRecorder.toFixture(index);
      if (!fixture) return false;
      const blob = new globalThis.Blob([JSON.stringify(fixture)], {
        type: 'application/json',
      });
      const url = globalThis.URL.createObjectURL(blob);
      const link = globalThis.document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      globalThis.URL.revokeObjectURL(url);
      return true;
    },
  };
  return { ...options, diagnosticsRecorder };
}

function defaultRecognizerFactory(options) {
  if (
    import.meta.env.MODE === 'test-e2e' &&
    globalThis.__HAND_CRICKET_GESTURE_TEST_FACTORY__
  ) {
    return globalThis.__HAND_CRICKET_GESTURE_TEST_FACTORY__(options);
  }
  return createGestureRecognizer(
    import.meta.env.DEV ? attachDevelopmentDiagnostics(options) : options,
  );
}

export function useGestureRecognition({
  video,
  canSubmit,
  onSubmit,
  matchId,
  recognizerFactory = defaultRecognizerFactory,
}) {
  const [method, setMethod] = useState(INPUT_METHODS.BUTTONS);
  const [recognizerState, setRecognizerState] = useState(disabledState);
  const recognizerRef = useRef(null);
  const canSubmitRef = useRef(canSubmit);
  const onSubmitRef = useRef(onSubmit);
  const previousMatchIdRef = useRef(matchId);
  const methodRef = useRef(method);
  useEffect(() => {
    canSubmitRef.current = canSubmit;
    onSubmitRef.current = onSubmit;
  }, [canSubmit, onSubmit]);
  useEffect(() => {
    methodRef.current = method;
  }, [method]);

  const destroyRecognizer = useCallback(() => {
    recognizerRef.current?.destroy();
    recognizerRef.current = null;
    setRecognizerState(disabledState);
  }, []);

  const switchToButtons = useCallback(() => {
    destroyRecognizer();
    setMethod(INPUT_METHODS.BUTTONS);
  }, [destroyRecognizer]);

  const selectMethod = useCallback(
    (nextMethod) => {
      if (nextMethod === INPUT_METHODS.BUTTONS) switchToButtons();
      else setMethod(INPUT_METHODS.CAMERA);
    },
    [switchToButtons],
  );

  const enableCamera = useCallback(async () => {
    if (!video) return false;
    recognizerRef.current?.destroy();
    const canvas = globalThis.document.createElement('canvas');
    const recognizer = recognizerFactory({
      video,
      canvas,
      onStateChange: setRecognizerState,
      isEligible: () => canSubmitRef.current,
      // The camera may only submit while camera mode is the selected input.
      // The recognizer already stops itself on destroy(), but keeping the check
      // here makes it an invariant of the hook that owns `method` rather than an
      // emergent property of teardown ordering.
      onSubmit: (value, label) => {
        if (methodRef.current !== INPUT_METHODS.CAMERA) return false;
        return onSubmitRef.current(value, label);
      },
    });
    recognizerRef.current = recognizer;
    recognizer.setActive(canSubmitRef.current);
    return recognizer.enable();
  }, [recognizerFactory, video]);

  useEffect(() => {
    // Toss, role-selection, and innings screens do not share a video element. Rebind
    // the already-authorized camera instead of leaving recognition attached to the
    // preview that React just unmounted.
    recognizerRef.current?.setVideo?.(video);
  }, [video]);

  useEffect(() => {
    recognizerRef.current?.setActive(method === INPUT_METHODS.CAMERA && canSubmit);
  }, [canSubmit, method]);

  useEffect(() => {
    const previousMatchId = previousMatchIdRef.current;
    previousMatchIdRef.current = matchId;
    if (previousMatchId !== undefined && previousMatchId !== matchId) {
      switchToButtons();
    }
  }, [matchId, switchToButtons]);

  useEffect(() => () => recognizerRef.current?.destroy(), []);

  const calibrateBackground = useCallback(
    () => recognizerRef.current?.calibrateBackground?.() ?? false,
    [],
  );
  const calibratePalm = useCallback(
    () => recognizerRef.current?.calibratePalm?.() ?? false,
    [],
  );
  const recalibrate = useCallback(() => recognizerRef.current?.recalibrate?.(), []);

  return {
    method,
    selectMethod,
    enableCamera,
    calibrateBackground,
    calibratePalm,
    recalibrate,
    useButtons: switchToButtons,
    state: recognizerState,
  };
}
