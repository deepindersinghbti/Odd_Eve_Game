import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CAMERA_STATUS,
  INPUT_METHODS,
  RECOGNIZER_STATUS,
  createGestureRecognizer,
} from '../gesture/index.js';

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
};

function defaultRecognizerFactory(options) {
  if (
    import.meta.env.MODE === 'test-e2e' &&
    globalThis.__HAND_CRICKET_GESTURE_TEST_FACTORY__
  ) {
    return globalThis.__HAND_CRICKET_GESTURE_TEST_FACTORY__(options);
  }
  return createGestureRecognizer(options);
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
  useEffect(() => {
    canSubmitRef.current = canSubmit;
    onSubmitRef.current = onSubmit;
  }, [canSubmit, onSubmit]);

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
      onSubmit: (value, label) => onSubmitRef.current(value, label),
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

  return {
    method,
    selectMethod,
    enableCamera,
    useButtons: switchToButtons,
    state: recognizerState,
  };
}
