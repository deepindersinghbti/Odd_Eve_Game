import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createGameController } from '../../src/controller/index.js';
import { useGameController } from '../../src/hooks/index.js';
import { PHASES } from '../../src/game/index.js';
import { createManualScheduler } from '../controller/helpers.js';

function ControllerProbe({ options }) {
  const game = useGameController(options);

  return (
    <div>
      <output aria-label="phase">{game.game?.phase ?? 'SETUP'}</output>
      <output aria-label="locked">{String(game.controls.locked)}</output>
      <button
        type="button"
        onClick={() => {
          game.startMatch({ playerName: 'Nia' });
          game.selectParity('ODD');
        }}
      >
        Start toss
      </button>
      <button type="button" onClick={() => game.submitTossNumber(1)}>
        Pick one
      </button>
    </div>
  );
}

describe('useGameController', () => {
  it('subscribes to one external controller without duplicating event commands in Strict Mode', () => {
    const manual = createManualScheduler();
    const chooseNumber = vi.fn(() => 2);
    const controller = createGameController({
      scheduler: manual.scheduler,
      delayRange: { minimum: 0, maximum: 0 },
      timingRandom: () => 0,
      random: () => 0.2,
      chooseNumber,
      createMatchId: () => 'strict-match',
    });

    const view = render(
      <StrictMode>
        <ControllerProbe options={{ controller }} />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start toss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick one' }));

    expect(chooseNumber).toHaveBeenCalledOnce();
    expect(manual.scheduler.setTimeout).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('phase')).toHaveTextContent(PHASES.TOSS_WAITING);
    expect(screen.getByLabelText('locked')).toHaveTextContent('true');

    act(() => manual.run());

    expect(screen.getByLabelText('phase')).toHaveTextContent(PHASES.TOSS_REVEAL);
    expect(controller.getSnapshot().game.resolvedRoundIds).toEqual([1]);
    view.unmount();
  });

  it('keeps an owned controller alive through the Strict Mode probe and destroys it on final unmount', async () => {
    const manual = createManualScheduler();
    const view = render(
      <StrictMode>
        <ControllerProbe
          options={{
            scheduler: manual.scheduler,
            delayRange: { minimum: 100, maximum: 100 },
            timingRandom: () => 0,
            random: () => 0.2,
            chooseNumber: () => 2,
            createMatchId: () => 'owned-match',
          }}
        />
      </StrictMode>,
    );

    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: 'Start toss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick one' }));
    expect(manual.activeCount).toBe(1);

    view.unmount();
    await act(async () => Promise.resolve());

    expect(manual.activeCount).toBe(0);
    expect(manual.scheduler.clearTimeout).toHaveBeenCalledOnce();
  });
});
