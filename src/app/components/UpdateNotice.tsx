import { useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { shouldOfferUpdate, shouldReloadAfterControllerChange } from '@/app/pwa';
import { useDocument } from '@/app/store';

/**
 * Offers a waiting build without taking control away from the reader.
 *
 * A dirty document suppresses the action rather than discarding the update:
 * once Save clears `dirty`, the same waiting worker becomes visible. Choosing
 * Later dismisses only this prompt. The browser will check again normally on a
 * later visit.
 */
export function UpdateNotice() {
  const dirty = useDocument((state) => state.dirty);
  const [dismissed, setDismissed] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const updateRequested = useRef(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // vite-plugin-pwa otherwise reloads every controlled tab when any tab
    // activates the waiting worker. Only the tab that accepted the prompt may
    // reload itself. Other tabs keep their state and offer a reload after Save.
    onNeedReload() {
      if (
        shouldReloadAfterControllerChange(updateRequested.current, useDocument.getState().dirty)
      ) {
        window.location.reload();
        return;
      }

      updateRequested.current = false;
      setReloadRequired(true);
    },
  });

  if (!shouldOfferUpdate(needRefresh || reloadRequired, dirty, dismissed)) return null;

  const update = () => {
    if (reloadRequired) {
      window.location.reload();
      return;
    }

    // Mark this tab before activating the worker. Every other tab receives the
    // same controller change, but its ref stays false and blocks auto-reload.
    updateRequested.current = true;
    void updateServiceWorker();
  };

  const dismiss = () => {
    setDismissed(true);
    setNeedRefresh(false);
  };

  return (
    <div className="lmd-update-notice" role="status" aria-label="Application update available">
      <span>
        {reloadRequired
          ? 'Reload to finish updating LocalMD.'
          : 'A new LocalMD version is ready.'}
      </span>
      <button type="button" className="lmd-chip is-action" onClick={update}>
        {reloadRequired ? 'Reload now' : 'Update and reload'}
      </button>
      <button type="button" className="lmd-chip" onClick={dismiss}>
        Later
      </button>
    </div>
  );
}
