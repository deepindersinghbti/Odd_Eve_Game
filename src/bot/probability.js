import { BOT_NUMBER_COUNT, LAPLACE_ALPHA, RECENT_HISTORY_LIMIT } from './constants.js';
import { BOT_ERROR_CODES, failBot } from './errors.js';
import { validateRandomValue } from './random.js';

function assertSixNonNegativeValues(values) {
  const isValid =
    Array.isArray(values) &&
    values.length === BOT_NUMBER_COUNT &&
    values.every(
      (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
    );

  if (!isValid) {
    failBot(
      BOT_ERROR_CODES.INVALID_DISTRIBUTION,
      'A distribution must contain six finite non-negative values.',
    );
  }

  return values;
}

export function validateHistory(history) {
  if (
    !Array.isArray(history) ||
    !history.every((number) => Number.isInteger(number) && number >= 1 && number <= 6)
  ) {
    failBot(
      BOT_ERROR_CODES.INVALID_HISTORY,
      'visibleHistory must contain only integers from 1 to 6.',
    );
  }

  return [...history];
}

export function createUniformWeights() {
  return Array(BOT_NUMBER_COUNT).fill(1);
}

export function countFrequencies(history) {
  const validatedHistory = validateHistory(history);
  const counts = Array(BOT_NUMBER_COUNT).fill(0);

  validatedHistory.forEach((number) => {
    counts[number - 1] += 1;
  });

  return counts;
}

export function applyLaplaceSmoothing(weights, alpha = LAPLACE_ALPHA) {
  assertSixNonNegativeValues(weights);

  if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha <= 0) {
    failBot(BOT_ERROR_CODES.INVALID_DISTRIBUTION, 'Laplace alpha must be positive.');
  }

  return weights.map((weight) => weight + alpha);
}

export function normalizeWeights(weights) {
  assertSixNonNegativeValues(weights);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  if (total <= 0) {
    failBot(
      BOT_ERROR_CODES.INVALID_DISTRIBUTION,
      'Distribution weight must be positive.',
    );
  }

  return weights.map((weight) => weight / total);
}

export function buildFrequencyDistribution(history) {
  return normalizeWeights(applyLaplaceSmoothing(countFrequencies(history)));
}

/**
 * Converts predicted human-choice likelihoods into non-zero avoidance weights.
 */
export function invertLikelyDistribution(probabilities) {
  const normalized = normalizeWeights(probabilities);
  const baseline = 1 / BOT_NUMBER_COUNT;
  return normalizeWeights(normalized.map((probability) => 1 / (probability + baseline)));
}

/**
 * Reserves floor probability for every number, then distributes the remainder.
 */
export function applyProbabilityFloor(probabilities, floor) {
  const normalized = normalizeWeights(probabilities);

  if (
    typeof floor !== 'number' ||
    !Number.isFinite(floor) ||
    floor < 0 ||
    floor > 1 / BOT_NUMBER_COUNT
  ) {
    failBot(BOT_ERROR_CODES.INVALID_DISTRIBUTION, 'Probability floor is out of range.');
  }

  const remainingProbability = 1 - floor * BOT_NUMBER_COUNT;
  return normalized.map((probability) => floor + remainingProbability * probability);
}

export function sampleWeighted(probabilities, randomValue) {
  const normalized = normalizeWeights(probabilities);
  const sample = validateRandomValue(randomValue);
  let cumulative = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    cumulative += normalized[index];
    if (sample < cumulative || index === normalized.length - 1) {
      return index + 1;
    }
  }

  return BOT_NUMBER_COUNT;
}

export function mixDistributions(distributions, mixtureWeights) {
  if (
    !Array.isArray(distributions) ||
    distributions.length === 0 ||
    !Array.isArray(mixtureWeights) ||
    distributions.length !== mixtureWeights.length ||
    !mixtureWeights.every(
      (weight) => typeof weight === 'number' && Number.isFinite(weight) && weight >= 0,
    )
  ) {
    failBot(BOT_ERROR_CODES.INVALID_DISTRIBUTION, 'Mixture inputs are invalid.');
  }

  const normalizedMixtureWeights = (() => {
    const total = mixtureWeights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) {
      failBot(BOT_ERROR_CODES.INVALID_DISTRIBUTION, 'Mixture weight must be positive.');
    }
    return mixtureWeights.map((weight) => weight / total);
  })();
  const normalizedDistributions = distributions.map(normalizeWeights);
  const mixed = Array(BOT_NUMBER_COUNT).fill(0);

  normalizedDistributions.forEach((distribution, distributionIndex) => {
    distribution.forEach((probability, numberIndex) => {
      mixed[numberIndex] += probability * normalizedMixtureWeights[distributionIndex];
    });
  });

  return normalizeWeights(mixed);
}

export function buildRecentWeights(history) {
  const validatedHistory = validateHistory(history);
  const recent = validatedHistory.slice(-RECENT_HISTORY_LIMIT);
  const weights = Array(BOT_NUMBER_COUNT).fill(0);

  recent.forEach((number, index) => {
    weights[number - 1] += index + 1;
  });

  return weights;
}

export function buildTransitionWeights(history) {
  const validatedHistory = validateHistory(history);
  const weights = Array(BOT_NUMBER_COUNT).fill(0);

  if (validatedHistory.length < 2) {
    return { weights, evidenceCount: 0 };
  }

  const conditioningNumber = validatedHistory.at(-1);
  let evidenceCount = 0;

  for (let index = 0; index < validatedHistory.length - 1; index += 1) {
    if (validatedHistory[index] === conditioningNumber) {
      weights[validatedHistory[index + 1] - 1] += 1;
      evidenceCount += 1;
    }
  }

  return { weights, evidenceCount };
}
