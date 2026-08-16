# Implementation Roadmap

## Phase 0 — Scaffold

React/Vite plain-JavaScript app, lint/format, Vitest, React Testing Library, Playwright, local assets only. Exit: blank app builds/tests.

## Phase 1 — Engine

State, reducer, selectors, validation, toss, roles, innings, target, result, reset, exhaustive unit tests. Exit: rules pass without React.

## Phase 2 — Computer

Injected randomness, Easy/Medium/Hard, information boundary, deterministic/statistical tests. Exit: valid, varied, fair bot.

## Phase 3 — Controller

Commitment, reveal timing, locking, cleanup, stale-token protection, fake-timer tests. Exit: clicks/reset/Strict Mode cannot double-resolve.

## Phase 4 — Functional UI

Home, Parity, Toss, Role, Innings, Break, Chase, Result, score, history, preferences, errors. Exit: complete match without refresh.

## Phase 5 — Showcase polish

Responsive visual system, projector layout, keyboard/accessibility, reduced motion, local sound, controlled animations. Exit: 1366×768 and accessibility pass.

## Phase 6 — Offline E2E

Seeded test injection, win/loss/draw/reset/offline flows, external-request audit. Exit: full quality gate offline.

## Phase 7 — Event preparation

Production build, actual-laptop smoke test, launch shortcut/instructions, backup build and USB copy.

## Avoid

- Server/multiplayer dependencies
- Giving bot current human number
- Random calls in reducer/components
- Strict Mode duplicate effects
- Uncancelled timers after reset
- Remote fonts/CDNs/audio/analytics
- Deterministic Hard bot
- Animation-driven scoring
