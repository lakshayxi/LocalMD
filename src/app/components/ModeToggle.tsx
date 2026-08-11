import type { Mode } from '../store';
import { MOD_KEY } from '../format';
import { useDocument } from '../store';
import { useSplitAvailable } from '../use-media-query';

/**
 * Read / Edit / Split.
 *
 * A segmented control rather than a cycling chip, because three states cannot
 * be cycled without making the third one two clicks away, and Split is the one
 * a power user reaches for most.
 *
 * Split disappears below 1024px rather than being shown disabled: a control
 * that cannot be used teaches nothing, and there is no room to explain why in
 * a 40px header. The keyboard shortcut is inert at those widths for the same
 * reason.
 */
const OPTIONS: { mode: Mode; label: string; key: string }[] = [
  { mode: 'view', label: 'Read', key: 'E' },
  { mode: 'edit', label: 'Edit', key: 'E' },
  { mode: 'split', label: 'Split', key: '\\' },
];

export function ModeToggle() {
  const mode = useDocument((s) => s.mode);
  const dirty = useDocument((s) => s.dirty);
  const setMode = useDocument((s) => s.setMode);
  const splitAvailable = useSplitAvailable();

  const options = splitAvailable ? OPTIONS : OPTIONS.filter((o) => o.mode !== 'split');

  return (
    <>
      {dirty && (
        <span className="lmd-dirty" title="Unsaved changes">
          <span className="lmd-dirty-dot" aria-hidden="true" />
          <span className="lmd-visually-hidden">Unsaved changes</span>
        </span>
      )}
      <div className="lmd-segmented" role="group" aria-label="Display mode">
        {options.map((option) => (
          <button
            key={option.mode}
            type="button"
            className="lmd-segment"
            // `aria-pressed` rather than `aria-current`: these are toggle
            // buttons choosing a mode, not links marking a location.
            aria-pressed={mode === option.mode}
            onClick={() => void setMode(option.mode)}
            title={`${option.label} (${MOD_KEY}${option.key})`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}
