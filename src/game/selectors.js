import { PARTICIPANTS, PHASES } from './constants.js';

export function getCurrentInnings(state) {
  return state.innings.at(-1) ?? null;
}

export function getFirstInningsScore(state) {
  return state.innings[0]?.score ?? 0;
}

export function getCurrentScore(state) {
  return getCurrentInnings(state)?.score ?? 0;
}

export function getTarget(state) {
  return getCurrentInnings(state)?.target ?? null;
}

export function getChaseTarget(state) {
  return (
    getTarget(state) ??
    (state.phase === PHASES.INNINGS_BREAK ? getFirstInningsScore(state) + 1 : null)
  );
}

export function getNextBatter(state) {
  return state.phase === PHASES.INNINGS_BREAK ? (state.innings[0]?.bowler ?? null) : null;
}

export function getRunsNeeded(state) {
  const target = getTarget(state);
  return target === null ? null : Math.max(target - getCurrentScore(state), 0);
}

export function getCurrentBatter(state) {
  return getCurrentInnings(state)?.batter ?? null;
}

export function isPlayerBatting(state) {
  return getCurrentBatter(state) === PARTICIPANTS.PLAYER;
}

export function canSelectNumber(state) {
  const selectablePhase = [
    PHASES.TOSS_WAITING,
    PHASES.FIRST_INNINGS,
    PHASES.SECOND_INNINGS,
  ].includes(state.phase);

  return selectablePhase && !state.resolvedRoundIds.includes(state.currentRoundId);
}

export function getFinalResult(state) {
  return state.result;
}

export function getRecentDeliveries(state, limit = 5) {
  if (!Number.isInteger(limit) || limit <= 0) {
    return [];
  }

  return state.innings.flatMap((innings) => innings.deliveries).slice(-limit);
}
