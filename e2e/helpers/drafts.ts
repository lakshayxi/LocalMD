import type { Page } from '@playwright/test';

/**
 * Reads the draft store directly, without going through the app.
 *
 * The draft store is the one place LocalMD keeps document text, so what these
 * specs assert about it has to be what is actually on disk rather than what the
 * UI claims. Empty when there is nothing, or nothing yet.
 */
export async function readDrafts(page: Page): Promise<{ name: string; text: string }[]> {
  return page.evaluate(
    () =>
      new Promise<{ name: string; text: string }[]>((resolve) => {
        const request = indexedDB.open('localmd');
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('drafts')) return resolve([]);

          const all = db.transaction('drafts', 'readonly').objectStore('drafts').getAll();
          all.onerror = () => resolve([]);
          all.onsuccess = () =>
            resolve(
              (all.result as { name: string; text: string }[]).map(({ name, text }) => ({
                name,
                text,
              })),
            );
        };
      }),
  );
}
