/**
 * M0 placeholder. The real shell (header, modes, document surface) lands in M1.
 * This exists so the deploy path, CSP, and e2e harness are exercised end to end
 * before there is any product to break.
 */
export function App() {
  return (
    <main className="boot">
      <h1>LocalMD</h1>
      <p>Markdown stays local.</p>
    </main>
  );
}
