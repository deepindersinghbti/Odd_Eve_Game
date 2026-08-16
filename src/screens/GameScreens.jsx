import DifficultyPicker from '../components/DifficultyPicker.jsx';
import NumberPad from '../components/NumberPad.jsx';
import {
  PlayerPanels,
  RecentDeliveries,
  Scoreboard,
  StatusBadge,
  ThinkingIndicator,
} from '../components/GameBits.jsx';
import {
  OUTCOMES,
  PARTICIPANTS,
  RESULT_REASONS,
  ROLES,
  getChaseTarget,
  getCurrentBatter,
  getCurrentInnings,
  getCurrentScore,
  getFinalResult,
  getNextBatter,
  getRecentDeliveries,
  getRunsNeeded,
  getTarget,
  isPlayerBatting,
} from '../game/index.js';
import { PRESENTATION_STATUS } from '../controller/index.js';

const displayWord = (value) => value?.toLowerCase().replace('_', ' ');

export function HomeScreen({
  name,
  difficulty,
  onNameChange,
  onDifficulty,
  onStart,
  onRules,
}) {
  return (
    <section className="home-screen" aria-labelledby="game-title">
      <div className="home-hero">
        <p className="eyebrow">University Exhibition Edition</p>
        <h1 id="game-title">HAND CRICKET</h1>
        <p className="hero-subtitle">You vs Computer</p>
        <p className="hero-copy">
          Pick a number. Match the computer’s number to take a wicket—or avoid the match
          to score runs.
        </p>
        <div className="offline-chip">
          <span aria-hidden="true">●</span> Works completely offline
        </div>
      </div>
      <form className="setup-card surface-card" onSubmit={onStart}>
        <div className="field-group">
          <label htmlFor="player-name">
            Your name <span>(optional)</span>
          </label>
          <input
            id="player-name"
            maxLength="24"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Player"
            autoComplete="off"
          />
          <small>Only used on this device for your game.</small>
        </div>
        <DifficultyPicker value={difficulty} onChange={onDifficulty} />
        <button className="button button--primary button--large" type="submit">
          Start Game <span aria-hidden="true">→</span>
        </button>
        <button className="button button--text" type="button" onClick={onRules}>
          How to Play
        </button>
      </form>
    </section>
  );
}

export function ParityScreen({ game, onChoose, onBack }) {
  return (
    <section className="center-screen" aria-labelledby="parity-title">
      <div className="screen-kicker">
        <StatusBadge>{displayWord(game.difficulty)}</StatusBadge>
        <span>{game.player.name} vs Computer</span>
      </div>
      <h1 className="screen-title" id="parity-title">
        Choose Odd or Even
      </h1>
      <p className="screen-copy">
        Your toss number and the computer’s number will be added together.
      </p>
      <div className="choice-grid choice-grid--two">
        <button
          className="choice-card choice-card--cyan"
          type="button"
          onClick={() => onChoose('ODD')}
        >
          <strong>ODD</strong>
          <span>1 · 3 · 5 · 7 · 9</span>
        </button>
        <button
          className="choice-card choice-card--orange"
          type="button"
          onClick={() => onChoose('EVEN')}
        >
          <strong>EVEN</strong>
          <span>2 · 4 · 6 · 8 · 10</span>
        </button>
      </div>
      <button className="button button--quiet" type="button" onClick={onBack}>
        ← Back to setup
      </button>
    </section>
  );
}

export function TossScreen({ game, presentation, locked, onChoose, onContinue }) {
  const revealing = presentation.status === PRESENTATION_STATUS.SHOWING_REVEAL;
  const thinking = presentation.status === PRESENTATION_STATUS.COMPUTER_THINKING;
  return (
    <section className="center-screen" aria-labelledby="toss-title">
      <div className="versus-parity">
        <StatusBadge tone="cyan">You: {displayWord(game.player.parity)}</StatusBadge>
        <span>VS</span>
        <StatusBadge tone="orange">
          Computer: {displayWord(game.computer.parity)}
        </StatusBadge>
      </div>
      <h1 className="screen-title" id="toss-title">
        {revealing ? 'Toss Result' : 'Choose your toss number'}
      </h1>
      {!revealing && (
        <p className="screen-copy">Pick 1–6. Both choices are revealed together.</p>
      )}
      {!revealing && (
        <NumberPad
          disabled={locked}
          onChoose={onChoose}
          label="Choose your toss number"
        />
      )}
      {thinking && (
        <ThinkingIndicator selectedNumber={presentation.selectedPlayerNumber} />
      )}
      {revealing && (
        <div className="reveal-card" aria-live="polite">
          <div>
            <span>You chose</span>
            <strong>{game.toss.playerNumber}</strong>
          </div>
          <div className="reveal-card__sum">
            <span>Sum</span>
            <strong>{game.toss.sum}</strong>
            <small>{displayWord(game.toss.winningParity)}</small>
          </div>
          <div>
            <span>Computer chose</span>
            <strong>{game.toss.computerNumber}</strong>
          </div>
          <p className="reveal-card__result">
            {game.toss.winner === PARTICIPANTS.PLAYER
              ? 'You won the toss!'
              : 'Computer won the toss.'}
          </p>
          <button className="button button--primary" type="button" onClick={onContinue}>
            Continue →
          </button>
        </div>
      )}
    </section>
  );
}

export function RoleSelectionScreen({ game, presentation, onChoose, onContinue }) {
  const humanWon = game.toss.winner === PARTICIPANTS.PLAYER;
  const thinking = presentation.status === PRESENTATION_STATUS.COMPUTER_THINKING;
  const revealed = presentation.status === PRESENTATION_STATUS.SHOWING_REVEAL;
  return (
    <section className="center-screen" aria-labelledby="role-title">
      <p className="eyebrow">Toss complete</p>
      <h1 className="screen-title" id="role-title">
        {humanWon ? 'You won the toss!' : 'Computer won the toss'}
      </h1>
      {humanWon && (
        <>
          <p className="screen-copy">Choose how you want to begin the match.</p>
          <div className="choice-grid choice-grid--two">
            <button
              className="choice-card choice-card--cyan"
              type="button"
              onClick={() => onChoose(ROLES.BAT)}
            >
              <strong>BAT FIRST</strong>
              <span>Set a score to defend</span>
            </button>
            <button
              className="choice-card choice-card--orange"
              type="button"
              onClick={() => onChoose(ROLES.BOWL)}
            >
              <strong>BOWL FIRST</strong>
              <span>Chase the computer’s score</span>
            </button>
          </div>
        </>
      )}
      {!humanWon && thinking && <ThinkingIndicator role />}
      {!humanWon && revealed && (
        <div className="role-reveal" aria-live="polite">
          <span className="role-reveal__icon" aria-hidden="true">
            {presentation.revealedRole === ROLES.BAT ? 'BAT' : 'BALL'}
          </span>
          <h2>Computer chose to {displayWord(presentation.revealedRole)}</h2>
          <p>
            You will {presentation.revealedRole === ROLES.BAT ? 'bowl' : 'bat'} first.
          </p>
          <button className="button button--primary" type="button" onClick={onContinue}>
            Start First Innings →
          </button>
        </div>
      )}
    </section>
  );
}

export function MatchScreen({ game, presentation, locked, onChoose, onAdvance }) {
  const innings = getCurrentInnings(game);
  const score = getCurrentScore(game);
  const target = getTarget(game);
  const runsNeeded = getRunsNeeded(game);
  const batter = getCurrentBatter(game);
  const playerBatting = isPlayerBatting(game);
  const deliveries = getRecentDeliveries(game, 6);
  const lastDelivery = innings?.deliveries.at(-1);
  const thinking = presentation.status === PRESENTATION_STATUS.COMPUTER_THINKING;
  const reveal = presentation.status === PRESENTATION_STATUS.SHOWING_REVEAL;
  return (
    <section className="match-screen" aria-labelledby="match-title">
      <div className="match-screen__topline">
        <div>
          <p className="eyebrow">
            {innings.number === 1 ? 'First Innings' : 'The Chase'}
          </p>
          <h1 id="match-title">
            {playerBatting ? 'You are batting' : 'You are bowling'}
          </h1>
        </div>
        <StatusBadge tone="purple">{displayWord(game.difficulty)}</StatusBadge>
      </div>
      <Scoreboard
        inningsNumber={innings.number}
        score={score}
        target={target}
        runsNeeded={runsNeeded}
      />
      <PlayerPanels playerName={game.player.name} batter={batter} />
      <div className="match-workspace surface-card">
        <div className="match-workspace__play">
          {!reveal && (
            <h2>
              {thinking
                ? 'Choice locked in'
                : playerBatting
                  ? 'Choose a number to score'
                  : 'Choose a number to bowl'}
            </h2>
          )}
          {!reveal && (
            <NumberPad
              disabled={locked}
              onChoose={onChoose}
              label="Choose your delivery number"
            />
          )}
          {thinking && (
            <ThinkingIndicator selectedNumber={presentation.selectedPlayerNumber} />
          )}
          {reveal && lastDelivery && (
            <div
              className={`delivery-reveal${lastDelivery.isOut ? ' delivery-reveal--out' : ''}`}
              aria-live="polite"
            >
              <div className="delivery-reveal__numbers">
                <span>
                  You <strong>{lastDelivery.playerNumber}</strong>
                </span>
                <b>:</b>
                <span>
                  Computer <strong>{lastDelivery.computerNumber}</strong>
                </span>
              </div>
              <h2>{lastDelivery.isOut ? 'OUT!' : `+${lastDelivery.runsAdded} runs`}</h2>
              <p>
                {playerBatting ? 'You were batting.' : 'Computer was batting.'} Score:{' '}
                {lastDelivery.scoreAfter}
              </p>
              <button
                className="button button--primary"
                type="button"
                onClick={onAdvance}
              >
                Next Ball →
              </button>
            </div>
          )}
        </div>
        <aside className="match-workspace__history">
          <h2>Recent balls</h2>
          <RecentDeliveries deliveries={deliveries} />
        </aside>
      </div>
    </section>
  );
}

export function InningsBreakScreen({ game, onContinue }) {
  const first = game.innings[0];
  const target = getChaseTarget(game);
  const nextBatter = getNextBatter(game);
  return (
    <section className="center-screen" aria-labelledby="break-title">
      <p className="eyebrow">Innings break</p>
      <h1 className="screen-title" id="break-title">
        That’s a wicket!
      </h1>
      <div className="break-card surface-card" aria-live="polite">
        <div>
          <span>First-innings batter</span>
          <strong>
            {first.batter === PARTICIPANTS.PLAYER ? game.player.name : 'Computer'}
          </strong>
        </div>
        <div>
          <span>Final score</span>
          <strong>{first.score}</strong>
        </div>
        <div>
          <span>New batter</span>
          <strong>
            {nextBatter === PARTICIPANTS.PLAYER ? game.player.name : 'Computer'}
          </strong>
        </div>
        <div className="break-card__target">
          <span>Target</span>
          <strong>{target}</strong>
          <small>Score {target} to win</small>
        </div>
      </div>
      <button
        className="button button--primary button--large"
        type="button"
        onClick={onContinue}
      >
        Start Chase →
      </button>
    </section>
  );
}

const resultCopy = {
  [OUTCOMES.PLAYER_WIN]: ['YOU WON!', 'A brilliant hand-cricket victory.'],
  [OUTCOMES.COMPUTER_WIN]: ['COMPUTER WON', 'Close game—ready for a rematch?'],
  [OUTCOMES.DRAW]: ['IT’S A DRAW!', 'Scores level at the final dismissal.'],
};

const reasonCopy = {
  [RESULT_REASONS.TARGET_REACHED]: 'The target was reached.',
  [RESULT_REASONS.DISMISSED_BELOW_TARGET]: 'The chaser was dismissed below the target.',
  [RESULT_REASONS.SCORES_LEVEL]: 'The chaser was dismissed with scores level.',
};

export function ResultScreen({ game, onPlayAgain, onChangeDifficulty }) {
  const result = getFinalResult(game);
  const [title, subtitle] = resultCopy[result.outcome];
  return (
    <section
      className="center-screen result-screen"
      aria-labelledby="result-title"
      aria-live="polite"
    >
      <p className="eyebrow">Match complete</p>
      <h1 className="screen-title" id="result-title">
        {title}
      </h1>
      <p className="screen-copy">{subtitle}</p>
      <div className="result-card surface-card">
        <div className="final-scores">
          {game.innings.map((innings) => (
            <div key={innings.number}>
              <span>Innings {innings.number}</span>
              <strong>{innings.score}</strong>
              <small>
                {innings.batter === PARTICIPANTS.PLAYER ? game.player.name : 'Computer'}{' '}
                batting
              </small>
            </div>
          ))}
        </div>
        <p>{reasonCopy[result.reason]}</p>
        <StatusBadge tone="purple">Played on {displayWord(game.difficulty)}</StatusBadge>
      </div>
      <div className="result-actions">
        <button
          className="button button--primary button--large"
          type="button"
          onClick={onPlayAgain}
        >
          Play Again
        </button>
        <button
          className="button button--quiet"
          type="button"
          onClick={onChangeDifficulty}
        >
          Change Difficulty
        </button>
      </div>
    </section>
  );
}

export function RecoveryScreen({ onRecover }) {
  return (
    <section className="center-screen" aria-labelledby="recovery-title">
      <p className="eyebrow">Safe recovery</p>
      <h1 className="screen-title" id="recovery-title">
        Let’s reset the pitch
      </h1>
      <p className="screen-copy">
        The game reached an unexpected state. Your device is fine, and no personal data
        was sent anywhere.
      </p>
      <button className="button button--primary" type="button" onClick={onRecover}>
        Start New Match
      </button>
    </section>
  );
}
