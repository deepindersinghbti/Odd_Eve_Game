# Hand Cricket vs Computer — Offline Showcase Specification

This folder defines a browser-based, single-player Hand Cricket game for a university event. It runs entirely on one laptop through `localhost`; there is no backend, authentication, database, multiplayer, or internet dependency.

## Stack

- React + Vite
- Plain JavaScript with JSDoc where useful
- CSS Modules or organized CSS
- Vitest + React Testing Library + Playwright

## Defaults

- Human plays against the computer.
- Human chooses Odd or Even; computer receives the other parity.
- Both choose 1–6 for the toss and every delivery.
- Toss winner chooses Bat or Bowl. The computer chooses if it wins.
- Different numbers score the batter's number; equal numbers dismiss the batter.
- Second-innings target is `firstInningsScore + 1`.
- Dismissal on equal scores is a draw.
- Default difficulty is Medium; Easy and Hard are also available.

## Documents

1. `PRD.md` — requirements and acceptance criteria
2. `ARCHITECTURE.md` — client-only architecture
3. `GAME_ENGINE_SPEC.md` — state machine and rules
4. `COMPUTER_OPPONENT.md` — bot strategies and fairness
5. `LOCAL_APP_CONTRACT.md` — actions, controller, timers, preferences
6. `UI_UX_SPEC.md` — event-friendly interface
7. `TESTING.md` — unit, integration, and E2E tests
8. `IMPLEMENTATION_ROADMAP.md` — phased build order
9. `AGENTS.md` — coding-agent constraints
10. `PROMPTS.md` — ready-to-paste prompts

Give the entire folder to the coding agent. Ask it to read `AGENTS.md` and execute one prompt from `PROMPTS.md` at a time.

## Event startup

```text
npm install
npm run dev -- --host 127.0.0.1
```

Pre-install everything before the event. Keep a built fallback: `npm run build` and `npm run preview -- --host 127.0.0.1`.
