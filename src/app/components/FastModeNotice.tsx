import { useDocument } from '../store';

/**
 * Makes the large-document tradeoff explicit and reversible.
 *
 * Fast mode is useful only if the reader knows why code and diagrams are still
 * source and how to opt back into the full experience. The action also unlocks
 * editing; there is one decision rather than separate rendering and editing
 * states that could drift apart.
 */
export function FastModeNotice() {
  const fastMode = useDocument((state) => state.fastMode);
  const renderFully = useDocument((state) => state.renderFully);

  if (!fastMode) return null;

  return (
    <div className="lmd-notice" role="status">
      <span className="lmd-notice-dot" aria-hidden="true" />
      <p>
        This document is over 2 MiB. Read-only fast mode keeps code and diagrams as source.
      </p>
      <button type="button" className="lmd-chip is-action" onClick={renderFully}>
        Render fully
      </button>
    </div>
  );
}
