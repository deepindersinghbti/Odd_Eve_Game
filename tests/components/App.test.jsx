import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/App.jsx';
import { createHarness, resolvePending } from '../controller/helpers.js';

afterEach(() => {
  document.body.innerHTML = '';
});

function createMemoryStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((key, next) => {
      value = next;
    }),
  };
}

function startAtToss(harness, parity = 'ODD') {
  render(<App controller={harness.controller} storage={createMemoryStorage()} />);
  fireEvent.change(screen.getByLabelText(/your name/i), {
    target: { value: '  Asha  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: /start game/i }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${parity}`, 'i') }));
}

describe('Phase 4 application', () => {
  it('renders Medium setup, trims the name, persists choices, and starts a match', () => {
    const harness = createHarness();
    const storage = createMemoryStorage();
    render(<App controller={harness.controller} storage={storage} />);

    expect(screen.getByRole('heading', { level: 1, name: 'HAND CRICKET' })).toBeVisible();
    expect(screen.getByText('You vs Computer')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Game setup coming next');
    expect(screen.getByRole('radio', { name: /medium/i })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /hard/i }));
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: '  Nia  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByRole('heading', { name: /choose odd or even/i })).toBeVisible();
    expect(harness.controller.getSnapshot().game).toMatchObject({
      difficulty: 'HARD',
      player: { name: 'Nia' },
    });
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)[1])).toEqual({
      difficulty: 'HARD',
      playerName: 'Nia',
    });
  });

  it('restores validated preferences when it owns the controller', () => {
    const storage = createMemoryStorage(
      JSON.stringify({ difficulty: 'EASY', playerName: 'Mira' }),
    );
    render(<App storage={storage} />);

    expect(screen.getByRole('radio', { name: /easy/i })).toBeChecked();
    expect(screen.getByLabelText(/your name/i)).toHaveValue('Mira');
  });

  it('opens and closes the rules dialog with Escape', () => {
    const harness = createHarness();
    render(<App controller={harness.controller} storage={createMemoryStorage()} />);
    fireEvent.click(screen.getByRole('button', { name: /how to play/i }));
    expect(screen.getByRole('dialog', { name: /how to play/i })).toBeVisible();
    fireEvent.keyDown(globalThis, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('supports toss buttons, keyboard input, locking, and simultaneous reveal', () => {
    const harness = createHarness({ numberChoices: [2] });
    startAtToss(harness);

    fireEvent.keyDown(globalThis, { key: '1', repeat: false });
    expect(screen.getByText(/computer is choosing/i)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/your number is locked in: 1/i);
    screen
      .getAllByRole('button', { name: /choose number/i })
      .forEach((button) => expect(button).toBeDisabled());
    expect(screen.queryByText('Computer chose 2')).not.toBeInTheDocument();
    fireEvent.keyDown(globalThis, { key: '2', repeat: true });
    expect(harness.chooseNumber).toHaveBeenCalledOnce();

    act(() => resolvePending(harness.manual));

    expect(screen.getByRole('heading', { name: /toss result/i })).toBeVisible();
    expect(screen.getByText(/you won the toss/i)).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
  });

  it('shows role controls only for the human toss winner', () => {
    const harness = createHarness({ numberChoices: [2] });
    startAtToss(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 1' }));
    act(() => resolvePending(harness.manual));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByRole('button', { name: /bat first/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /bowl first/i })).toBeVisible();
  });

  it('keeps human role controls absent during the computer role path', () => {
    const harness = createHarness({ numberChoices: [1], roleChoices: ['BOWL'] });
    startAtToss(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 1' }));
    act(() => resolvePending(harness.manual));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.queryByRole('button', { name: /bat first/i })).not.toBeInTheDocument();
    expect(screen.getByText(/computer is choosing/i)).toBeVisible();
    act(() => resolvePending(harness.manual));
    expect(screen.getByText(/computer chose to bowl/i)).toBeVisible();
  });

  it('renders runs, recent deliveries, acknowledgement, and the innings break', () => {
    const harness = createHarness({ numberChoices: [2, 4, 3] });
    startAtToss(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 1' }));
    act(() => resolvePending(harness.manual));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /bat first/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Choose number 3' }));
    act(() => resolvePending(harness.manual));
    expect(screen.getByText('+3 runs')).toBeVisible();
    expect(screen.getByRole('list', { name: /recent deliveries/i })).toHaveTextContent(
      '3 : 4',
    );
    fireEvent.click(screen.getByRole('button', { name: /next ball/i }));
    expect(screen.getByRole('button', { name: 'Choose number 3' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Choose number 3' }));
    act(() => resolvePending(harness.manual));
    expect(screen.getByRole('heading', { name: /that’s a wicket/i })).toBeVisible();
    expect(screen.getByText(/score 4 to win/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /start chase/i }));
    const scoreboard = screen.getByRole('region', { name: /scoreboard/i });
    expect(within(scoreboard).getByText('Target')).toBeVisible();
    expect(within(scoreboard).getByText('4', { selector: 'strong' })).toBeVisible();
  });

  it('requires confirmation before abandoning an active match', () => {
    const harness = createHarness();
    startAtToss(harness);
    fireEvent.click(screen.getByRole('button', { name: /new match/i }));
    expect(screen.getByRole('dialog', { name: /start a new match/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /keep playing/i }));
    expect(harness.controller.getSnapshot().game).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /new match/i }));
    fireEvent.click(screen.getByRole('button', { name: /discard match/i }));
    expect(screen.getByRole('heading', { name: 'HAND CRICKET' })).toBeVisible();
    expect(harness.controller.getSnapshot().game).toBeNull();
  });

  it('renders a final result and Play Again preserves setup values', () => {
    const harness = createHarness({ numberChoices: [2, 4, 3] });
    startAtToss(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 1' }));
    act(() => resolvePending(harness.manual));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /bat first/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 4' }));
    act(() => resolvePending(harness.manual));
    fireEvent.click(screen.getByRole('button', { name: /start chase/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose number 2' }));
    act(() => resolvePending(harness.manual));

    expect(screen.getByRole('heading', { name: /computer won/i })).toBeVisible();
    expect(screen.getByText(/target was reached/i)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /play again/i }));
    expect(screen.getByRole('heading', { name: /choose odd or even/i })).toBeVisible();
    expect(harness.controller.getSnapshot().game).toMatchObject({
      matchId: 'match-2',
      player: { name: 'Asha' },
      difficulty: 'MEDIUM',
    });
  });

  it('renders accessible controller errors and recovers from an unknown phase', () => {
    const snapshot = {
      game: { phase: 'UNKNOWN_PHASE' },
      setup: { difficulty: 'MEDIUM', playerName: '' },
      presentation: { context: null },
      controls: { locked: false },
      error: { code: 'SAFE_ERROR', message: 'Please try that action again.' },
    };
    const command = vi.fn(() => ({ ok: true }));
    const controller = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      selectDifficulty: command,
      startMatch: command,
      selectParity: command,
      submitTossNumber: command,
      advancePresentation: command,
      chooseRole: command,
      submitPlayNumber: command,
      newMatch: command,
      clearError: command,
      destroy: command,
    };
    render(<App controller={controller} storage={createMemoryStorage()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Please try that action again.');
    expect(screen.getByRole('heading', { name: /reset the pitch/i })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /start new match/i }));
    expect(command).toHaveBeenCalledWith({ returnToSetup: true });
  });
});
