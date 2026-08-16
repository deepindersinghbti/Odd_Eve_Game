export default function AppShell({ children, header }) {
  return (
    <main className="app-shell">
      <div className="ambient-shape ambient-shape--cyan" aria-hidden="true" />
      <div className="ambient-shape ambient-shape--orange" aria-hidden="true" />
      <div className="app-shell__content">
        {header}
        {children}
      </div>
    </main>
  );
}
