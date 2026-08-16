export default function FoundationScreen() {
  return (
    <section className="foundation-screen" aria-labelledby="game-title">
      <header className="brand-lockup">
        <p className="brand-lockup__eyebrow">University Exhibition Edition</p>
        <h1 id="game-title">HAND CRICKET</h1>
        <p className="brand-lockup__subtitle">You vs Computer</p>
      </header>

      <div className="coming-soon-panel" role="status">
        <span className="coming-soon-panel__icon" aria-hidden="true">
          01
        </span>
        <div>
          <p className="coming-soon-panel__label">Up next</p>
          <p className="coming-soon-panel__message">Game setup coming next</p>
        </div>
      </div>
    </section>
  );
}
