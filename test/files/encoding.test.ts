import { describe, expect, it } from 'vitest';
import { decodeText, encodeText } from '@/core/text/encoding';

const BOM = '﻿';

/**
 * Round-trip fidelity is a Gate B ship criterion: opening a file and saving it
 * unchanged must produce identical bytes. These are the cases that break it.
 */

describe('decodeText', () => {
  it('normalizes CRLF to LF and remembers the original', () => {
    const { text, shape } = decodeText('a\r\nb\r\nc');

    expect(text).toBe('a\nb\nc');
    expect(shape.lineEnding).toBe('crlf');
  });

  it('leaves LF files alone', () => {
    const { text, shape } = decodeText('a\nb\n');

    expect(text).toBe('a\nb\n');
    expect(shape.lineEnding).toBe('lf');
  });

  it('strips a BOM and remembers it', () => {
    const { text, shape } = decodeText(`${BOM}# Title`);

    expect(text).toBe('# Title');
    expect(shape.hadBom).toBe(true);
  });

  it('picks the dominant ending in a mixed file', () => {
    const { shape } = decodeText('a\r\nb\r\nc\nd\r\n');

    expect(shape.lineEnding).toBe('crlf');
  });

  it('records whether the file ended with a newline', () => {
    expect(decodeText('a\n').shape.hadTrailingNewline).toBe(true);
    expect(decodeText('a').shape.hadTrailingNewline).toBe(false);
    expect(decodeText('').shape.hadTrailingNewline).toBe(false);
  });
});

describe('round trip', () => {
  const cases = [
    ['lf, trailing newline', '# Title\n\nBody text.\n'],
    ['lf, no trailing newline', '# Title\n\nBody text.'],
    ['crlf, trailing newline', '# Title\r\n\r\nBody text.\r\n'],
    ['crlf, no trailing newline', '# Title\r\n\r\nBody text.'],
    ['bom + lf', `${BOM}# Title\n`],
    ['bom + crlf', `${BOM}# Title\r\n`],
    ['empty file', ''],
    ['single newline', '\n'],
    ['no newlines at all', 'one line'],
    ['blank lines preserved', 'a\n\n\n\nb\n'],
  ] as const;

  it.each(cases)('is byte-identical for %s', (_label, original) => {
    const { text, shape } = decodeText(original);

    expect(encodeText(text, shape)).toBe(original);
  });
});

describe('encodeText', () => {
  it('does not invent a trailing newline the file never had', () => {
    // Silently "fixing" the last byte of someone's file is exactly the kind of
    // unasked-for edit that produces noisy diffs and destroys trust.
    const { text, shape } = decodeText('no trailing newline');

    expect(encodeText(text, shape)).toBe('no trailing newline');
  });

  it('does not strip a trailing newline the user typed', () => {
    const { shape } = decodeText('original');

    expect(encodeText('original\n', shape)).toBe('original\n');
  });

  it('applies CRLF to lines added after opening', () => {
    const { shape } = decodeText('a\r\n');

    expect(encodeText('a\nb\n', shape)).toBe('a\r\nb\r\n');
  });
});
