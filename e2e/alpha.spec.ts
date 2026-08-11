import { expect, test } from '@playwright/test';

/**
 * Gate A requirements, asserted.
 *
 * These are checklist items that are easy to claim and easy to quietly lose in
 * a refactor: the privacy page saying what it must say, the alpha marker being
 * visible, and no service worker being registered. Each one is either true in
 * production or the release is not what it says it is.
 */

test.describe('alpha markers', () => {
  test('marks itself as an early build', async ({ page }) => {
    await page.goto('/');

    // Visible on every screen, not only the landing page — a reader who hits a
    // rough edge should never have to wonder whether it is meant to be there.
    await expect(page.getByText('alpha', { exact: true })).toBeVisible();
    await expect(page.getByText(/early build shared for feedback/i)).toBeVisible();
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

test('registers no service worker', async ({ page }) => {
  // Gate A requires PWA to be complete or absent, never partial. A half-shipped
  // service worker is the fastest way to pin readers to a broken build, and it
  // is the one mistake in this project that would be hard to undo remotely.
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const registrations = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 0;
    const active = await navigator.serviceWorker.getRegistrations();
    return active.length;
  });

  expect(registrations).toBe(0);
});
