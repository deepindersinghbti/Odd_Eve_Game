import { PARTICIPANTS } from '../game/index.js';

export function StatusBadge({ children, tone = 'blue' }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}

export function ThinkingIndicator({ selectedNumber, role = false }) {
  return (
    <div className="thinking-panel" role="status" aria-live="polite">
      <span className="thinking-panel__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <div>
        <strong>Computer is choosing…</strong>
        {selectedNumber && (
          <p>
            Your number is locked in: <b>{selectedNumber}</b>
          </p>
        )}
        {role && <p>It’s deciding whether to bat or bowl.</p>}
      </div>
    </div>
  );
}

export function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="error-banner" role="alert" aria-live="assertive">
      <span>
        <strong>Couldn’t do that.</strong> {error.message}
      </span>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

export function Scoreboard({ inningsNumber, score, target, runsNeeded }) {
  return (
    <section className="scoreboard" aria-label="Scoreboard" aria-live="polite">
      <div>
        <span>{inningsNumber === 1 ? 'First Innings' : 'Second Innings'}</span>
        <strong>{score}</strong>
        <small>runs</small>
      </div>
      {target !== null && (
        <div className="scoreboard__target">
          <span>Target</span>
          <strong>{target}</strong>
          <small>{runsNeeded} needed</small>
        </div>
      )}
    </section>
  );
}

export function PlayerPanels({ playerName, batter }) {
  return (
    <div className="player-panels">
      <article className={batter === PARTICIPANTS.PLAYER ? 'is-active' : ''}>
        <span className="player-avatar" aria-hidden="true">
          YOU
        </span>
        <div>
          <small>Player</small>
          <strong>{playerName}</strong>
          <span>{batter === PARTICIPANTS.PLAYER ? 'Batting' : 'Bowling'}</span>
        </div>
      </article>
      <span className="versus-chip" aria-hidden="true">
        VS
      </span>
      <article className={batter === PARTICIPANTS.COMPUTER ? 'is-active' : ''}>
        <span className="player-avatar player-avatar--computer" aria-hidden="true">
          CPU
        </span>
        <div>
          <small>Opponent</small>
          <strong>Computer</strong>
          <span>{batter === PARTICIPANTS.COMPUTER ? 'Batting' : 'Bowling'}</span>
        </div>
      </article>
    </div>
  );
}

export function RecentDeliveries({ deliveries }) {
  if (!deliveries.length)
    return <p className="empty-history">Your resolved balls will appear here.</p>;
  return (
    <ol className="recent-deliveries" aria-label="Recent deliveries">
      {deliveries.map((delivery) => (
        <li key={delivery.roundId}>
          <span>
            {delivery.playerNumber} : {delivery.computerNumber}
          </span>
          <strong>{delivery.isOut ? 'OUT' : `+${delivery.runsAdded}`}</strong>
          <span className="sr-only">
            Player chose {delivery.playerNumber}, computer chose {delivery.computerNumber}
            .{' '}
            {delivery.isOut
              ? 'Matching numbers, batter out.'
              : `${delivery.runsAdded} runs scored.`}
          </span>
        </li>
      ))}
    </ol>
  );
}
