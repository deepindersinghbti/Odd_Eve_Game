export default function GameHeader({ compact = false, onRules, onNewMatch }) {
  return (
    <header className={`game-header${compact ? ' game-header--compact' : ''}`}>
      <div className="game-header__brand" aria-label="Hand Cricket, You versus Computer">
        <span className="game-header__mark" aria-hidden="true">
          HC
        </span>
        <div>
          <strong>HAND CRICKET</strong>
          <span>You vs Computer</span>
        </div>
      </div>
      <nav className="game-header__actions" aria-label="Game actions">
        <button className="button button--quiet" type="button" onClick={onRules}>
          How to Play
        </button>
        {onNewMatch && (
          <button className="button button--quiet" type="button" onClick={onNewMatch}>
            New Match
          </button>
        )}
      </nav>
    </header>
  );
}
