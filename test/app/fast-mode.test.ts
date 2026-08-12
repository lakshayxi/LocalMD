import { describe, expect, it } from 'vitest';
import { modeWithFastMode, shouldUseFastMode } from '@/app/store';
import { LARGE_FILE_BYTES } from '@/platform/files';

describe('large-document fast mode boundary', () => {
  it('keeps exactly 2 MiB on the normal path', () => {
    expect(shouldUseFastMode(LARGE_FILE_BYTES, '')).toBe(false);
  });

  it('uses fast mode above 2 MiB', () => {
    expect(shouldUseFastMode(LARGE_FILE_BYTES + 1, '')).toBe(true);
  });

  it('measures UTF-8 bytes when a source has no file size', () => {
    const twoByteCharacters = 'é'.repeat(LARGE_FILE_BYTES / 2);

    expect(shouldUseFastMode(null, twoByteCharacters)).toBe(false);
    expect(shouldUseFastMode(null, `${twoByteCharacters}a`)).toBe(true);
  });

  it('forces opened, recovered, and reloaded large documents into View', () => {
    expect(modeWithFastMode('edit', true)).toBe('view');
    expect(modeWithFastMode('split', true)).toBe('view');
    expect(modeWithFastMode('edit', false)).toBe('edit');
  });
});
