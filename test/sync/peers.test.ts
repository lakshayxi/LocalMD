import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchPeers } from '@/platform/sync/peers';

/**
 * Noticing another tab, and — the part that matters — forgetting one.
 *
 * A warning that can be permanently wrong is worse than no warning, so most of
 * what is worth testing here is the negative space: a tab that closed its
 * document, a tab that said goodbye, a tab that crashed and said nothing at all,
 * and two files that merely share a name.
 *
 * **The channel is a stand-in on purpose, and it does not clone.** A real
 * `BroadcastChannel` structured-clones its payload, and browsers serialize a
 * `FileSystemFileHandle` through that with its methods intact — which is exactly
 * what Node's own `BroadcastChannel` cannot do for a stand-in handle, since a
 * plain object comes out the other side with `isSameEntry` missing. Passing the
 * object through by reference is therefore the *faithful* fake: it reproduces
 * what the browser does, where cloning would test a failure mode that only
 * exists in the test. Same reasoning as the FakeHandle in test/files/save.test.ts.
 *
 * **What no test here can reach:** the real thing — a real channel carrying a
 * real handle between two real tabs, and `isSameEntry` answering about two
 * paths on a real disk. Only a browser can mint the handle the picker returns,
 * so the two-tab interaction stays on the manual Chrome/Edge checklist beside
 * the other handle-identity checks (recents dedup, draft supersede,
 * save-in-place).
 *
 * Worth knowing when checking it by hand: OPFS
 * (`navigator.storage.getDirectory()`) mints handles that are real in every way
 * this feature cares about — they clone through a channel and answer
 * `isSameEntry` — so the whole path can be exercised in a browser without
 * touching the picker. That is how it was verified in M4; what it does *not*
 * cover, and what the manual check is for, is a handle the reader picked from
 * their own disk.
 */

type Listener = (event: { data: unknown }) => void;

/** Every open channel in the test, standing in for every tab of an origin. */
const channels = new Set<StubChannel>();

class StubChannel {
  onmessage: Listener | null = null;
  closed = false;

  constructor(readonly name: string) {
    channels.add(this);
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error('channel is closed');

    for (const other of channels) {
      // A BroadcastChannel never delivers to itself, and code that assumed
      // otherwise would pass here and fail in a browser.
      if (other === this || other.closed || other.name !== this.name) continue;
      // Asynchronous, like the real one: a synchronous delivery would hide
      // ordering bugs that only appear when a message lands mid-recount.
      queueMicrotask(() => other.onmessage?.({ data }));
    }
  }

  close(): void {
    this.closed = true;
    channels.delete(this);
  }
}

/**
 * A file, identified the way a real handle is: by what it points at, not by
 * what it is called. `path` is never sent anywhere — it exists so the fake can
 * answer `isSameEntry` the way the platform would.
 */
class FakeHandle {
  readonly kind = 'file' as const;

  constructor(
    readonly name: string,
    private readonly path: string,
  ) {}

  async isSameEntry(other: FileSystemFileHandle): Promise<boolean> {
    return other instanceof FakeHandle && other.path === this.path;
  }
}

function handle(name: string, path = `/${name}`): FileSystemFileHandle {
  return new FakeHandle(name, path) as unknown as FileSystemFileHandle;
}

/**
 * A tab we control message by message, for the cases a second `watchPeers`
 * cannot produce: one that crashes, and one that arrives late.
 */
function impersonateTab(tabId: string) {
  const channel = new StubChannel('localmd:tabs');
  const heard: { type: string; handle?: FileSystemFileHandle | null }[] = [];
  channel.onmessage = (event) => heard.push(event.data as { type: string });

  return {
    heard,
    announce: (open: FileSystemFileHandle | null) =>
      channel.postMessage({ type: 'announce', tabId, handle: open }),
    query: () => channel.postMessage({ type: 'query', tabId }),
    bye: () => channel.postMessage({ type: 'bye', tabId }),
    stopListening: () => channel.close(),
  };
}

/** Lets every queued delivery and every pending `isSameEntry` settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

const HEARTBEAT_MS = 4000;
const EXPIRY_MS = 3 * HEARTBEAT_MS;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('BroadcastChannel', StubChannel);
  // peers.ts listens for pagehide/beforeunload. Nothing in these tests fires
  // them; the stub exists so the module can register at all under `node`.
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  for (const channel of [...channels]) channel.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('watchPeers', () => {
  it('reports a tab holding the same file', async () => {
    const file = handle('README.md');
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const b = watchPeers(vi.fn())!;

    a.announce(file);
    b.announce(file);
    await settle();

    expect(mine).toHaveBeenLastCalledWith(1);

    a.stop();
    b.stop();
  });

  it('does not report two different files that share a name', async () => {
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const b = watchPeers(vi.fn())!;

    a.announce(handle('README.md', '/work/api/README.md'));
    b.announce(handle('README.md', '/work/web/README.md'));
    await settle();

    // Never called at all: it opened at zero and never left. A filename match
    // is not a file match, and warning here would be noise on every second repo.
    expect(mine).not.toHaveBeenCalled();

    a.stop();
    b.stop();
  });

  it('drops a tab that closed its document', async () => {
    const file = handle('notes.md');
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const b = watchPeers(vi.fn())!;

    a.announce(file);
    b.announce(file);
    await settle();
    expect(mine).toHaveBeenLastCalledWith(1);

    // The other tab pressed the wordmark. Its tab is still there; the document
    // it was warning about is not.
    b.announce(null);
    await settle();

    expect(mine).toHaveBeenLastCalledWith(0);

    a.stop();
    b.stop();
  });

  it('drops a tab that says goodbye', async () => {
    const file = handle('notes.md');
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const b = watchPeers(vi.fn())!;

    a.announce(file);
    b.announce(file);
    await settle();
    expect(mine).toHaveBeenLastCalledWith(1);

    b.stop();
    await settle();

    expect(mine).toHaveBeenLastCalledWith(0);

    a.stop();
  });

  it('expires a tab that goes away without saying so', async () => {
    const file = handle('notes.md');
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const crashed = impersonateTab('crashed-tab');

    a.announce(file);
    crashed.announce(file);
    await settle();
    expect(mine).toHaveBeenLastCalledWith(1);

    // No goodbye, no further heartbeat: a killed process, a closed laptop, a
    // browser that fired neither unload event. The warning has to clear itself,
    // because the reader has nothing left to click that would clear it.
    crashed.stopListening();
    await vi.advanceTimersByTimeAsync(EXPIRY_MS + HEARTBEAT_MS);

    expect(mine).toHaveBeenLastCalledWith(0);

    a.stop();
  });

  it('keeps believing a tab that is still beating', async () => {
    const file = handle('notes.md');
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const b = watchPeers(vi.fn())!;

    a.announce(file);
    b.announce(file);
    await settle();

    // Well past the expiry, and the only thing keeping the peer alive is its
    // own heartbeat. A backgrounded tab must not be mistaken for a dead one.
    await vi.advanceTimersByTimeAsync(EXPIRY_MS * 4);

    expect(mine).toHaveBeenLastCalledWith(1);
    expect(mine).toHaveBeenCalledTimes(1);

    a.stop();
    b.stop();
  });

  it('answers a newly arrived tab, including when holding nothing', async () => {
    const file = handle('README.md');

    const a = watchPeers(vi.fn())!;
    a.announce(file);

    const asking = impersonateTab('late-arrival');
    asking.query();
    await settle();

    expect(asking.heard).toContainEqual({ type: 'announce', tabId: expect.any(String), handle: file });

    // And with nothing open: silence would be indistinguishable from a tab that
    // is not there, and the asker would wait a full expiry to learn otherwise.
    a.announce(null);
    asking.heard.length = 0;
    asking.query();
    await settle();

    expect(asking.heard).toContainEqual({ type: 'announce', tabId: expect.any(String), handle: null });

    asking.stopListening();
    a.stop();
  });

  it('follows the file when Save As re-points a tab', async () => {
    const original = handle('README.md', '/work/README.md');
    const copy = handle('README.md', '/work/README.backup.md');
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const b = watchPeers(vi.fn())!;

    a.announce(original);
    b.announce(original);
    await settle();
    expect(mine).toHaveBeenLastCalledWith(1);

    // The other tab saved a copy and is now editing that. Same name on screen,
    // different file underneath — which is the whole reason identity comes from
    // the handle.
    b.announce(copy);
    await settle();
    expect(mine).toHaveBeenLastCalledWith(0);

    // And it comes back when this tab is the one that moves.
    a.announce(copy);
    await settle();
    expect(mine).toHaveBeenLastCalledWith(1);

    a.stop();
    b.stop();
  });

  it('says nothing at all about a document with no handle', async () => {
    const mine = vi.fn();

    const a = watchPeers(mine)!;
    const b = watchPeers(vi.fn())!;

    // Pasted, dropped, or restored from a draft whose file is gone. There is no
    // way to know two tabs hold the same one, and guessing from a name is the
    // thing this must not do.
    a.announce(null);
    b.announce(null);
    await settle();

    expect(mine).not.toHaveBeenCalled();

    a.stop();
    b.stop();
  });

  it('reports nothing where there is no channel to listen on', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(watchPeers(vi.fn())).toBeNull();
  });

  it('stops talking once stopped', async () => {
    const listening = impersonateTab('listener');
    const a = watchPeers(vi.fn())!;

    a.announce(handle('notes.md'));
    a.stop();

    // After the deliveries already in flight — the announce, the query, and the
    // farewell stop sends — so what follows is only what a stopped watcher says
    // on its own initiative, which must be nothing.
    await settle();
    listening.heard.length = 0;
    await vi.advanceTimersByTimeAsync(EXPIRY_MS * 2);

    // No heartbeat from a stopped watcher, and no throw from the interval that
    // used to carry it — a closed channel that is still being posted to would
    // take the rest of the tab's timers down with it.
    expect(listening.heard).toEqual([]);

    listening.stopListening();
  });
});
