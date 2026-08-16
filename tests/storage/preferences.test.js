import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  loadPreferences,
  savePreferences,
} from '../../src/storage/index.js';

describe('preference storage', () => {
  it('loads valid values and trims the visible name', () => {
    const storage = {
      getItem: () => JSON.stringify({ difficulty: 'HARD', playerName: '  Asha  ' }),
    };
    expect(loadPreferences(storage)).toEqual({ difficulty: 'HARD', playerName: 'Asha' });
  });

  it('uses defaults for missing preferences', () => {
    expect(loadPreferences({ getItem: () => null })).toEqual(DEFAULT_PREFERENCES);
  });

  it.each(['{bad', 'null', '[]', '{"difficulty":"IMPOSSIBLE","playerName":5}'])(
    'ignores malformed or invalid data: %s',
    (value) => {
      expect(loadPreferences({ getItem: () => value })).toEqual(DEFAULT_PREFERENCES);
    },
  );

  it('survives unavailable storage', () => {
    const unavailable = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    expect(loadPreferences(unavailable)).toEqual(DEFAULT_PREFERENCES);
    expect(
      savePreferences({ difficulty: 'EASY', playerName: 'Kai' }, unavailable),
    ).toEqual({ difficulty: 'EASY', playerName: 'Kai' });
  });

  it('stores only validated preferences under the versioned key', () => {
    const storage = { setItem: vi.fn() };
    savePreferences(
      { difficulty: 'HARD', playerName: 'x'.repeat(40), score: 999 },
      storage,
    );
    expect(storage.setItem).toHaveBeenCalledWith(
      PREFERENCES_KEY,
      JSON.stringify({ difficulty: 'HARD', playerName: 'x'.repeat(24) }),
    );
  });
});
