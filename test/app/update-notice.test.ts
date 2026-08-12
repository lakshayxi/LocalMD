import { describe, expect, it } from 'vitest';
import { shouldOfferUpdate, shouldReloadAfterControllerChange } from '@/app/pwa';

describe('application update prompt', () => {
  it('offers a waiting update when the document is clean', () => {
    expect(shouldOfferUpdate(true, false, false)).toBe(true);
  });

  it('suppresses a waiting update while the document is dirty', () => {
    expect(shouldOfferUpdate(true, true, false)).toBe(false);
  });

  it('keeps an explicitly dismissed prompt hidden', () => {
    expect(shouldOfferUpdate(true, false, true)).toBe(false);
  });

  it('reloads only the clean tab that explicitly accepted the update', () => {
    expect(shouldReloadAfterControllerChange(true, false)).toBe(true);
    expect(shouldReloadAfterControllerChange(false, false)).toBe(false);
    expect(shouldReloadAfterControllerChange(true, true)).toBe(false);
  });
});
