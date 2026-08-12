import type { Root } from 'hast';
import { describe, expect, it } from 'vitest';
import { hashSlice, sliceTreeWithHashes } from '@/core/markdown';

const tree = (text: string): Root => ({
  type: 'root',
  children: [{ type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: text }] }],
});

describe('slice content hashes', () => {
  it('keeps the same identity for independently rendered equal content', () => {
    expect(sliceTreeWithHashes(tree('same'))[0]?.hash).toBe(sliceTreeWithHashes(tree('same'))[0]?.hash);
  });

  it('changes identity when sanitized content changes', () => {
    const before = sliceTreeWithHashes(tree('before'))[0];
    const after = sliceTreeWithHashes(tree('after'))[0];

    expect(before?.hash).not.toBe(after?.hash);
    expect(hashSlice(before?.nodes ?? [])).toBe(before?.hash);
  });
});
