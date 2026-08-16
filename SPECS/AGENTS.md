# Coding-Agent Instructions

## Mission

Build the offline, single-player Hand Cricket vs Computer game for one university showcase laptop.

## Read first

`README.md`, `PRD.md`, `ARCHITECTURE.md`, `GAME_ENGINE_SPEC.md`, `COMPUTER_OPPONENT.md`, `LOCAL_APP_CONTRACT.md`, then the current-phase document.

## Non-negotiable

- React/Vite, plain JavaScript.
- Client-only: no backend, Express, Socket.IO, auth, database, cloud, analytics, AI API, or multiplayer.
- Work without internet after build.
- Pure engine, separate from UI/timers/randomness.
- Inject randomness; never call it in reducer.
- Bot never receives current human choice before committing.
- Use match/round tokens and cancel timers.
- Preserve equal-score draw rule.
- Do not add accounts, rankings, tournaments, multiple wickets, or deployment scope.

## Method

- One roadmap phase at a time.
- Inspect code/tests first and state planned files/acceptance criteria.
- Add tests with behavior changes.
- Run relevant tests after edits and full gate at phase end.
- Never weaken tests to hide bugs.
- Record real deviations in `docs/decisions/`.

Report changes, tests/results, manual verification, limitations, and exact next phase.
