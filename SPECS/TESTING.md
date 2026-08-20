# Testing Strategy

No backend, socket, authentication, or database tests are needed.

## Engine

- All 36 toss pairs.
- Correct BAT/BOWL assignment.
- Every unequal pair scores batter value.
- Every equal pair dismisses for zero.
- First dismissal reverses roles and sets exact target.
- Chase win, chase loss, and equal-score draw.
- Invalid 0, 7, negative, decimal, string, null, NaN.
- Wrong phase, duplicate resolution, stale round, terminal mutation.
- No input-state mutation.

## Bot

- Range/integer validity at every difficulty/context.
- Seeded reproducibility.
- Easy approximate uniformity.
- Medium biased-history adaptation.
- Hard recent/transition weighting and exploration floor.
- Empty/sparse history fallback.
- No current-human-choice API.

## Controller

- Click locks pad immediately.
- Bot uses pre-choice history.
- Reveal dispatches once.
- Rapid clicks cannot duplicate.
- New Match cancels pending operation.
- Old match/round timeout is ignored.
- Strict Mode cannot duplicate moves.
- Test/reduced-motion delay can be zero.

## E2E

- Human chase win.
- Computer win.
- Equal-score draw.
- Reset during computer thinking.
- Keyboard flow.
- Offline completion with no failed external request.

## Quality gate

```text
npm run lint
npm run format:check
npm run test
npm run test:e2e
npm run build
```

## Event checklist

- Test on actual laptop/browser and projector resolution.
- Disable Wi-Fi and reload.
- Play every difficulty.
- Verify fullscreen, sound, keyboard, reset.
- Keep production build and source backup on USB.

## Local gates

`npm install` points `core.hooksPath` at `.githooks`, which installs two hooks:

- `pre-commit` runs Prettier and ESLint over the staged files. Prettier reports
  malformed CSS as a parse error, so brace damage cannot reach a review.
- `commit-msg` rejects placeholder subjects such as the unedited
  "Describe what you changed here" template.

Run `npm run verify` for the full format, lint, and unit sweep, and
`npm run test:e2e` for the Playwright pass.
