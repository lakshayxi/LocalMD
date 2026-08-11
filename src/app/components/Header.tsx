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
 */
export function Header() {
  const source = useDocument((s) => s.source);
  // Selectors must return a stable reference. `?? []` would allocate a new array
  // on every call, which Zustand reads as a state change and loops on forever.
  const rendered = useDocument((s) => s.rendered);
  const allowRemote = useDocument((s) => s.allowRemoteContent);
  const blockedCount = rendered?.blocked.length ?? 0;
  const close = useDocument((s) => s.close);

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
      </div>
    </header>
  );
}
