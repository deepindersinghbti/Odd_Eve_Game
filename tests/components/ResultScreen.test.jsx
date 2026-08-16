import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OUTCOMES, PARTICIPANTS, RESULT_REASONS } from '../../src/game/index.js';
import { ResultScreen } from '../../src/screens/GameScreens.jsx';

afterEach(cleanup);

function gameWithResult(outcome, reason) {
  return {
    difficulty: 'MEDIUM',
    player: { name: 'Asha' },
    innings: [
      { number: 1, batter: PARTICIPANTS.PLAYER, score: 8 },
      { number: 2, batter: PARTICIPANTS.COMPUTER, score: 8 },
    ],
    result: { outcome, reason },
  };
}

describe('ResultScreen', () => {
  it.each([
    [OUTCOMES.PLAYER_WIN, RESULT_REASONS.DISMISSED_BELOW_TARGET, /you won/i],
    [OUTCOMES.COMPUTER_WIN, RESULT_REASONS.TARGET_REACHED, /computer won/i],
    [OUTCOMES.DRAW, RESULT_REASONS.SCORES_LEVEL, /it’s a draw/i],
  ])('renders %s with its canonical reason', (outcome, reason, heading) => {
    render(
      <ResultScreen
        game={gameWithResult(outcome, reason)}
        onPlayAgain={vi.fn()}
        onChangeDifficulty={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('button', { name: /play again/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /change difficulty/i })).toBeVisible();
  });
});
