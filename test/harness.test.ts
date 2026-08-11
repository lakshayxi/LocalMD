import { describe, expect, it } from 'vitest';
import { loadMarkdownFixtures } from './fixtures';
import { xssPayloads } from './security/xss-payloads';

/**
 * M0 harness checks. These don't test product behavior — there isn't any yet.
 * They exist so that a broken fixture loader or a malformed payload entry fails
 * here, loudly, instead of silently reducing coverage in M1's pipeline tests.
 */

describe('markdown fixture corpus', () => {
  const fixtures = loadMarkdownFixtures();

  it('loads fixtures from disk', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it('gives every fixture a unique name and non-empty source', () => {
    const names = fixtures.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const fixture of fixtures) {
      expect(fixture.source.trim(), `${fixture.name} is empty`).not.toBe('');
    }
  });
});

describe('xss payload corpus', () => {
  it('has payloads', () => {
    expect(xssPayloads.length).toBeGreaterThan(0);
  });

  it('gives every payload a unique name', () => {
    const names = xssPayloads.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('requires at least one assertion per payload', () => {
    for (const payload of xssPayloads) {
      expect(payload.mustNotMatch.length, `"${payload.name}" asserts nothing`).toBeGreaterThan(0);
    }
  });

  it('asserts each plain payload is actually hostile as written', () => {
    // Guards against a payload being edited into something harmless: a plain
    // payload's raw markdown must still match a pattern it forbids, otherwise
    // the sanitizer test would pass without the sanitizer doing anything.
    //
    // Obfuscated payloads are exempt by definition — the whole point of an
    // entity-encoded or control-character bypass is that the literal string
    // isn't there until the browser decodes it.
    const toothless = xssPayloads
      .filter((p) => !p.obfuscated)
      .filter((p) => !p.mustNotMatch.some((pattern) => pattern.test(p.markdown)))
      .map((p) => p.name);

    expect(
      toothless,
      'these payloads no longer contain any pattern they forbid, so they would pass trivially',
    ).toEqual([]);
  });

  it('requires obfuscated payloads to explain themselves', () => {
    for (const payload of xssPayloads.filter((p) => p.obfuscated)) {
      expect(payload.note.trim(), `"${payload.name}" is obfuscated but undocumented`).not.toBe('');
    }
  });
});
