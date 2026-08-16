# UI/UX Specification

## Direction

Use a vibrant university-showcase look: electric cyan/indigo with lime or amber highlights, bright surfaces, rounded cards, crisp typography, and subtle hand motifs. Avoid casino styling and overly dark blue.

## Screens

- Home: optional name, Easy/Medium/Hard cards, Start, How to Play, sound toggle.
- Parity: large Odd and Even choices.
- Toss: 1–6 number pad; lock; “Computer is choosing…”; simultaneous reveal with sum and winner.
- Role: human chooses Bat/Bowl if winner; otherwise reveal computer choice.
- Match: score, target/runs needed, role, innings, number pad, last deliveries.
- Break: first total, swapped roles, target.
- Result: You Won/Computer Won/Draw, final scores, Play Again, Change Difficulty.

## Showcase behavior

- Optimize for 1366×768 and projector readability.
- Avoid main-flow scrolling at common laptop heights.
- Support keyboard keys 1–6.
- Visible one-action reset for the next visitor.
- No debug controls.
- Fullscreen-friendly but not dependent on Fullscreen API.

## Components

`AppShell`, `DifficultyPicker`, `ParityPicker`, `NumberPad`, `ThinkingIndicator`, `RevealCard`, `Scoreboard`, `RoleBadge`, `RecentDeliveries`, `InningsBreakCard`, `ResultCard`, `RulesDialog`, `NewMatchButton`.

## Accessibility

- Semantic buttons, keyboard operation, visible focus.
- Announce reveal, out, score, target, and result via `aria-live`.
- Never use color alone.
- WCAG AA contrast and practical 44×44 touch targets.
- Respect reduced motion.

## Motion and sound

- Computer delay: 400–800 ms; zero under tests/reduced-motion configuration.
- Reveal: 250–400 ms, independent of scoring.
- Restrained final celebration; disabled for reduced motion.
- Any audio is bundled locally with mute control.

Unexpected state shows a recoverable Start New Match card—never an infinite thinking animation.
