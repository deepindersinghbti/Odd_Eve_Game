import { DIFFICULTIES } from '../game/index.js';

export const PREFERENCES_KEY = 'hand-cricket:preferences:v1';
export const DEFAULT_PREFERENCES = Object.freeze({
  difficulty: DIFFICULTIES.MEDIUM,
  playerName: '',
});

const validDifficulties = new Set(Object.values(DIFFICULTIES));

function sanitizePlayerName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 24) : '';
}

export function validatePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_PREFERENCES };
  }

  return {
    difficulty: validDifficulties.has(value.difficulty)
      ? value.difficulty
      : DEFAULT_PREFERENCES.difficulty,
    playerName: sanitizePlayerName(value.playerName),
  };
}

export function loadPreferences(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(PREFERENCES_KEY);
    return stored === null
      ? { ...DEFAULT_PREFERENCES }
      : validatePreferences(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences, storage = globalThis.localStorage) {
  const validated = validatePreferences(preferences);
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify(validated));
  } catch {
    return validated;
  }
  return validated;
}
