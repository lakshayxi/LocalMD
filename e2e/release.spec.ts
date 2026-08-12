import { expect, test } from '@playwright/test';

/**
 * Release requirements, asserted.
 *
 * These are checklist items that are easy to claim and easy to quietly lose in
 * a refactor: the privacy page saying what it must say, the launch surfaces
 * being reachable, and the offline shell being complete. Each one is either
 * true in production or the release is not what it says it is.
 */

test.describe('launch surfaces', () => {
  test('keeps privacy, feedback, and source reachable from every screen', async ({ page }) => {
    await page.goto('/');

    // A reader who hits a rough edge must not have to go looking. These three
    // live in the header, so they are present with and without a document.
    await expect(page.getByRole('button', { name: 'Privacy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Feedback' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Source code on GitHub' })).toBeVisible();
  });

  test('links to the repository and the issue tracker', async ({ page }) => {
    await page.goto('/');

    const source = page.getByRole('link', { name: 'Source code on GitHub' });
    await expect(source).toHaveAttribute('href', /github\.com\/.+\/LocalMD$/);
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer');

    const feedback = page.getByRole('link', { name: 'Feedback' });
    await expect(feedback).toHaveAttribute('href', /github\.com\/.+\/LocalMD\/issues$/);
  });
});

test.describe('privacy page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Privacy' }).click();
  });

  test('states the guarantee and both enforcement layers', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
    await expect(page.getByText(/never uploads your document/i)).toBeVisible();

    // The two layers must be described separately. Collapsing them into one
    // claim would overstate what the weaker layer can promise.
    await expect(page.getByRole('heading', { name: /Content Security Policy/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /image gate/ })).toBeVisible();
    await expect(page.getByText(/structurally prevents/i)).toBeVisible();
  });

  test('admits the limit of the weaker layer', async ({ page }) => {
    // The single most important sentence on the page. If this ever disappears,
    // the page has become marketing.
    await expect(page.getByText(/could still produce a request we did not intend/i)).toBeVisible();
  });

  test('states all three caveats', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Your document.s own URLs/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hosting logs/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /not encrypted by us/ })).toBeVisible();
  });

  test('has a shareable URL that survives a reload', async ({ page }) => {
    expect(page.url()).toContain('#/privacy');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  });

  test('returns to the document without leaving the app', async ({ page }) => {
    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page.getByRole('heading', { name: 'LocalMD' })).toBeVisible();
  });
});

test('registers a service worker and reloads the shell offline', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'service-worker lifecycle is covered once in Chromium');

  await page.goto('/');
  await page.evaluate(async () => {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('service worker did not become ready')), 10_000),
      ),
    ]);
  });
  // clientsClaim stays disabled so a newly installed build never takes over a
  // document mid-session. One reader-controlled navigation establishes the
  // normal controlled state before the network is removed.
  await page.reload({ waitUntil: 'networkidle' });

  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'LocalMD' })).toBeVisible();

    // Prove the cold offline pack supports the real product path, not only a
    // static landing page: parse Markdown in the worker, then load the editor.
    await page.getByRole('button', { name: 'Paste' }).click();
    await page.getByLabel('Markdown to read').fill('# Offline document\n\nStill local.');
    await page.getByRole('button', { name: 'Read it' }).click();
    await expect(page.getByRole('heading', { name: 'Offline document' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
