import { useDocument } from '../store';

/**
 * Explains withheld remote content and offers to load it.
 *
 * This is the counterweight to blocking by default, and the plan is blunt about
 * the risk: a README opening as a row of grey placeholders reads as *broken*,
 * and we lose the reader in three seconds. Three things make the difference:
 *
 *  - Name the host. "Would contact img.shields.io" teaches the concept in one
 *    sentence and turns the friction into the demonstration.
 *  - One action for the whole document. Per-image clicking would be intolerable
 *    on a README with a dozen badges.
 *  - State it as a decision already made on the reader's behalf, not an error.
 */
export function RemoteContentNotice({
  canLoadRemoteContent = true,
}: {
  canLoadRemoteContent?: boolean;
}) {
  // Selecting `rendered` rather than deriving inside the selector: a selector
  // that allocates returns a fresh reference each call, which Zustand treats as
  // a state change and loops on.
  const rendered = useDocument((s) => s.rendered);
  const allowRemote = useDocument((s) => s.allowRemoteContent);
  const setAllow = useDocument((s) => s.setAllowRemoteContent);

  const blocked = rendered?.blocked ?? [];
  if (allowRemote || blocked.length === 0) return null;

  const hosts = [...new Set(blocked.map((resource) => resource.host))];
  const hostLabel =
    hosts.length === 1
      ? hosts[0]
      : `${hosts.length} hosts including ${hosts[0]}`;

  return (
    <div className="lmd-notice" role="status">
      <span className="lmd-notice-dot" aria-hidden="true" />
      <p>
        {blocked.length} remote {blocked.length === 1 ? 'image' : 'images'} withheld — loading{' '}
        {blocked.length === 1 ? 'it' : 'them'} would tell <strong>{hostLabel}</strong> that you
        opened this document.
        {!canLoadRemoteContent && ' Remote images stay off in the desktop app.'}
      </p>
      {canLoadRemoteContent && (
        <button type="button" className="lmd-chip is-action" onClick={() => void setAllow(true)}>
          Load images
        </button>
      )}
    </div>
  );
}
