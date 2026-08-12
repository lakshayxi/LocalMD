import { useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { useDocument } from '@/app/store';

const CLOSE_CHECK_EVENT = 'lifecycle-close-check';
const CLOSE_SAVE_EVENT = 'lifecycle-close-save';
const CLOSE_DISCARD_EVENT = 'lifecycle-close-discard';

/**
 * Answers the native window-close / application-quit protocol Rust owns.
 *
 * Rust intercepts every native close path — the red button, Cmd+W, Cmd+Q,
 * and the Dock/menu-bar Quit item — and cannot decide on its own whether
 * there is anything to protect, because the dirty bit lives in this store.
 * So it asks, once per close attempt, and this hook answers with whichever
 * of the store's own save or discard methods the reader's choice calls for —
 * the same methods every other save and close path in the app uses, so a
 * conflict, a failed save, or an edit that lands mid-save is handled exactly
 * once, here, rather than a second time for this path.
 *
 * `browser beforeunload` (`useNavigationGuard`) does not cover any of this:
 * a native window destroy does not navigate, so it never fires. That guard
 * stays as the net for a crash or a forced kill; this is the actual gate.
 */
export function useNativeLifecycle(): void {
  useEffect(() => {
    if (!isTauri()) return;

    const listeners = [
      listen(CLOSE_CHECK_EVENT, () => {
        void invoke('report_close_readiness', { dirty: useDocument.getState().dirty });
      }),
      listen(CLOSE_SAVE_EVENT, () => {
        void (async () => {
          // Defaults to keeping the app open. A throw here must not read as
          // permission to close with the reader's edits unaccounted for.
          let shouldClose = false;
          try {
            await useDocument.getState().save();
            // `save` clears `dirty` only once a write actually lands and no
            // newer edit arrived while it was in flight — a cancelled
            // picker, a conflict, or a race all leave it true, and that is
            // exactly the signal this path needs to keep the app open too.
            shouldClose = !useDocument.getState().dirty;
          } finally {
            await invoke('complete_close_flow', { shouldClose });
          }
        })();
      }),
      listen(CLOSE_DISCARD_EVENT, () => {
        void (async () => {
          let shouldClose = false;
          try {
            await useDocument.getState().discardForClose();
            shouldClose = true;
          } finally {
            await invoke('complete_close_flow', { shouldClose });
          }
        })();
      }),
    ];

    return () => {
      for (const pending of listeners) void pending.then((unlisten) => unlisten());
    };
  }, []);
}
