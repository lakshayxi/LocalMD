import { relativeTime } from '../format';
import { useDocument } from '../store';

/**
 * Unsaved work from a session that ended badly, offered back.
 *
 * The whole justification for keeping document text in browser storage is that
 * it comes back to you, so this is the half of the draft store that makes the
 * other half worth having. Until it existed, LocalMD was writing text to disk
 * and never reading it — all of the privacy cost and none of the benefit.
 *
 * Three things it deliberately does not do:
 *
 *  - **It never restores on its own.** A draft is offered, always. Silently
 *    resurrecting text over a file the reader may have changed elsewhere is
 *    exactly the kind of surprise a product built on not touching your data
 *    cannot afford, and it is the reason `db.ts` can call drafts recovery-only.
 *  - **It does not hide anything behind "and 2 more".** The store holds at most
 *    eight rows and realistically one. Listing them all costs a few lines of
 *    screen and means nothing you are owed is a click away from being missed.
 *  - **Discard does not ask twice.** Clicking a button labelled Discard on a row
 *    naming the document is already the decision, and the store's rule is that
 *    accidents keep a draft while decisions do not.
 */
export function DraftRecovery() {
  const drafts = useDocument((s) => s.drafts);
  const restore = useDocument((s) => s.restoreDraft);
  const dismiss = useDocument((s) => s.dismissDraft);

  if (drafts.length === 0) return null;

  return (
    <section className="lmd-recovery" aria-labelledby="lmd-recovery-heading">
      <h2 className="lmd-recovery-heading" id="lmd-recovery-heading">
        Unsaved work
      </h2>

      <ul className="lmd-recovery-list">
        {drafts.map((draft) => (
          <li className="lmd-recovery-item" key={draft.id}>
            <span className="lmd-recovery-label">
              <span className="lmd-recovery-name">{draft.name}</span>
              {/* Just when, not "unsaved changes from when" — the heading above
                  already says what these are, and repeating it on every row
                  wrapped the line and made each one twice as tall. */}
              <span className="lmd-recovery-meta">Edited {relativeTime(draft.savedAt)}</span>
            </span>
            <span className="lmd-recovery-actions">
              <button
                type="button"
                className="lmd-chip is-action"
                onClick={() => void restore(draft)}
                aria-label={`Restore unsaved changes to ${draft.name}`}
              >
                Restore
              </button>
              <button
                type="button"
                className="lmd-chip"
                onClick={() => void dismiss(draft.id)}
                aria-label={`Discard unsaved changes to ${draft.name}`}
              >
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>

      {/* Best-effort, said out loud. Safari evicts this origin's storage after
          about a week without a visit, and no amount of `storage.persist()`
          changes that — so recovery is offered as a net that sometimes is not
          there rather than as something the reader can plan around. */}
      <p className="lmd-recovery-note">
        Kept in this browser only until you save or discard, and never longer than seven days.
        Recovery is best-effort — clearing browser data removes it.
      </p>
    </section>
  );
}
