# Local Application Contract

This replaces a network API. Components, controller, engine, and bot communicate through JavaScript calls inside one tab.

## Reducer

```js
nextState = gameReducer(currentState, action);
```

It is pure, deterministic, and immutable.

## Controller

```js
{
  state,
  selectDifficulty(difficulty),
  startMatch({ playerName }),
  selectParity(parity),
  submitTossNumber(number),
  chooseRole(role),
  submitPlayNumber(number),
  advancePresentation(),
  newMatch(),
  cancelPendingEffects()
}
```

Components call intentions and render state; they do not import scoring rules.

## Bot API

```js
chooseComputerNumber({ difficulty, context, visibleHistory, random });
chooseComputerRole({ difficulty, random });
```

The input must not include the current human number.

## Resolution

Validate and lock human input, generate bot value from pre-choice history, store both in a pending operation, then dispatch one resolved action after the delay. Ignore it if `matchId`/`roundId` no longer matches.

## Preferences

Use `hand-cricket:preferences:v1`:

```js
{ difficulty: 'MEDIUM', soundEnabled: false, reducedMotion: false, playerName: '' }
```

Validate parsed values and fall back safely. Active-match persistence is unnecessary.

## Effect safety

- Lock pad after a valid click.
- One pending operation per round.
- Cancel timeouts on New Match and cleanup.
- Reject stale/duplicate resolutions.
- Prevent React Strict Mode from scheduling duplicate bot moves.

Stable internal errors: `INVALID_PHASE`, `INVALID_NUMBER`, `INVALID_PARITY`, `INVALID_ROLE`, `ROUND_ALREADY_RESOLVED`, `STALE_ROUND`.
