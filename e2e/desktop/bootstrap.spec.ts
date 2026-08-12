import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openNewDocument(page: Page): Promise<void> {
  await page
    .locator('.lmd-desktop-empty-actions')
    .getByRole('button', { name: 'New document', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('textbox', { name: 'Markdown source of Untitled.md' })).toBeFocused();
}

async function replaceSource(page: Page, markdown: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'Markdown source of Untitled.md' });
  await editor.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await editor.fill(markdown);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
});

test('desktop production root starts in the purpose-built empty shell', async ({ page }) => {
  await expect(page.locator('[data-lmd-desktop-root]')).toBeVisible();
  await expect(page.locator('.lmd-desktop-shell')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No document open' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(
    page
      .locator('.lmd-desktop-empty-actions')
      .getByRole('button', { name: 'Open document', exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .locator('.lmd-desktop-empty-actions')
      .getByRole('button', { name: 'New document', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Privacy' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Paste' })).toHaveCount(0);

  const registrationCount = await page.evaluate(
    async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0,
  );
  expect(registrationCount).toBe(0);
});

test('desktop keyboard commands open the palette and create a document', async ({ page }) => {
  const commandSearch = page.getByRole('button', { name: 'Search commands' });
  await expect(commandSearch.locator('kbd')).toHaveText('⌘K');
  await expect(commandSearch.locator('kbd')).toBeVisible();

  await page.getByRole('button', { name: 'Hide sidebar' }).focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Untitled.md' })).toBeFocused();
});

test('find searches the rendered document and restores focus', async ({ page }) => {
  await openNewDocument(page);
  await replaceSource(
    page,
    '# Search fixture\n\nLocalMD needle appears first.\n\nA second LocalMD needle appears here.',
  );
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByText('A second LocalMD needle appears here.')).toBeVisible();

  const findButton = page.getByRole('button', { name: 'Find in document' });
  await findButton.focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+F' : 'Control+F');

  const input = page.getByRole('searchbox', { name: 'Find text' });
  await expect(input).toBeFocused();
  await input.fill('LocalMD needle');
  await expect(page.locator('.lmd-desktop-find-result')).toHaveText('1 of 2');
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('LocalMD needle');

  await input.press('Enter');
  await expect(page.locator('.lmd-desktop-find-result')).toHaveText('2 of 2');
  await input.press('Shift+Enter');
  await expect(page.locator('.lmd-desktop-find-result')).toHaveText('1 of 2');

  await input.press('Escape');
  await expect(page.getByRole('search', { name: 'Find in document' })).toHaveCount(0);
  await expect(findButton).toBeFocused();
});

test('edit mode keeps CodeMirror search on Command-F', async ({ page }) => {
  await openNewDocument(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+F' : 'Control+F');

  await expect(page.locator('.cm-search').getByRole('textbox', { name: 'Find' })).toBeFocused();
  await expect(page.getByRole('search', { name: 'Find in document' })).toHaveCount(0);
});

test('new document uses the real CodeMirror editor and dirty state', async ({ page }) => {
  await openNewDocument(page);
  await replaceSource(page, '# Desktop document\n\nShared editor state.');

  await expect(page.getByText('Edited', { exact: true })).toBeVisible();
  await expect(page.locator('.lmd-desktop-shell')).toHaveAttribute('data-dirty', 'true');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(page.locator('.cm-editor')).toHaveCount(1);
  await expect(page.locator('.cm-editor')).toHaveCSS('font-size', '14px');
});

test('read and edit modes share the real source and renderer', async ({ page }) => {
  await openNewDocument(page);
  const markdown = '# Desktop document\n\nShared renderer state.';
  await replaceSource(page, markdown);

  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const document = page.getByRole('article', { name: 'Document' });
  await expect(document).toBeVisible();
  await expect(document.getByRole('heading', { name: 'Desktop document' })).toBeVisible();
  await expect(document.getByText('Shared renderer state.')).toBeVisible();
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  await expect(document).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.cm-line')).toHaveText([
    '# Desktop document',
    '',
    'Shared renderer state.',
  ]);
});

test('desktop withholds remote images without offering an action blocked by its CSP', async ({
  page,
}) => {
  await openNewDocument(page);
  await replaceSource(page, '![Private diagram](https://example.com/private-diagram.png)');
  await page.getByRole('button', { name: 'Read', exact: true }).click();

  const notice = page.getByRole('status');
  await expect(notice).toContainText('1 remote image withheld');
  await expect(notice).toContainText('example.com');
  await expect(notice).toContainText('Remote images stay off in the desktop app.');
  await expect(notice.getByRole('button', { name: 'Load images' })).toHaveCount(0);
  await expect(page.locator('img[src^="https://"]')).toHaveCount(0);
});

test('unlabelled fenced code is detected locally when confidence is high', async ({ page }) => {
  await openNewDocument(page);
  await replaceSource(
    page,
    [
      '# Automatic syntax',
      '',
      '```',
      'interface DocumentState { dirty: boolean }',
      '```',
      '',
      '```',
      'x = 1',
      '```',
    ].join('\n'),
  );
  await page.getByRole('button', { name: 'Read', exact: true }).click();

  const highlighted = page.locator('.lmd-code-block pre.shiki');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toContainText('interface DocumentState { dirty: boolean }');
  const plain = page.locator('.lmd-code-block pre:not(.shiki)').filter({ hasText: 'x = 1' });
  await expect(plain).toHaveCount(1);
  await expect(page.locator('[data-lmd-desktop-root]')).toHaveScreenshot(
    'desktop-code-detection-light.png',
  );
});

test('split mode contains one real editor and one live preview', async ({ page }) => {
  await openNewDocument(page);
  await replaceSource(page, '# Initial\n');
  await page.getByRole('button', { name: 'Split', exact: true }).click();

  await expect(page.locator('.cm-editor')).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Document' })).toHaveCount(1);
  await replaceSource(page, '# Updated in split\n');
  await expect(page.getByRole('heading', { name: 'Updated in split' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Document' })).toHaveCount(1);
});

test('mode control uses real arrow-key navigation', async ({ page }) => {
  await openNewDocument(page);
  const read = page.getByRole('button', { name: 'Read', exact: true });
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  const split = page.getByRole('button', { name: 'Split', exact: true });

  await read.focus();
  await page.keyboard.press('ArrowRight');
  await expect(edit).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(split).toBeFocused();
  await page.keyboard.press('Home');
  await expect(read).toBeFocused();
  await expect(read).toHaveAttribute('aria-pressed', 'true');
});

test('representative desktop states have no detectable accessibility violations', async ({ page }) => {
  let results = await new AxeBuilder({ page }).include('[data-lmd-desktop-root]').analyze();
  expect(results.violations).toEqual([]);

  await openNewDocument(page);
  results = await new AxeBuilder({ page }).include('[data-lmd-desktop-root]').analyze();
  expect(results.violations).toEqual([]);

  await replaceSource(page, '# Accessible document\n\nReadable content.');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  results = await new AxeBuilder({ page }).include('[data-lmd-desktop-root]').analyze();
  expect(results.violations).toEqual([]);
});

test('appearance control switches and persists an explicit theme', async ({ page }) => {
  const appearance = page.getByRole('button', { name: 'Use dark appearance' });
  await expect(appearance).toBeVisible();
  await appearance.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Use light appearance' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await new AxeBuilder({ page }).include('[data-lmd-desktop-root]').analyze();
  expect(results.violations).toEqual([]);
});

test('desktop chrome reserves the native drag region', async ({ page }) => {
  await expect(page.locator('.lmd-desktop-titlebar')).toHaveAttribute(
    'data-tauri-drag-region',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Hide sidebar' })).not.toHaveAttribute(
    'data-tauri-drag-region',
  );
});

test('high-value production desktop states remain visually stable', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const app = page.locator('[data-lmd-desktop-root]');
  await expect(app).toHaveScreenshot('desktop-empty-large-light.png');

  await openNewDocument(page);
  await replaceSource(
    page,
    '# LocalMD for macOS\n\nThe document remains the visual center of gravity.\n\n## Quiet by default\n\nEditing controls appear only when they help.',
  );
  await expect(app).toHaveScreenshot('desktop-edit-large-light.png');

  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LocalMD for macOS' })).toBeVisible();
  await expect(app).toHaveScreenshot('desktop-read-large-light.png');

  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.lmd-desktop-split')).toBeVisible();
  await expect(app).toHaveScreenshot('desktop-split-large-light.png');

  await page.getByRole('button', { name: 'Use dark appearance' }).click();
  await page.getByRole('button', { name: 'Show commands' }).click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await expect(app).toHaveScreenshot('desktop-palette-large-dark.png');
});

test('real rendered document keeps a restrained standard-width reading column', async ({ page }) => {
  await openNewDocument(page);
  await replaceSource(
    page,
    '# LocalMD for macOS\n\nThe document remains the visual center of gravity.\n\n## Quiet by default\n\nEditing controls appear only when they help.',
  );
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const document = page.getByRole('article', { name: 'Document' });
  await expect(document).toBeVisible();
  const documentBox = await document.boundingBox();
  const windowSize = page.viewportSize();
  expect(documentBox).not.toBeNull();
  expect(windowSize).not.toBeNull();
  expect(documentBox!.width).toBeLessThan(800);
  expect(documentBox!.width).toBeLessThan(windowSize!.width * 0.75);
});
