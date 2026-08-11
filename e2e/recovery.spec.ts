import { expect, test, type Page } from '@playwright/test';
import { readDrafts } from './helpers/drafts';

/**
 * Draft recovery: the half of the draft store that makes the other half worth
 * having.
 *
 * The guard spec proves text is written on the way out. This one proves it comes
 * back — and proves the two properties that keep the store honest while it does.
 * A draft is *offered*, never applied, so the reader is never surprised by text
 * appearing over a file they may have changed elsewhere. And a restored document
 * is still unsaved, because restoring puts work in front of you rather than into
 * a file.
 *
 * The idle flush is tested here rather than in the guard spec on purpose: it
 * exists for the teardown nobody is told about — a crash — which is the one
 * departure no listener can cover.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const DOCUMENT = '# Title\n\nA paragraph.\n';

async function openPasted(page: Page, text = DOCUMENT) {
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(text);
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('article')).toBeVisible();
}

async function typeSomething(page: Page, text: string) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(`\n${text}\n`);
  await expect(page.getByTitle('Unsaved changes')).toBeVisible();
}

/**
 * Reloads through the unsaved-changes prompt.
 *
 * The navigation guard arms `beforeunload` the moment a document is dirty, which
 * is exactly the state every test here starts from. Accepting is the reader
 * choosing to leave anyway — the case the draft is for. The listener is harmless
 * on engines that tear the page down without asking.
 */
async function reloadPastTheGuard(page: Page) {
  page.once('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
}

/** Waits for the idle flush, so what follows is testing recovery and not timing. */
async function waitForDraft(page: Page) {
  await expect.poll(async () => (await readDrafts(page)).length, { timeout: 10_000 }).toBe(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
});

test.describe('the idle flush', () => {
  test('writes unsaved work without waiting for the tab to go away', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'Typed, then the browser died.');

    // No teardown of any kind here — no hidden tab, no close, no reload. A
    // browser that crashes gives the page no notice at all, so a draft that only
    // exists on the way out is a net with a hole in the middle of it.
    await expect
      .poll(async () => (await readDrafts(page)).map((draft) => draft.text), { timeout: 10_000 })
      .toEqual([expect.stringContaining('Typed, then the browser died.')]);
  });

  test('writes nothing for a document that is only read', async ({ page }) => {
    await openPasted(page);

    // Long enough that the idle flush would have fired several times over. The
    // store holds unsaved work and nothing else: reading must never put a
    // document's text into browser storage.
    await page.waitForTimeout(3000);
    expect(await readDrafts(page)).toEqual([]);
  });
});

test.describe('recovering a draft', () => {
  test('offers unsaved work back after a reload', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'Should survive the reload.');
    await waitForDraft(page);

    await reloadPastTheGuard(page);

    const recovery = page.getByRole('region', { name: 'Unsaved work' });
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('Pasted document');

    // Offered, not applied. The document is not open until the reader says so.
    await expect(page.locator('.cm-content')).toHaveCount(0);
  });

  test('puts the text back when the reader restores it', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'Should survive the reload.');
    await waitForDraft(page);
    await reloadPastTheGuard(page);

    await page.getByRole('button', { name: 'Restore unsaved changes to Pasted document' }).click();

    await expect(page.locator('.cm-content')).toContainText('Should survive the reload.');
    // Still the reader's own words, not a re-render of the original paste.
    await expect(page.locator('.cm-content')).toContainText('A paragraph.');
  });

  test('restores it as work that is still unsaved', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'Not saved anywhere yet.');
    await waitForDraft(page);
    await reloadPastTheGuard(page);

    await page.getByRole('button', { name: 'Restore unsaved changes to Pasted document' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();

    // Nothing has been written to a file, so the dirty state — and the guard
    // that depends on it — has to survive the round trip intact.
    await expect(page.getByTitle('Unsaved changes')).toBeVisible();
    expect(await readDrafts(page)).toHaveLength(1);
  });

  test('keeps a restored document to the one draft row it came from', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'First pass.');
    await waitForDraft(page);
    await reloadPastTheGuard(page);

    await page.getByRole('button', { name: 'Restore unsaved changes to Pasted document' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();

    await page.locator('.cm-content').click();
    await page.keyboard.type('\nSecond pass.\n');

    // Adopting the recovered row rather than minting a new one is what stops a
    // reader who is interrupted twice from being offered their document back
    // twice, with no way to tell the copies apart.
    await expect
      .poll(async () => (await readDrafts(page)).map((draft) => draft.text), { timeout: 10_000 })
      .toEqual([expect.stringContaining('Second pass.')]);
  });
});

test.describe('discarding a draft', () => {
  test('removes it from storage and from the offer', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'Not worth keeping.');
    await waitForDraft(page);
    await reloadPastTheGuard(page);

    await page.getByRole('button', { name: 'Discard unsaved changes to Pasted document' }).click();

    // Declining is a decision, so the text goes rather than sitting in storage
    // waiting to be offered again on the next visit.
    await expect(page.getByRole('region', { name: 'Unsaved work' })).toHaveCount(0);
    await expect.poll(async () => await readDrafts(page)).toEqual([]);
  });

  test('offers nothing on a visit with nothing to recover', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'Unsaved work' })).toHaveCount(0);
  });
});
