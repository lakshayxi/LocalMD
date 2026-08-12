import { describe, expect, it, vi } from 'vitest';

import { conflictPaletteItems } from '@/app/components/Palette';

describe('conflict palette commands', () => {
  it('hides destructive overwrite when the document is clean', () => {
    const items = conflictPaletteItems({
      externalChange: true,
      dirty: false,
      sourceName: 'notes.md',
      overwrite: vi.fn(),
      reload: vi.fn(),
    });

    expect(items.map((item) => item.id)).toEqual(['reload']);
    expect(items[0]?.label).toBe('Reload notes.md');
  });

  it('offers explicit overwrite and discard only when dirty and conflicted', () => {
    const items = conflictPaletteItems({
      externalChange: true,
      dirty: true,
      sourceName: 'notes.md',
      overwrite: vi.fn(),
      reload: vi.fn(),
    });

    expect(items.map((item) => item.id)).toEqual(['overwrite', 'reload']);
    expect(items[1]?.label).toBe('Discard my changes and reload notes.md');
  });

  it('offers no conflict action without both a conflict and a source', () => {
    const base = {
      dirty: true,
      overwrite: vi.fn(),
      reload: vi.fn(),
    };

    expect(
      conflictPaletteItems({ ...base, externalChange: false, sourceName: 'notes.md' }),
    ).toEqual([]);
    expect(conflictPaletteItems({ ...base, externalChange: true, sourceName: null })).toEqual([]);
  });
});
