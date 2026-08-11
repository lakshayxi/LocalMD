import { useEffect } from 'react';
import { useDocument } from './store';

/**
 * Stops unsaved work from leaving without being noticed.
 *
 * Two mechanisms, because neither one is enough on its own.
 *
 * `beforeunload` is the prompt — the browser's own "leave site?" dialog, the
 * only thing that can actually interrupt a reload or a tab close. But it is
 * unreliable exactly where it matters most: mobile browsers routinely tear a
 * page down without firing it, Safari fires it inconsistently, and a tab the
 * operating system kills never gets the chance.
 *
 * So `visibilitychange` is the net. The last moment a page is guaranteed to be
 * told about is the transition to hidden, which happens on tab close, on
 * reload, on app switch, and on the way into the background — so that is where
 * the draft is written. It costs a write the reader will usually never need,
 * and it is the only thing standing between them and a lost edit on the paths
 * `beforeunload` does not cover.
 */
export function useNavigationGuard(): void {
  const dirty = useDocument((s) => s.dirty);

  useEffect(() => {
    // Nothing is registered while the document is clean. That is not only
    // tidiness: a `beforeunload` listener disqualifies a page from the back
    // forward cache in every engine that has one, so leaving one attached
    // permanently would make going back to the app slow for everybody in order
    // to protect the minority of sessions that have edits in them.
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      // Both, deliberately. `preventDefault` is the modern spec; the legacy
      // assignment is what older Safari and Chrome before 119 actually honour.
      // The string is ignored everywhere — browsers show their own wording —
      // so there is no message to write here.
      event.preventDefault();
      event.returnValue = '';
    };

    const flushOnHide = () => {
      // Fires on both directions of the transition. Coming *back* to a visible
      // tab is not a moment worth writing at.
      if (document.visibilityState === 'hidden') useDocument.getState().flushDraft();
    };

    const flush = () => useDocument.getState().flushDraft();

    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', flushOnHide);
    // Belt and braces for WebKit, which is the engine most likely to skip
    // `visibilitychange` on a real teardown. Both firing is the common case, not
    // the exception, and the store decides the draft's row synchronously so the
    // pair overwrite each other rather than leaving two copies of one edit.
    window.addEventListener('pagehide', flush);

    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [dirty]);
}
