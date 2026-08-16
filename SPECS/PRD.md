# Product Requirements Document

## Product

Hand Cricket vs Computer recreates the school Odd–Even toss and one-wicket game as a polished offline browser experience. A visitor should begin playing within seconds on one university showcase laptop.

## Goals

- Complete a match in roughly 1–3 minutes.
- Reproduce the agreed rules exactly.
- Provide a believable but fair computer opponent.
- Work without internet after installation/build.
- Reset cleanly for the next visitor.
- Read well on a laptop, large monitor, or projector.

## Non-goals

- Multiplayer, rooms, WebSockets, backend, accounts, authentication, database, cloud deployment, leaderboards, chat, analytics, AI APIs, multiple wickets, or tournaments

## Flow

1. Home: optional player name and difficulty.
2. Human chooses Odd or Even.
3. Human and computer choose 1–6; toss is revealed.
4. Toss winner chooses Bat or Bowl.
5. First innings continues until equal numbers.
6. Roles swap and target is shown.
7. Chase ends on target reached or dismissal.
8. Result shows win, loss, or draw; Play Again resets everything.

## Rules

- Valid values are integers 1–6.
- The computer commits without seeing the human's current selection.
- Different values add the batter's number.
- Equal values add zero and dismiss the batter.
- First dismissal ends innings 1.
- Target equals first score plus one.
- Reaching target ends the match immediately.
- Chaser dismissed below the first score loses.
- Chaser dismissed on the same score draws.

## Difficulty

- Easy: uniform random.
- Medium: mostly random with limited frequency adaptation.
- Hard: frequency plus recent/transition prediction while retaining randomness.

Difficulty changes prediction only. The computer must never inspect the current unrevealed human choice.

## Showcase requirements

- Bundle all assets locally: no CDN, external font, remote image/audio, API, or telemetry.
- Fullscreen-friendly, large controls, projector-readable score.
- Visible New Match control; active-match reset requests confirmation.
- Optional sound has a visible toggle.
- Refresh may preserve preferences but starts a fresh match by default.

## Acceptance criteria

- Complete match works with Wi-Fi disabled and no console errors.
- Computer choice is generated without current human choice in its input.
- Seeded randomness reproduces bot choices in tests.
- All difficulties are valid, varied, and beatable.
- Equal-score dismissal produces a draw.
- New Match clears scores, history, timers, and pending bot actions.
- Rapid clicks cannot resolve twice.
- Main flow works at 1366×768 without scrolling.
