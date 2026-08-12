import { toHtml } from 'hast-util-to-html';
import { describe, expect, it } from 'vitest';
import { detectLanguage, highlightCode, resolveLanguage } from '@/core/markdown';

/**
 * Highlighting, now that it is a thing the renderer asks for per block rather
 * than something the pipeline does to every document before it can appear.
 *
 * The behaviour these assert is the same behaviour the pipeline plugin had —
 * the themes, the CSS variables, the aliases, the silence about languages we do
 * not carry. What changed is when it happens, and the one property worth
 * testing about *that* is the last case here: the highlighter survives between
 * calls, because rebuilding it per document was the 172ms that put a 45KB
 * README over its budget.
 */

describe('resolveLanguage', () => {
  it('accepts a language we carry', () => {
    expect(resolveLanguage('typescript')).toBe('typescript');
  });

  it('resolves common aliases', () => {
    expect(resolveLanguage('js')).toBe('javascript');
    expect(resolveLanguage('sh')).toBe('bash');
    expect(resolveLanguage('c++')).toBe('cpp');
  });

  it('is case-insensitive, the way fence tags are written in the wild', () => {
    expect(resolveLanguage('TypeScript')).toBe('typescript');
  });

  it('says no to a language we do not carry', () => {
    // Including Mermaid, which is a diagram rather than a grammar and must
    // never be handed to Shiki.
    expect(resolveLanguage('notarealanguage')).toBeNull();
    expect(resolveLanguage('mermaid')).toBeNull();
  });
});

describe('detectLanguage', () => {
  it.each([
    ['typescript', 'interface Person { name: string }'],
    ['javascript', 'const answer = () => 42;'],
    ['python', 'def greet(name):\n    return f"Hello {name}"'],
    ['json', '{"name":"LocalMD","private":true}'],
    ['bash', '#!/bin/zsh\necho "$HOME"'],
    ['sql', 'SELECT title FROM documents WHERE dirty = false;'],
  ] as const)('detects strong %s syntax', (language, code) => {
    expect(detectLanguage(code)).toBe(language);
  });

  it.each(['', 'ordinary prose in a code fence', 'x = 1', 'graph TD\nA --> B']) (
    'leaves ambiguous content plain',
    (code) => {
      expect(detectLanguage(code)).toBeNull();
    },
  );
});

describe('highlightCode', () => {
  it('highlights a known language', async () => {
    const tree = await highlightCode('typescript', 'const x = 1;');
    const result = toHtml(tree!);

    expect(result).toContain('shiki');
    expect(result).toContain('const');
  });

  it('emits both themes as CSS variables so switching needs no re-highlight', async () => {
    const tree = await highlightCode('typescript', 'const x = 1;');
    const result = toHtml(tree!);

    expect(result).toContain('--lmd-code-light:');
    expect(result).toContain('--lmd-code-dark:');
  });

  it('highlights a confidently detected unlabelled block', async () => {
    const tree = await highlightCode('auto', 'def greet(name):\n    return f"Hello {name}"');
    const result = toHtml(tree!);

    expect(result).toContain('shiki');
    expect(result).toContain('greet');
  });

  it('keeps an ambiguous unlabelled block plain', async () => {
    expect(await highlightCode('auto', 'x = 1')).toBeNull();
  });

  it('escapes hostile content rather than emitting it as markup', async () => {
    const tree = await highlightCode('html', '<script>alert(1)</script>');
    const result = toHtml(tree!);

    // Shiki builds its output from text, which is why this is generated markup
    // rather than document markup — but a highlighter that emitted a live
    // script tag would make that distinction worthless, so it is asserted.
    expect(result).not.toMatch(/<script>alert/);
  });

  it('keeps its highlighter between calls', async () => {
    // The regression this exists for: a highlighter built and disposed per
    // document paid Shiki's grammar compile every time — 172ms, on the render
    // path, for a document with one fence. A second call must not repeat it.
    const first = Date.now();
    await highlightCode('python', 'x = 1');
    const cold = Date.now() - first;

    const second = Date.now();
    await highlightCode('python', 'y = 2');
    const warm = Date.now() - second;

    // Deliberately a wide margin. The claim is "the expensive part happened
    // once", not a wall-clock budget, and this suite runs on whatever machine
    // it is given.
    expect(warm).toBeLessThan(Math.max(cold, 20));
  });
});
