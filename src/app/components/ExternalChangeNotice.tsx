import { useDocument } from '../store';

/**
 * The conflict banner: this file changed somewhere else.
 *
 * The plan's rule, and the one thing this must never do, is **never auto-merge**
 * — and by extension never auto-anything. Two versions of a file exist and only
 * the reader knows which parts of each they want. So this states the situation
 * and offers the three answers, without choosing one.
 *
 * What it offers depends entirely on whether there is anything of theirs to
 * lose, because the two cases are not the same question wearing different
 * words:
 *
 *  - **Nothing unsaved.** What is on screen is a stale copy of a file that has
 *    moved on, and there is no version of "keep mine" worth having — keeping it
 *    would mean writing the old contents back over the new ones. One action,
 *    and it is the obvious one.
 *  - **Unsaved edits.** Now it is a real fork, and all three of the plan's
 *    answers are live: save a copy and keep both, keep mine and overwrite, or
 *    load theirs and lose mine. Ordered by what they cost — the one that
 *    destroys nothing first, the two that destroy something after.
 *
 * `role="alert"`, unlike the withheld-images notice next door. That one reports
 * a decision already taken safely on the reader's behalf; this one is a thing
 * they did not know and would act wrongly without.
 */
export function ExternalChangeNotice() {
  const externalChange = useDocument((s) => s.externalChange);
  const dirty = useDocument((s) => s.dirty);
  const name = useDocument((s) => s.source?.name);
  const saving = useDocument((s) => s.saving);

  const saveAs = useDocument((s) => s.saveAs);
  const overwrite = useDocument((s) => s.overwrite);
  const reload = useDocument((s) => s.reloadFromDisk);

  // `name` as the second condition rather than `status`: this sits outside the
  // workspace, so it would otherwise be free to render over the landing screen
  // naming a document that is no longer open.
  if (!externalChange || !name) return null;

  return (
    <div className="lmd-conflict" role="alert">
      <p className="lmd-conflict-text">
        <strong>{name}</strong> changed on disk
        {dirty ? ' while you were editing it.' : ' since you opened it.'}{' '}
        {dirty
          ? 'Your unsaved changes are still here, and saving over it would replace what is now in the file.'
          : 'What you are reading is the older version.'}
      </p>

      <div className="lmd-conflict-actions">
        {dirty && (
          <button
            type="button"
            className="lmd-chip is-action"
            disabled={saving}
            onClick={() => void saveAs()}
          >
            Save a copy
          </button>
        )}
        {dirty && (
          <button
            type="button"
            className="lmd-chip"
            disabled={saving}
            onClick={() => void overwrite()}
          >
            Keep mine
          </button>
        )}
        <button
          type="button"
          className={dirty ? 'lmd-chip' : 'lmd-chip is-action'}
          disabled={saving}
          onClick={() => void reload()}
        >
          {/* Named for what it costs, not for what it does. "Reload" sounds
              free; it is the button that throws their edits away. */}
          {dirty ? 'Discard mine, load theirs' : 'Load the new version'}
        </button>
      </div>
    </div>
  );
}
