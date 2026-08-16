# Game Engine Specification

## Phases

```text
HOME → PARITY_SELECTION → TOSS_WAITING → TOSS_REVEAL → ROLE_SELECTION
→ FIRST_INNINGS → INNINGS_BREAK → SECOND_INNINGS → MATCH_OVER
```

Presentation animations never determine scoring correctness.

## Canonical state

```js
{
  matchId,
  phase,
  difficulty: 'EASY' | 'MEDIUM' | 'HARD',
  player: { name, parity, role },
  computer: { parity, role },
  toss: { playerNumber, computerNumber, sum, winner },
  innings: [{ number, batter, score, target, status, deliveries }],
  currentRoundId,
  history: { playerNumbers: [], computerNumbers: [] },
  result: null
}
```

## Actions

- `START_MATCH`
- `SELECT_PARITY`
- `RESOLVE_TOSS`
- `CHOOSE_FIRST_ROLE`
- `RESOLVE_DELIVERY`
- `ADVANCE_PRESENTATION`
- `NEW_MATCH`

## Toss

```js
sum = playerNumber + computerNumber;
winningParity = sum % 2 === 0 ? 'EVEN' : 'ODD';
winner = player.parity === winningParity ? 'PLAYER' : 'COMPUTER';
```

If the player wins, UI requests Bat/Bowl. If the computer wins, its role strategy chooses and complementary roles are assigned.

## Delivery

```js
batterNumber = innings.batter === 'PLAYER' ? playerNumber : computerNumber;
isOut = playerNumber === computerNumber;
```

- Different: add `batterNumber`.
- Equal: add zero and end the innings.
- In innings 2, target reached ends the match immediately.

After first dismissal, reverse roles, create innings 2, and set target to first score plus one. After second dismissal: below first score loses; equal score draws.

## Invariants

- Values are integers 1–6.
- Parities and roles are complementary.
- Only phase-valid actions are accepted.
- Each `roundId` resolves at most once.
- Score never decreases.
- Runs are zero or exactly the batter's number.
- Equal values always dismiss and add zero.
- Target is first score plus one.
- Match Over is terminal except New Match.
- New Match uses a new `matchId` and empty history.

## Example

First batter scores 24: target is 25. Chaser reaching 25 wins; dismissal at 23 loses; dismissal at 24 draws.
