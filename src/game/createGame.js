import { DEFAULT_PLAYER_NAME, INITIAL_ROUND_ID, PHASES } from './constants.js';
import { normalizePlayerName, validateDifficulty, validateMatchId } from './rules.js';

export function createGame(configuration) {
  const config = configuration ?? {};
  const matchId = validateMatchId(config.matchId);
  const difficulty = validateDifficulty(config.difficulty);
  const playerName = normalizePlayerName(config.playerName ?? DEFAULT_PLAYER_NAME);

  return {
    matchId,
    phase: PHASES.PARITY_SELECTION,
    difficulty,
    player: {
      name: playerName,
      parity: null,
      role: null,
    },
    computer: {
      parity: null,
      role: null,
    },
    toss: {
      playerNumber: null,
      computerNumber: null,
      sum: null,
      winningParity: null,
      winner: null,
    },
    innings: [],
    currentRoundId: INITIAL_ROUND_ID,
    resolvedRoundIds: [],
    history: {
      playerNumbers: [],
      computerNumbers: [],
    },
    result: null,
  };
}
