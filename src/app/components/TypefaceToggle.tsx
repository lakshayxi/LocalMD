import { useDocument } from '../store';

/**
 * Switches the reading typeface.
 *
 * Only appears with a document open — it adjusts how the document reads, so on
 * the landing page it would be a control with nothing to act on.
 *
 * The label is the *current* face rather than the action, matching the theme
 * chip beside it: a two-state control whose label states where you are needs no
 * separate indicator.
 */
export function TypefaceToggle() {
  const typeface = useDocument((s) => s.typeface);
  const setTypeface = useDocument((s) => s.setTypeface);
  const source = useDocument((s) => s.source);

  if (!source) return null;

  const next = typeface === 'sans' ? 'serif' : 'sans';

  return (
    <button
      type="button"
      className="lmd-chip lmd-typeface"
      onClick={() => setTypeface(next)}
      aria-label={`Reading typeface: ${typeface}. Switch to ${next}.`}
      data-face={typeface}
    >
      Aa
    </button>
  );
}
