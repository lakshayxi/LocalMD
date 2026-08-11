import { useEffect } from 'react';
import { useDocument } from '../store';

/** Long enough to read a filename, short enough not to sit over the document. */
const DISMISS_AFTER_MS = 4000;

/**
 * Confirms a save.
 *
 * A save that produces no visible change is a save you do not trust — most of
 * all on the download path, where the file lands somewhere the reader cannot
 * see from here. Naming the file is the point: "Saved README.md" answers
 * *which* file, which matters the moment Save As has been used.
 *
 * Errors do not auto-dismiss. A failed save is something the reader has to act
 * on, and clearing it on a timer would hide the one message that means their
 * work is still only in this tab.
 */
export function Toast() {
  const notice = useDocument((s) => s.notice);
  const dismiss = useDocument((s) => s.dismissNotice);

  const transient = notice?.kind === 'info';

  useEffect(() => {
    if (!transient) return;
    const timer = setTimeout(dismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
    // Keyed on the message too, so a second save restarts the clock rather than
    // inheriting the remainder of the first one's.
  }, [transient, notice?.message, dismiss]);

  if (!notice) return null;

  return (
    <div
      className={`lmd-toast ${notice.kind === 'error' ? 'is-error' : ''}`}
      // Errors interrupt; confirmations wait their turn.
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.message}</span>
      <button type="button" className="lmd-toast-close" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}
