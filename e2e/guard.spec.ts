import { expect, test, type Page } from '@playwright/test';
import { readDrafts } from './helpers/drafts';

/**
 * The navigation guard: what happens to unsaved work when the page goes away.
 *
 * Both halves are provable here, and they prove different things. The
 * `beforeunload` dialog is the interruption — the only thing that can stop a
 * reload — and Playwright can catch it. The draft flush is the net for every
 * teardown that never fires `beforeunload` at all, and it is verified by
 * reading what actually landed in IndexedDB rather than by trusting that a
 * listener ran.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const DOCUMENT = '# Title\n\nA paragraph.\n';

async function openPasted(page: Page, text = DOCUMENT) {
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(text);
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('article')).toBeVisible();
}

/** Opens a document the way a reader most often does with one already open. */
async function dropFile(page: Page, name: string, text: string) {
  await page.evaluate(
    ({ name: filename, text: contents }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([contents], filename, { type: 'text/markdown' }));
      document
        .querySelector('.lmd-drop-root')
        ?.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true }));
    },
    { name, text },
  );
}

async function typeSomething(page: Page, text = 'An unsaved edit.') {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(`\n${text}\n`);
  await expect(page.getByTitle('Unsaved changes')).toBeVisible();
}

/**
 * The transition the browser guarantees to announce before a teardown.
 *
 * Simulated rather than provoked, because actually closing the tab would take
 * the page we need to read the result from with it. `visibilityState` is a
 * prototype getter, so an own property shadows it for the dispatch.
 */
async function hideTab(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
});

test.describe('leaving the page', () => {
  test('interrupts a close that would lose unsaved work', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page);

    let asked = false;
    page.on('dialog', async (dialog) => {
      asked = dialog.type() === 'beforeunload';
      await dialog.dismiss();
    });

    await page.close({ runBeforeUnload: true });
    await expect.poll(() => asked).toBe(true);
  });

  test('does not interrupt a close with nothing to lose', async ({ page }) => {
    await openPasted(page);

    let asked = false;
    page.on('dialog', async (dialog) => {
      asked = true;
      await dialog.dismiss();
    });

    // A prompt on the way out of a document you only read would train the
    // reader to click through the one that matters.
    await page.close({ runBeforeUnload: true });
    expect(asked).toBe(false);
  });
});

test.describe('draft flush', () => {
  test('writes unsaved work when the tab is hidden', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'Survives the tab closing.');

    await hideTab(page);

    await expect
      .poll(async () => (await readDrafts(page)).map((draft) => draft.text))
      .toEqual([expect.stringContaining('Survives the tab closing.')]);
  });

  test('writes nothing for a document that was only read', async ({ page }) => {
    await openPasted(page);
    await hideTab(page);

    // The store holds unsaved work and nothing else. Reading a document must
    // not put its text into browser storage.
    await page.waitForTimeout(250);
    expect(await readDrafts(page)).toEqual([]);
  });

  test('keeps one row however often the tab is hidden', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'First.');

    for (let round = 0; round < 3; round += 1) await hideTab(page);
    await expect.poll(async () => (await readDrafts(page)).length).toBe(1);
  });

  test('lets go of the draft once the work is saved', async ({ page }) => {
    // Chromium saves through the native picker, which cannot be driven; the
    // download path is the observable save on the other two engines.
    test.skip(
      test.info().project.name === 'chromium',
      'Chromium saves through the file picker, which cannot be driven',
    );

    await openPasted(page);
    await typeSomething(page, 'Will be saved.');
    await hideTab(page);
    await expect.poll(async () => (await readDrafts(page)).length).toBe(1);

    const download = page.waitForEvent('download');
    await page.keyboard.press(`${MOD}+s`);
    await download;

    // Text that has been written to a file must not stay behind in storage.
    await expect.poll(async () => await readDrafts(page)).toEqual([]);
  });
});

test.describe('closing the document', () => {
  test('asks before discarding unsaved work', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page);

    // Playwright dismisses an unhandled dialog, which is the reader saying no.
    await page.getByRole('button', { name: 'Close document' }).click();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByTitle('Unsaved changes')).toBeVisible();
  });

  test('closes when the reader confirms', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Close document' }).click();

    await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
    // Confirming is a decision, not an accident, so nothing is left behind to
    // offer back later.
    await expect.poll(async () => await readDrafts(page)).toEqual([]);
  });

  test('asks before another document replaces unsaved work', async ({ page }) => {
    await openPasted(page);
    await typeSomething(page, 'Not finished yet.');

    // Dropping a file over an edit loses exactly what a tab close would, so it
    // has to ask the same question. Unhandled, so the reader has said no.
    await dropFile(page, 'other.md', '# Something else\n');

    await expect(page.locator('.cm-content')).toContainText('Not finished yet.');
    await expect(page.getByTitle('Unsaved changes')).toBeVisible();
  });

  test('closes a document with nothing unsaved without asking', async ({ page }) => {
    await openPasted(page);

    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });

    await page.getByRole('button', { name: 'Close document' }).click();
    await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
    expect(asked).toBe(false);
  });
});
