import { isSameEntry } from '@/platform/persistence/same-entry';

/**
 * Noticing that another tab has the same file open.
 *
 * **A warning, never a lock.** Nothing here coordinates writes, queues saves,
 * elects a leader, or stops anybody doing anything. Two tabs editing one file is
 * a situation the reader is allowed to be in — they may well have meant it — and
 * the thing that actually protects the file is the conflict check in
 * `FileHandleSource.save`, which refuses to overwrite bytes it did not read. A
 * lock built on a channel with no delivery guarantee would be a promise this
 * cannot keep; the honest version is to say what is happening and let them
 * decide.
 *
 * **Identity comes from the handle, never the name.** Two `README.md` files from
 * two projects are two files, and warning about them would be noise the reader
 * learns to ignore. `isSameEntry` is the only thing that answers the question,
 * so the handle itself is what tabs exchange.
 *
 * **What crosses the channel is a reference and a heartbeat, and nothing else.**
 * A `FileSystemFileHandle` carries no bytes — it is a capability to reach a
 * file, which every tab of this origin already has — and there is deliberately
 * no field here for a filename, a size, a preview, or a line of text. Document
 * content never leaves the tab it was read in, and this channel is not an
 * exception to that.
 */

/** Same-origin only, and only ever spoken by this app. */
const CHANNEL = 'localmd:tabs';

/**
 * How often a tab says it is still here.
 *
 * The whole reason for a heartbeat is the tab that never says goodbye: a crash,
 * a killed process, a closed laptop. Without one, a warning about a tab that
 * stopped existing last Tuesday would sit on screen forever, and a warning that
 * can be permanently wrong is a warning nobody reads.
 */
const HEARTBEAT_MS = 4000;

/**
 * How long a silent tab is believed for. Three missed beats — long enough that
 * a busy main thread or a backgrounded tab is not mistaken for a dead one,
 * short enough that a stale warning clears while the reader is still looking.
 */
const EXPIRY_MS = 3 * HEARTBEAT_MS;

type Message =
  /** What this tab has open. A null handle means "nothing you need care about". */
  | { type: 'announce'; tabId: string; handle: FileSystemFileHandle | null }
  /** Newly arrived; asks everyone else to say what they have. */
  | { type: 'query'; tabId: string }
  /** Leaving cleanly. The fast path; the heartbeat covers the rest. */
  | { type: 'bye'; tabId: string };

export interface PeerWatcher {
  /**
   * Says what this tab now has open, and asks who else has it.
   *
   * Called on every change of document — opened, closed, recovered from a
   * draft, or re-pointed at a new file by Save As — because each of those
   * changes the answer, and a tab still announcing the file it had ten minutes
   * ago would warn other people about a document nobody has.
   */
  announce(handle: FileSystemFileHandle | null): void;
  stop(): void;
}

/**
 * Starts watching, and reports how many *other* tabs hold the same file.
 *
 * Returns null where there is nothing to watch with. `BroadcastChannel` is
 * absent in a few contexts, and on Safari and Firefox there are no handles for
 * user files at all — so on those engines this reports nothing, forever, which
 * is correct rather than degraded: without handles there is no way to know two
 * tabs have the same file, and guessing from the name is the thing this must
 * not do.
 */
export function watchPeers(report: (count: number) => void): PeerWatcher | null {
  if (typeof BroadcastChannel === 'undefined') return null;

  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }

  const tabId = crypto.randomUUID();
  const peers = new Map<string, { handle: FileSystemFileHandle; seenAt: number }>();

  let mine: FileSystemFileHandle | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lastReported = 0;

  /**
   * Guards the count against its own async.
   *
   * `isSameEntry` is a round trip, so several recounts can be in the air at once
   * — a peer arriving while a sweep is resolving is the ordinary case, not the
   * exotic one. Without this, an older count can land last and leave a warning
   * on screen for a tab that has already gone.
   */
  let generation = 0;

  const post = (message: Message) => {
    try {
      channel.postMessage(message);
    } catch {
      // A handle that will not survive the clone, or a channel already closed.
      // Losing the warning is the correct failure: it is advisory, and the file
      // is protected by the save-time check either way.
    }
  };

  async function recount(): Promise<void> {
    const mark = ++generation;

    if (!mine) {
      if (lastReported !== 0) report((lastReported = 0));
      return;
    }

    let count = 0;
    for (const peer of peers.values()) {
      if (await isSameEntry(peer.handle, mine)) count += 1;
    }

    if (mark !== generation) return;
    if (count !== lastReported) report((lastReported = count));
  }

  function sweep(): void {
    const cutoff = Date.now() - EXPIRY_MS;
    let dropped = false;

    for (const [id, peer] of peers) {
      if (peer.seenAt < cutoff) {
        peers.delete(id);
        dropped = true;
      }
    }

    if (dropped) void recount();
  }

  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    // Our own messages do not come back to us on a BroadcastChannel, but a tab
    // id is the only thing making that assumption checkable, so check it.
    if (!message || message.tabId === tabId) return;

    if (message.type === 'query') {
      // Answer even when holding nothing: silence is indistinguishable from a
      // tab that is not there, and the asker would wait a full expiry to learn
      // the difference.
      post({ type: 'announce', tabId, handle: mine });
      return;
    }

    if (message.type === 'bye') {
      if (peers.delete(message.tabId)) void recount();
      return;
    }

    if (message.type === 'announce') {
      if (!message.handle) {
        if (peers.delete(message.tabId)) void recount();
        return;
      }

      peers.set(message.tabId, { handle: message.handle, seenAt: Date.now() });
      void recount();
    }
  };

  // Cheap, and it is what makes an expired peer a temporary embarrassment
  // rather than a permanent one.
  const sweeper = setInterval(sweep, HEARTBEAT_MS);

  const farewell = () => post({ type: 'bye', tabId });
  // Both, for the same reason the navigation guard uses both: `pagehide` is the
  // one WebKit reliably fires, and neither is guaranteed. The heartbeat is what
  // makes this an optimisation rather than a requirement.
  window.addEventListener('pagehide', farewell);
  window.addEventListener('beforeunload', farewell);

  return {
    announce(handle) {
      mine = handle;
      clearInterval(heartbeat);
      heartbeat = undefined;

      post({ type: 'announce', tabId, handle });

      if (handle) {
        // Asked only when this tab has something to compare. A query is a
        // request for every other tab to speak, and there is no point making
        // them do that on behalf of a tab holding nothing.
        post({ type: 'query', tabId });
        heartbeat = setInterval(() => post({ type: 'announce', tabId, handle }), HEARTBEAT_MS);
      }

      void recount();
    },

    stop() {
      farewell();
      clearInterval(heartbeat);
      clearInterval(sweeper);
      window.removeEventListener('pagehide', farewell);
      window.removeEventListener('beforeunload', farewell);
      channel.close();
    },
  };
}
