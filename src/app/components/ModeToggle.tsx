import { MOD_KEY } from '../format';
import { useDocument } from '../store';

/**
 * Read / Edit.
 *
 * A two-state control, so a segmented pair of buttons would spend twice the
 * header width to say the same thing as one label. Split joins this as a third
 * state on wide screens later in M4, at which point it becomes a real segmented
 * control — two states do not justify one yet.
 *
 * The dirty dot lives beside it rather than next to the filename because this
 * is where the eye already is once editing has started.
 */
export function ModeToggle() {
  const mode = useDocument((s) => s.mode);
  const dirty = useDocument((s) => s.dirty);
  const setMode = useDocument((s) => s.setMode);

  const next = mode === 'edit' ? 'view' : 'edit';
  const label = mode === 'edit' ? 'Editing' : 'Reading';

  return (
    <>
      {dirty && (
        <span className="lmd-dirty" title="Unsaved changes">
          <span className="lmd-dirty-dot" aria-hidden="true" />
          <span className="lmd-visually-hidden">Unsaved changes</span>
        </span>
      )}
      <button
        type="button"
        className="lmd-chip"
        onClick={() => void setMode(next)}
        aria-label={`${label}. Switch to ${next === 'edit' ? 'editing' : 'reading'}. ${MOD_KEY}E`}
      >
        {label}
      </button>
    </>
  );
}
