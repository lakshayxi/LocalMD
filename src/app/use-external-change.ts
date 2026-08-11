import { useEffect } from 'react';
import { useDocument } from './store';

/**
 * Notices when the file changed somewhere else.
 *
 * The reader's editor, their formatter, `git checkout`, a sync client — a file
 * open in LocalMD is a file anything on the machine can still write to, and the
 * File System Access API offers no way to be told when that happens. So the
 * question is asked at the moment it is most likely to have an answer: when the
 * reader comes back to this window, having just been somewhere else.
 *
 * Both events, because they cover different departures. `focus` catches moving
 * between windows on the same screen, where the tab stayed visible the whole
 * time and `visibilitychange` never fires. `visibilitychange` catches switching
 * tabs and returning from another app, where on some platforms the window never
 * lost focus in the first place. Overlap is cheap — the check is one `getFile()`
 * and it stops at the first match — and a missed check is a reader who saves
 * over somebody's work.
 *
 * This is *not* the guarantee. It is the courtesy: a banner before they start
 * typing rather than after. The guarantee is in `FileHandleSource.save`, which
 * re-stats the file immediately before writing and refuses on any mismatch, and
 * which holds whether or not this hook ever ran.
 */
export function useExternalChange(): void {
  useEffect(() => {
    const check = () => void useDocument.getState().checkExternalChange();

    const checkIfVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', checkIfVisible);

    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', checkIfVisible);
    };
  }, []);
}
