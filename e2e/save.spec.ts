import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Saving, and the Split layout.
 *
 * The download path is the one that can be proved end to end here: Playwright
 * can capture the file the browser actually wrote and compare its bytes. That
 * covers Safari and Firefox, where download *is* saving.
 *
 * Save-in-place cannot be driven — the File System Access picker is native
 * chrome. The picker UI stays outside Playwright's reach, but Chromium's OPFS
 * returns a real FileSystemFileHandle with the same write and identity surface.
 * The Save As wiring below uses one of those handles end to end; the adapter's
 * byte-level edge cases remain covered in test/files/save.test.ts.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const DOCUMENT = '# Title\n\nA paragraph.\n\n## Section\n\nMore text.\n';

/**
 * Opens a document by dropping a real file on the page.
 *
 * The paste box cannot carry CRLF: an HTML textarea normalises every line break
 * in its value to LF, per spec, so a document opened that way never had CRLF to
 * preserve and a round-trip test through it would pass while proving nothing.
 * A File carries its bytes intact.
 */
async function openDropped(page: Page, name: string, text: string) {
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
  await expect(page.getByRole('article')).toBeVisible();
}

async function openPasted(page: Page, text = DOCUMENT) {
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(text);
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('article')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();
});

test.describe('download fallback', () => {
  // Chromium has the File System Access API, so Save opens a native picker
  // there rather than downloading. The download path is Safari and Firefox.
  test.skip(
    ({ browserName }) => browserName === 'chromium',
    'Chromium saves through the file picker, which cannot be driven',
  );

  test('writes exactly what was opened when nothing was edited', async ({ page }) => {
    await openPasted(page);

    const download = page.waitForEvent('download');
    await page.keyboard.press(`${MOD}+s`);
    const file = await download;

    const path = await file.path();
    expect(await readFile(path, 'utf8')).toBe(DOCUMENT);
  });

  test('writes the edits, and gives the file a Markdown name', async ({ page }) => {
    await openPasted(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('\nAppended line.\n');

    const download = page.waitForEvent('download');
    await page.keyboard.press(`${MOD}+s`);
    const file = await download;

    // "Pasted document" is the right thing to read in the header and the wrong
    // thing to write to disk.
    expect(file.suggestedFilename()).toBe('Pasted document.md');
    expect(await readFile(await file.path(), 'utf8')).toContain('Appended line.');
  });

  test('preserves CRLF through an edit and a save', async ({ page }) => {
    // The whole-file-diff failure, end to end: the editor works in LF, and the
    // file has to come back the way it went in.
    const crlf = '# Title\r\n\r\nFirst line.\r\n';
    await openDropped(page, 'crlf.md', crlf);

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('Second line.\n');

    const download = page.waitForEvent('download');
    await page.keyboard.press(`${MOD}+s`);
    const written = await readFile(await (await download).path(), 'utf8');

    expect(written).toContain('Second line.');
    // Every newline, including the one on the line just typed, is CRLF.
    expect(written).not.toMatch(/[^\r]\n/);
    expect(written.startsWith('# Title\r\n')).toBe(true);
  });

  test('confirms the save, naming the file', async ({ page }) => {
    await openPasted(page);

    const download = page.waitForEvent('download');
    await page.keyboard.press(`${MOD}+s`);
    await download;

    // A save with no acknowledgement is a save you do not trust — least of all
    // a download, which lands somewhere the reader cannot see from here.
    await expect(page.getByRole('status')).toContainText('Downloaded Pasted document.md');
  });

  test('clears the dirty marker once the work is durable', async ({ page }) => {
    await openPasted(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.type('x');
    await expect(page.getByTitle('Unsaved changes')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.keyboard.press(`${MOD}+s`);
    await download;

    await expect(page.getByTitle('Unsaved changes')).toHaveCount(0);
  });
});

test.describe('save as with a real browser handle', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'OPFS FileSystemFileHandle coverage is Chromium-only',
  );

  test('adopts the chosen file, then saves subsequent edits back to it', async ({ page }) => {
    const targetName = 'save-as-target.md';

    // Replace only the browser-owned picker UI. The handle itself is real: it
    // comes from Chromium's origin-private filesystem, survives structured
    // clone, and exercises createWritable/getFile/isSameEntry rather than a
    // test double. This covers the application seam the native dialog hides.
    await page.addInitScript((name) => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => {
          const count = Number(sessionStorage.getItem('localmd-test-save-picker-calls') ?? '0');
          sessionStorage.setItem('localmd-test-save-picker-calls', String(count + 1));
          const root = await navigator.storage.getDirectory();
          return root.getFileHandle(name, { create: true });
        },
      });
    }, targetName);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Open Markdown' })).toBeVisible();

    await page.evaluate(async (name) => {
      const directory = await navigator.storage.getDirectory();
      await directory.removeEntry(name).catch(() => undefined);
    }, targetName);

    await openPasted(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('\nFirst saved version.\n');

    await page.keyboard.press(`${MOD}+k`);
    await page.getByRole('option', { name: /Save as/ }).click();
    await expect(page.getByRole('status')).toContainText(`Saved ${targetName}`);
    await expect(page.getByText(targetName, { exact: true })).toBeVisible();

    const firstWrite = await page.evaluate(async (name) => {
      const directory = await navigator.storage.getDirectory();
      return (await (await directory.getFileHandle(name)).getFile()).text();
    }, targetName);
    expect(firstWrite).toContain('First saved version.');

    // Save As must re-point the open document. A later ⌘S should write to
    // the adopted handle without opening the picker again or touching the old
    // in-memory source.
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('Second saved version.\n');
    await page.keyboard.press(`${MOD}+s`);
    await expect(page.getByRole('status')).toContainText(`Saved ${targetName}`);

    const result = await page.evaluate(async (name) => {
      const directory = await navigator.storage.getDirectory();
      const text = await (await (await directory.getFileHandle(name)).getFile()).text();
      return {
        text,
        pickerCalls: Number(sessionStorage.getItem('localmd-test-save-picker-calls')),
      };
    }, targetName);

    expect(result.text).toContain('First saved version.');
    expect(result.text).toContain('Second saved version.');
    expect(result.pickerCalls).toBe(1);

    await page.evaluate(async (name) => {
      const directory = await navigator.storage.getDirectory();
      await directory.removeEntry(name);
    }, targetName);
  });
});

test.describe('new document', () => {
  test('opens directly in a focused editor', async ({ page }) => {
    await page.getByRole('button', { name: 'New', exact: true }).click();

    await expect(page.getByText('Untitled.md', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const editor = page.getByRole('textbox', { name: 'Markdown source of Untitled.md' });
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();

    await page.keyboard.type('# First heading');
    await expect(page.getByTitle('Unsaved changes')).toBeVisible();
  });
});

test.describe('split', () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test('shows the editor and the preview together', async ({ page }) => {
    await openPasted(page);
    await page.getByRole('button', { name: 'Split', exact: true }).click();

    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByRole('article')).toBeVisible();
  });

  test('updates the preview as you type', async ({ page }) => {
    await openPasted(page);
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('\n## Live heading\n');

    // Debounced, so this is deliberately an auto-waiting assertion rather than
    // an immediate one.
    await expect(page.getByRole('heading', { name: 'Live heading' })).toBeVisible();
  });

  test('is not offered where it will not fit', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await openPasted(page);

    // A control that cannot be used teaches nothing, and there is no room to
    // explain why in a 40px header.
    await expect(page.getByRole('button', { name: 'Split', exact: true })).toHaveCount(0);
  });

  test('leaves Split when the window becomes too narrow', async ({ page }) => {
    await openPasted(page);
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.locator('.lmd-split')).toBeVisible();

    await page.setViewportSize({ width: 900, height: 900 });

    // Otherwise the reader is stranded in a layout whose control just vanished.
    await expect(page.locator('.lmd-split')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toBeVisible();
  });
});

test.describe('mode switching', () => {
  test('keeps edits when moving between modes', async ({ page }) => {
    await openPasted(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('\n## Survives\n');

    await page.getByRole('button', { name: 'Read', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Survives' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('Survives');
  });
});
