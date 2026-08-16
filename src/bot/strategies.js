import {
  BOT_CONTEXTS,
  HARD_BRANCHES,
  HARD_BRANCH_WEIGHTS,
  HARD_PROBABILITY_FLOOR,
  MEDIUM_BRANCHES,
  MEDIUM_BRANCH_WEIGHTS,
  MINIMUM_ADAPTIVE_HISTORY,
  MINIMUM_TRANSITION_EVIDENCE,
} from './constants.js';
import {
  applyLaplaceSmoothing,
  applyProbabilityFloor,
  buildFrequencyDistribution,
  buildRecentWeights,
  buildTransitionWeights,
  createUniformWeights,
  invertLikelyDistribution,
  mixDistributions,
  normalizeWeights,
  sampleWeighted,
} from './probability.js';

function adaptForContext(context, predictedHumanDistribution) {
  return context === BOT_CONTEXTS.COMPUTER_BATTING
    ? invertLikelyDistribution(predictedHumanDistribution)
    : normalizeWeights(predictedHumanDistribution);
}

function remapToBranch(randomValue, branchStart, branchWeight) {
  return (randomValue - branchStart) / branchWeight;
}

export function selectMediumBranch(randomValue) {
  if (randomValue < MEDIUM_BRANCH_WEIGHTS.UNIFORM) {
    return {
      branch: MEDIUM_BRANCHES.UNIFORM,
      sampleValue: remapToBranch(randomValue, 0, MEDIUM_BRANCH_WEIGHTS.UNIFORM),
    };
  }

  return {
    branch: MEDIUM_BRANCHES.FREQUENCY,
    sampleValue: remapToBranch(
      randomValue,
      MEDIUM_BRANCH_WEIGHTS.UNIFORM,
      MEDIUM_BRANCH_WEIGHTS.FREQUENCY,
    ),
  };
}

export function selectHardBranch(randomValue) {
  const globalStart = HARD_BRANCH_WEIGHTS.UNIFORM;
  const recentStart = globalStart + HARD_BRANCH_WEIGHTS.GLOBAL;

  if (randomValue < globalStart) {
    return {
      branch: HARD_BRANCHES.UNIFORM,
      sampleValue: remapToBranch(randomValue, 0, HARD_BRANCH_WEIGHTS.UNIFORM),
    };
  }

  if (randomValue < recentStart) {
    return {
      branch: HARD_BRANCHES.GLOBAL,
      sampleValue: remapToBranch(randomValue, globalStart, HARD_BRANCH_WEIGHTS.GLOBAL),
    };
  }

  return {
    branch: HARD_BRANCHES.RECENT_TRANSITION,
    sampleValue: remapToBranch(
      randomValue,
      recentStart,
      HARD_BRANCH_WEIGHTS.RECENT_TRANSITION,
    ),
  };
}

export function buildGlobalDistribution(context, history) {
  return adaptForContext(context, buildFrequencyDistribution(history));
}

/**
 * Combines last-five recency with transition followers when at least two exist.
 */
export function buildRecentTransitionDistribution(context, history) {
  if (history.length === 0) {
    return normalizeWeights(createUniformWeights());
  }

  const recentDistribution = normalizeWeights(
    applyLaplaceSmoothing(buildRecentWeights(history)),
  );
  const { weights: transitionWeights, evidenceCount } = buildTransitionWeights(history);
  const predictedHumanDistribution =
    evidenceCount >= MINIMUM_TRANSITION_EVIDENCE
      ? mixDistributions(
          [
            recentDistribution,
            normalizeWeights(applyLaplaceSmoothing(transitionWeights)),
          ],
          [0.5, 0.5],
        )
      : recentDistribution;

  return adaptForContext(context, predictedHumanDistribution);
}

export function buildHardDistribution(context, history) {
  const uniform = normalizeWeights(createUniformWeights());
  const global = applyProbabilityFloor(
    buildGlobalDistribution(context, history),
    HARD_PROBABILITY_FLOOR,
  );
  const recentTransition = applyProbabilityFloor(
    buildRecentTransitionDistribution(context, history),
    HARD_PROBABILITY_FLOOR,
  );

  return mixDistributions(
    [uniform, global, recentTransition],
    [
      HARD_BRANCH_WEIGHTS.UNIFORM,
      HARD_BRANCH_WEIGHTS.GLOBAL,
      HARD_BRANCH_WEIGHTS.RECENT_TRANSITION,
    ],
  );
}

export function chooseEasy(randomValue) {
  return sampleWeighted(createUniformWeights(), randomValue);
}

export function chooseMedium({ context, visibleHistory, randomValue }) {
  if (context === BOT_CONTEXTS.TOSS || visibleHistory.length < MINIMUM_ADAPTIVE_HISTORY) {
    return chooseEasy(randomValue);
  }

  const { branch, sampleValue } = selectMediumBranch(randomValue);
  const distribution =
    branch === MEDIUM_BRANCHES.UNIFORM
      ? createUniformWeights()
      : buildGlobalDistribution(context, visibleHistory);

  return sampleWeighted(distribution, sampleValue);
}

export function chooseHard({ context, visibleHistory, randomValue }) {
  if (context === BOT_CONTEXTS.TOSS) {
    return chooseEasy(randomValue);
  }

  const { branch, sampleValue } = selectHardBranch(randomValue);
  let distribution = createUniformWeights();

  if (branch === HARD_BRANCHES.GLOBAL) {
    distribution = applyProbabilityFloor(
      buildGlobalDistribution(context, visibleHistory),
      HARD_PROBABILITY_FLOOR,
    );
  } else if (branch === HARD_BRANCHES.RECENT_TRANSITION) {
    distribution = applyProbabilityFloor(
      buildRecentTransitionDistribution(context, visibleHistory),
      HARD_PROBABILITY_FLOOR,
    );
  }

  return sampleWeighted(distribution, sampleValue);
}
