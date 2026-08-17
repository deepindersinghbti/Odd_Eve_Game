import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/App.jsx';
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

function createFakeRecognizerFactory({ fail = false } = {}) {
  const instances = [];
  const factory = vi.fn((options) => {
    let active = false;
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
            : {
                status: RECOGNIZER_STATUS.READY,
                cameraStatus: CAMERA_STATUS.GRANTED,
                rawLabel: null,
                confidence: 0,
                candidateLabel: null,
                holdProgress: 0,
                cooldown: false,
                error: null,
              },
        );
        return !fail;
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
  it('exposes the training studio only through the explicit development query', () => {
    globalThis.history.replaceState({}, '', '/?gesture-studio=1');
    render(<App storage={storage()} />);
    expect(
      screen.getByRole('heading', { name: /gesture calibration studio/i }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /start camera and local model/i }),
    ).toBeVisible();
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

  it('lets only the first input win a button/camera same-tick race', async () => {
    const harness = createHarness();
    const fake = createFakeRecognizerFactory();
    startAtToss(harness, fake.factory);
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    await act(async () => screen.getByRole('button', { name: /enable camera/i }).click());
    act(() => {
      fake.instances[0].submit(3);
      screen.getByRole('button', { name: 'Choose number 4' }).click();
    });
    expect(harness.chooseNumber).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().presentation.selectedPlayerNumber).toBe(3);
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
