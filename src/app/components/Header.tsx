import { FEEDBACK_URL, REPO_URL } from '../links';
import { useDocument } from '../store';
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
 * The alpha marker sits next to the wordmark rather than in a banner. A
 * dismissible bar would be dismissed, and one that cannot be dismissed steals
 * space from the document on every screen — but a reader who hits a rough edge
 * should never have to wonder whether it is meant to be like that.
 */
export function Header({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
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

        <span className="lmd-alpha" title="Early build — expect rough edges">
          alpha
        </span>

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
