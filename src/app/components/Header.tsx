import { FEEDBACK_URL, REPO_URL } from '../links';
import { useDocument } from '../store';
import { ModeToggle } from './ModeToggle';
import { ThemeToggle } from './ThemeToggle';
import { TypefaceToggle } from './TypefaceToggle';

/**
 * The application's only permanent chrome.
 *
 * Kept to 40px and deliberately quiet. It stays visible rather than hiding on
 * scroll for two reasons: an auto-hiding header is janky and hurts keyboard
 * users, and this bar is where the trust claim lives. A privacy indicator that
 * disappears while you read is not an indicator.
 *
 * Privacy, Feedback, and Source stay in the bar on every screen for the same
 * reason: they are the surfaces a reader needs when something looks wrong, and
 * a link you have to go looking for is a link that does not exist.
 */
export function Header({
  onOpenPrivacy,
  peerTabs,
}: {
  onOpenPrivacy: () => void;
  /** Other tabs of this browser with the same file open. See use-peer-tabs.ts. */
  peerTabs: number;
}) {
  const source = useDocument((s) => s.source);
  const rendered = useDocument((s) => s.rendered);
  const allowRemote = useDocument((s) => s.allowRemoteContent);
  const close = useDocument((s) => s.close);

  const blockedCount = rendered?.blocked.length ?? 0;

  return (
    <header className="lmd-header">
      <div className="lmd-header-left">
        {/* A button only when there is something to close. As a control that
            reads "LocalMD" to a screen reader it would announce its brand
            rather than its purpose, and with no document open it would be a
            control that does nothing at all. */}
        {source ? (
          <button
            type="button"
            className="lmd-wordmark"
            onClick={close}
            aria-label="Close document"
          >
            LocalMD
          </button>
        ) : (
          <span className="lmd-wordmark is-static">LocalMD</span>
        )}

        {source && (
          <>
            <span className="lmd-sep" aria-hidden="true">
              /
            </span>
            <span className="lmd-filename" title={source.name}>
              {source.name}
            </span>
          </>
        )}
      </div>

      <div className="lmd-header-right">
        {source && <ModeToggle />}
        {source && (
          <span
            className={`lmd-privacy ${blockedCount > 0 && !allowRemote ? 'is-blocking' : ''}`}
            title={
              allowRemote
                ? 'Remote content is loading for this document'
                : 'Nothing in this document has been sent anywhere'
            }
          >
            {allowRemote ? 'Remote content on' : 'Local'}
          </span>
        )}
        {/* Beside the privacy pill because they are the same kind of thing: a
            standing fact about this session, true until it stops being true.
            Not a banner — the file is not in trouble, and a bar across the top
            for something the reader may well have done on purpose would teach
            them to ignore the bar that means something. `role="status"`, the
            polite counterpart of the conflict banner's alert: worth saying,
            never worth interrupting for. */}
        {source && peerTabs > 0 && (
          <span
            className="lmd-tabs"
            role="status"
            title="Another LocalMD tab has this file open. Nothing is locked — but whichever tab saves second will be told the file changed on disk."
          >
            {/* The total, not the count of others: "2 tabs" is what the reader
                can go and look at. Always plural, since one tab is no news. */}
            Open in {peerTabs + 1} tabs
          </span>
        )}
        <TypefaceToggle />
        <ThemeToggle />
        <button type="button" className="lmd-chip" onClick={onOpenPrivacy}>
          Privacy
        </button>
        <a
          className="lmd-chip lmd-header-link"
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Feedback
        </a>
        <a
          className="lmd-chip lmd-header-link"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source code on GitHub"
        >
          Source
        </a>
      </div>
    </header>
  );
}
