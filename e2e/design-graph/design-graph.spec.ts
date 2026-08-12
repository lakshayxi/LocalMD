import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('control states use real pointer and keyboard interactions', async ({ page }) => {
  await page.goto('/design-graph.html?fixture=controls&theme=light&width=standard');

  const quiet = page.getByRole('button', { name: 'Quiet' });
  const bordered = page.getByRole('button', { name: 'Bordered' });
  const readMode = page.getByRole('button', { name: 'Read', exact: true });
  const editMode = page.getByRole('button', { name: 'Edit', exact: true });

  await quiet.hover();
  await quiet.click();
  await page.keyboard.press('Tab');
  await expect(bordered).toBeFocused();

  await readMode.focus();
  await page.keyboard.press('ArrowRight');
  await expect(editMode).toBeFocused();
  await expect(editMode).toHaveAttribute('aria-pressed', 'true');

  await expect(page.locator('[data-fixture="controls"]')).toHaveScreenshot('controls-focus-light.png');
});

test('sidebar exposes selected, dirty, missing, truncated, hover, and focus states', async ({
  page,
}) => {
  await page.goto('/design-graph.html?fixture=sidebar-items&theme=dark&width=narrow');

  const notes = page.getByRole('button', { name: /notes\.md/ });
  const unavailable = page.getByRole('button', { name: /AGENTS\.md/ });
  const longName = page.getByRole('button', { name: /a-document-name-that-is-long/ });

  await expect(unavailable).toBeDisabled();
  await notes.hover();
  await notes.click();
  await page.keyboard.press('Tab');
  await expect(longName).toBeFocused();

  await expect(page.locator('[data-fixture="sidebar-items"]')).toHaveScreenshot(
    'sidebar-states-dark.png',
  );
});

test('design graph does not register a browser service worker', async ({ page }) => {
  await page.goto('/design-graph.html?fixture=typography');

  const registrations = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return [];
    return navigator.serviceWorker.getRegistrations();
  });

  expect(registrations).toHaveLength(0);
});

test('command palette supports queries, keyboard selection, disabled commands, and closing', async ({
  page,
}) => {
  await page.goto('/design-graph.html?fixture=palette-open&theme=light&width=standard');

  const search = page.getByRole('combobox', { name: 'Search commands' });
  await expect(search).toBeFocused();
  await expect(page.getByRole('option', { name: /Save As/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  await search.fill('split');
  await expect(page.getByRole('option', { name: 'Switch to Split mode' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.fill('publish');
  await expect(page.getByRole('status')).toHaveText('No commands match “publish”.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
});

test('document find exposes real query and navigation states', async ({ page }) => {
  await page.goto('/design-graph.html?fixture=document-find&theme=light&width=standard');

  const input = page.getByRole('searchbox', { name: 'Find text' });
  await expect(input).toBeFocused();
  await expect(page.locator('.lmd-desktop-find-result')).toHaveText('2 of 3');
  await page.getByRole('button', { name: 'Next match' }).click();
  await expect(page.locator('.lmd-desktop-find-result')).toHaveText('3 of 3');
  await input.fill('');
  await expect(page.locator('.lmd-desktop-find-result')).toHaveText('Type to find');

  await input.fill('document');
  await expect(page.locator('[data-fixture="document-find"]')).toHaveScreenshot(
    'document-find-standard-light.png',
  );
});

test('contextual toolbar uses arrow-key navigation and skips disabled actions', async ({ page }) => {
  await page.goto('/design-graph.html?fixture=toolbar-disabled&theme=dark&width=standard');

  const bold = page.getByRole('button', { name: 'Bold' });
  const italic = page.getByRole('button', { name: 'Italic' });
  const code = page.getByRole('button', { name: 'Inline code' });

  await expect(italic).toBeDisabled();
  await bold.focus();
  await page.keyboard.press('ArrowRight');
  await expect(code).toBeFocused();
});

test('desktop shell has stable light and dark reading states', async ({ page }) => {
  await page.goto('/design-graph.html?fixture=shell-read&theme=light&width=standard');
  await expect(page.locator('[data-fixture="shell-read"]')).toHaveScreenshot(
    'shell-read-standard-light.png',
  );

  await page.goto('/design-graph.html?fixture=shell-collapsed&theme=dark&width=narrow');
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
  await expect(page.locator('[data-fixture="shell-collapsed"]')).toHaveScreenshot(
    'shell-collapsed-narrow-dark.png',
  );

  await page.goto('/design-graph.html?fixture=shell-loading&theme=light&width=standard');
  await expect(page.locator('.lmd-desktop-main')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-fixture="shell-loading"]')).toHaveScreenshot(
    'shell-loading-light.png',
  );

  await page.goto('/design-graph.html?fixture=shell-error&theme=light&width=standard');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-fixture="shell-error"]')).toHaveScreenshot(
    'shell-error-light.png',
  );

  await page.goto('/design-graph.html?fixture=palette-open&theme=dark&width=wide');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await expect(page.locator('[data-fixture="palette-open"]')).toHaveScreenshot(
    'palette-open-wide-dark.png',
  );
});

test('desktop shell exposes deterministic conflict and drag states', async ({ page }) => {
  await page.goto('/design-graph.html?fixture=shell-external');
  await expect(page.getByRole('alert')).toContainText('changed outside LocalMD');

  await page.goto('/design-graph.html?fixture=shell-drag');
  await expect(page.getByText('Drop to open')).toBeVisible();
});
