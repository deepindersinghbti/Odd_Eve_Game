# Incremental Vibe-Coding Prompts

## 1 — Scaffold

```text
Read AGENTS.md and required specs. Implement Phase 0 only: React/Vite plain JavaScript with linting, formatting, Vitest, React Testing Library, Playwright, root quality scripts, and accessible app shell. Add no server, Socket.IO, auth, database, multiplayer, cloud service, or game rules. Ensure build has no external asset requests. Run lint, tests, build, and report results.
```

## 2 — Engine

```text
Read AGENTS.md, GAME_ENGINE_SPEC.md, PRD.md, TESTING.md. Implement Phase 1 as a pure immutable engine: parity, toss, roles, scoring, dismissal, innings switch, target, chase win/loss/draw, round IDs, invalid actions, reset. Add exhaustive table-driven tests. No React, timers, storage, DOM, or randomness in engine.
```

## 3 — Computer

```text
Read AGENTS.md and COMPUTER_OPPONENT.md. Implement Phase 2 with injected randomness and Easy/Medium/Hard strategies. Bot API must not accept/discover current human choice. Add seeded, validity, adaptation, exploration, and non-flaky distribution tests. No AI API or ML dependency.
```

## 4 — Controller

```text
Read AGENTS.md, ARCHITECTURE.md, LOCAL_APP_CONTRACT.md, TESTING.md. Implement Phase 3: controller/hook commits bot choice from pre-choice history, locks controls, waits configurable 400–800ms, resolves once, uses match/round checks, cleans timeouts, cancels on reset, supports zero-delay tests/reduced motion, and handles Strict Mode. Add fake-timer tests.
```

## 5 — UI

```text
Read AGENTS.md, UI_UX_SPEC.md, PRD.md. Implement Phase 4 screens and semantic components for complete match. UI sends controller intentions and never computes score/winner. Add preferences and recovery state. Manually complete a match and run quality gate.
```

## 6 — Polish

```text
Read AGENTS.md and UI_UX_SPEC.md. Implement Phase 5: vibrant university design, 1366x768/projector layout, keys 1–6, focus, aria-live, reduced motion, local optional sound, reveal animation, restrained celebration. Add accessibility/component tests without changing rules.
```

## 7 — Offline hardening

```text
Read AGENTS.md, TESTING.md, IMPLEMENTATION_ROADMAP.md. Implement Phase 6 Playwright flows for human win, computer win, draw, reset during pending bot choice, keyboard, and offline operation. Use test-only seeded injection. Audit assets/requests for internet dependencies. Run full gate; fix flakes without arbitrary sleeps.
```

## Audit

```text
Audit implementation against AGENTS.md and PRD.md. Prove there is no backend/network dependency, bot cannot read current human choice, stale timers cannot mutate a new match, duplicate clicks cannot score twice, and draw/target logic is correct. List findings with file references, fix confirmed issues, add regression tests, run full gate, and avoid unrelated refactors.
```
