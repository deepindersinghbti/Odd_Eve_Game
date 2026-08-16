# Computer Opponent

## Goals

The bot should feel varied and responsive, remain beatable, run without network/AI, and be deterministic under injected seeded randomness in tests.

## Information boundary

Allowed: difficulty, toss/batting/bowling context, previously revealed choices, current score/target if needed.

Forbidden: current unrevealed human selection, DOM button state containing it, or future random values. The controller passes a pre-choice history snapshot.

## Easy

Uniform random 1–6:

```js
1 + Math.floor(random() * 6)
```

## Medium

- 65% uniform random.
- 35% frequency-based sampling from revealed human history with Laplace smoothing.
- When bowling, favor likely human batting values.
- When batting, down-weight likely human bowling values and sample alternatives.
- Before four relevant observations, use uniform random.

## Hard

- 35% uniform exploration.
- 30% global frequency model.
- 35% recent/transition model.

Recent model weights the last five relevant choices and estimates which value tends to follow the human's previous value. Sparse evidence falls back to frequency or uniform. Every number keeps at least 5% probability, preventing deterministic behavior.

## Computer role choice

For v1, uniform 50/50 Bat/Bowl is the clean default for all difficulties. Do not invent sophistication without an actual strategy.

## Random adapter

Ordinary play uses browser cryptographic randomness. Tests inject a seeded generator or fixed sequence.

## Required tests

- Always returns integer 1–6.
- Easy is approximately uniform over a large seeded sample.
- Medium adapts more than Easy to a strongly biased history.
- Hard uses sufficient recent/transition evidence.
- Fixed input/seed is repeatable.
- Every Hard number remains reachable.
- Empty/malformed history falls back safely.
- Bot API has no current-human-choice parameter.

Use wide justified statistical tolerances to avoid flaky tests.
