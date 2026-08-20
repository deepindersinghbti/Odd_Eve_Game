import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/App.jsx';
import GestureCandidate from '../../src/components/gesture/GestureCandidate.jsx';
import { CAMERA_STATUS, RECOGNIZER_STATUS } from '../../src/gesture/index.js';
import { createHarness, resolvePending } from '../controller/helpers.js';

afterEach(() => {
  cleanup();
  globalThis.history.replaceState({}, '', '/');
});

function storage() {
  return { getItem: vi.fn(() => null), setItem: vi.fn() };
}

function startAtToss(harness, factory, wrapper) {
  render(
    <App
      controller={harness.controller}
      storage={storage()}
      gestureRecognizerFactory={factory}
    />,
    wrapper ? { wrapper } : undefined,
  );
  fireEvent.click(screen.getByRole('button', { name: /start game/i }));
  fireEvent.click(screen.getByRole('button', { name: /^odd/i }));
}

function createFakeRecognizerFactory({ fail = false, needsCalibration = false } = {}) {
  const instances = [];
  const factory = vi.fn((options) => {
    let active = false;
    const readyState = {
      status: RECOGNIZER_STATUS.READY,
      cameraStatus: CAMERA_STATUS.GRANTED,
      rawLabel: null,
      confidence: 0,
      candidateLabel: null,
      holdProgress: 0,
      cooldown: false,
      error: null,
      ...(needsCalibration ? { calibrationStatus: 'BACKGROUND_REQUIRED' } : {}),
    };
    const instance = {
      options,
      setActive: vi.fn((value) => {
        active = value;
      }),
      setVideo: vi.fn(),
      enable: vi.fn(async () => {
        options.onStateChange(
          fail
            ? {
                status: RECOGNIZER_STATUS.ERROR,
                cameraStatus: CAMERA_STATUS.DENIED,
                error: { code: 'DENIED', message: 'Permission denied. Use buttons.' },
              }
            : readyState,
        );
        return !fail;
      }),
      calibrateBackground: vi.fn(async () => {
        options.onStateChange({ ...readyState, calibrationStatus: 'PALM_REQUIRED' });
        return true;
      }),
      calibratePalm: vi.fn(async () => {
        options.onStateChange({ ...readyState, calibrationStatus: 'READY' });
        return true;
      }),
      recalibrate: vi.fn(() => {
        options.onStateChange({
          ...readyState,
          calibrationStatus: 'BACKGROUND_REQUIRED',
        });
      }),
      destroy: vi.fn(),
      submit(value) {
        return active ? options.onSubmit(value, 'THREE') : false;
      },
    };
    instances.push(instance);
    return instance;
  });
  return { factory, instances };
}

describe('camera input React integration', () => {
  it('shows a low-confidence raw prediction instead of appearing idle', () => {
    render(
      <GestureCandidate
        state={{
          rawLabel: 'THREE',
          candidateLabel: null,
          confidence: 0.34,
          holdProgress: 0,
          cooldown: false,
          lastSubmittedValue: null,
        }}
      />,
    );

    expect(
      screen.getByText(/I can see 3, but confidence is low/i, { selector: 'p' }),
    ).toBeVisible();
    expect(screen.getByText('Confidence: 34%')).toBeVisible();
  });

  it('defaults to Buttons without requesting camera permission', () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    expect(screen.getByRole('button', { name: 'Buttons' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(fake.factory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose number 1' })).toBeEnabled();
  });

  it('shows privacy, all gesture instructions, and explicit activation', () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    expect(screen.getByText(/processed locally/i)).toBeVisible();
    expect(screen.getByText(/Closed fist = 6/i)).toBeVisible();
    expect(fake.factory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /enable camera/i }));
    expect(fake.factory).toHaveBeenCalledOnce();
  });

  it('guides background and open-palm calibration before accepting gestures', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory({ needsCalibration: true });
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());

    expect(screen.getByText(/Step 1 of 2: empty background/i)).toBeVisible();
    await act(async () =>
      screen.getByRole('button', { name: /capture background/i }).click(),
    );
    expect(screen.getByText(/Step 2 of 2: open palm/i)).toBeVisible();
    await act(async () =>
      screen.getByRole('button', { name: /capture open palm/i }).click(),
    );

    expect(
      screen.getByRole('progressbar', { name: /gesture hold progress/i }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /recalibrate/i })).toBeVisible();
    expect(fake.instances[0].calibrateBackground).toHaveBeenCalledOnce();
    expect(fake.instances[0].calibratePalm).toHaveBeenCalledOnce();
  });

  it('routes a camera toss through the same controller command and locks once', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());
    act(() => fake.instances[0].submit(3));
    expect(harness.chooseNumber).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot()).toMatchObject({
      controls: { locked: true },
      presentation: { selectedPlayerNumber: 3 },
    });
  });

  it('routes a camera delivery through submitPlayNumber without exposing the bot choice', async () => {
    const harness = createHarness({ numberChoices: [2, 4] });
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 1' }));
    act(() => resolvePending(harness.manual));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /bat first/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());
    act(() => fake.instances[0].submit(5));
    expect(harness.controller.getSnapshot().presentation).toMatchObject({
      selectedPlayerNumber: 5,
      revealedComputerNumber: null,
    });
    expect(screen.queryByText(/Computer chose 4/i)).not.toBeInTheDocument();
    expect(harness.chooseNumber).toHaveBeenCalledTimes(2);
  });

  it('keeps an enabled camera connected when play begins after the toss', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());

    act(() => fake.instances[0].submit(1));
    act(() => resolvePending(harness.manual));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /bat first/i }));

    expect(fake.factory).toHaveBeenCalledOnce();
    expect(fake.instances[0].setVideo).toHaveBeenLastCalledWith(
      expect.any(HTMLVideoElement),
    );
    act(() => fake.instances[0].submit(4));
    expect(harness.controller.getSnapshot().presentation.selectedPlayerNumber).toBe(4);
  });

  // Camera and buttons are mutually exclusive inputs, so the old same-tick race is
  // unreachable through the UI. The race that survives is a stale recognizer
  // callback arriving after the player has already switched back to buttons.
  it('ignores stale camera input after switching back to buttons', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());
    expect(screen.queryByRole('button', { name: 'Choose number 4' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /use buttons instead/i }));
    expect(screen.getByRole('button', { name: 'Choose number 4' })).toBeInTheDocument();

    act(() => fake.instances[0].submit(3));
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 4' }));
    expect(harness.chooseNumber).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().presentation.selectedPlayerNumber).toBe(4);
  });

  it('destroys recognition and releases ownership on New Match', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());
    fireEvent.click(screen.getByRole('button', { name: /new match/i }));
    fireEvent.click(screen.getByRole('button', { name: /discard match/i }));
    expect(fake.instances[0].destroy).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'HAND CRICKET' })).toBeVisible();
  });

  it('keeps an accessible button fallback after camera failure', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory({ fail: true });
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    fireEvent.click(screen.getByRole('button', { name: /use buttons instead/i }));
    expect(screen.getByRole('button', { name: 'Choose number 1' })).toBeEnabled();
  });

  it('does not duplicate a camera submission in React Strict Mode', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory, StrictMode);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());
    act(() => fake.instances.at(-1).submit(2));
    expect(harness.chooseNumber).toHaveBeenCalledOnce();
  });
});
