import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, clearPrefs, loadPrefs, savePrefs } from '@/platform/persistence/prefs';

/**
 * Preferences are the one store that must never throw.
 *
 * They are read synchronously during the first render and by a blocking script
 * in <head>, so anything that escapes here stops the page before a reader sees
 * a single word — over a theme setting. Every case below is a real browser
 * state: private windows, storage-disabled origins, a hand-edited value, and a
 * key written by a future version.
 */

function installStorage(): Map<string, string> {
  const entries = new Map<string, string>();

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  });

  return entries;
}

const KEY = 'localmd.prefs';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('loadPrefs', () => {
  it('returns the defaults when nothing is stored', () => {
    installStorage();
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('reads back what was saved', () => {
    installStorage();
    savePrefs({ theme: 'dark', typeface: 'serif', outlinePinned: false });

    expect(loadPrefs()).toEqual({ theme: 'dark', typeface: 'serif', outlinePinned: false });
  });

  it('fills in keys a stored value predates', () => {
    // Exactly what an existing reader's storage looks like after we ship a new
    // preference: their record has no `outlinePinned`, and it must not come
    // back undefined and switch the outline off by accident.
    const entries = installStorage();
    entries.set(KEY, JSON.stringify({ theme: 'dark' }));

    expect(loadPrefs()).toEqual({
      theme: 'dark',
      typeface: DEFAULT_PREFS.typeface,
      outlinePinned: DEFAULT_PREFS.outlinePinned,
    });
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['a bare string', '"dark"'],
    ['null', 'null'],
    ['an array', '[]'],
  ])('falls back to the defaults for %s', (_label, stored) => {
    const entries = installStorage();
    entries.set(KEY, stored);

    // An array passes `typeof === 'object'`, so it reaches the spread and
    // contributes nothing — the defaults survive either way.
    expect(loadPrefs()).toMatchObject(DEFAULT_PREFS);
  });

  it('survives storage that throws on read', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });

    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});

describe('savePrefs', () => {
  it('survives storage that throws on write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem() {
        throw new DOMException('Quota exceeded.', 'QuotaExceededError');
      },
    });

    expect(() => savePrefs(DEFAULT_PREFS)).not.toThrow();
  });
});

describe('clearPrefs', () => {
  it('returns the reader to the defaults', () => {
    installStorage();
    savePrefs({ theme: 'dark', typeface: 'serif', outlinePinned: false });

    clearPrefs();

    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
