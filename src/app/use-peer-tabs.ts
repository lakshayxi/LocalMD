import { useEffect, useState } from 'react';
import { FileHandleSource } from '@/platform/files';
import type { DocumentSource } from '@/platform/files';
import { watchPeers, type PeerWatcher } from '@/platform/sync/peers';
import { useDocument } from './store';

/**
 * How many *other* tabs of this browser have this file open.
 *
 * A warning and nothing more. Nothing here — or anywhere below it — locks the
 * document, defers a save, or elects a tab to be in charge. Two tabs on one file
 * is a situation the reader is allowed to be in, and what actually protects the
 * bytes is `FileHandleSource.save` refusing to overwrite a file it did not read.
 * This exists so the second save is not the first time they hear about it.
 *
 * Announcing is driven by the *source*, not by the file's name or by any event
 * we would have to remember to fire. Every way a document can change identity —
 * opened, closed, restored from a draft, reloaded from disk, re-pointed by Save
 * As — replaces `source` in the store, so each of them announces exactly once
 * and none of them can be forgotten at a call site.
 */
export function usePeerTabs(): number {
  const source = useDocument((s) => s.source);
  const [peers, setPeers] = useState(0);
  const [watcher, setWatcher] = useState<PeerWatcher | null>(null);

  useEffect(() => {
    const started = watchPeers(setPeers);
    setWatcher(started);

    return () => {
      setWatcher(null);
      // Believing a count from a watcher that has been torn down would leave a
      // warning about tabs nobody is talking to any more.
      setPeers(0);
      started?.stop();
    };
  }, []);

  // Depends on the watcher as well as the source, so a watcher that arrives
  // *after* a document is already open is told what this tab has. Announcing
  // only on change would leave it silent about everything that happened before
  // it existed — which, on the very first mount, is the document itself.
  useEffect(() => {
    watcher?.announce(handleOf(source));
  }, [watcher, source]);

  return peers;
}

/**
 * The handle, or nothing.
 *
 * A pasted, dropped or downloaded-only document has no handle, and there is
 * deliberately no fallback to its name: two `README.md` files are two files, and
 * a warning that fires on the coincidence of a filename is a warning the reader
 * learns to ignore. Without a handle the honest answer is that we cannot tell.
 */
function handleOf(source: DocumentSource | null): FileSystemFileHandle | null {
  return source instanceof FileHandleSource ? source.handle : null;
}
