import { expect, test } from '@playwright/test';

/**
 * Proves the deploy path works end to end — build, serve, boot, render — on
 * every browser in the Tier 1/2 matrix. Exists from M0 so that a break in the
 * pipeline is never mistaken for a break in the product.
 */

test('boots and renders without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'LocalMD' })).toBeVisible();
  // A CSP violation surfaces as a console error, so this doubles as a check
  // that the production policy doesn't break the app's own assets.
  expect(errors).toEqual([]);
});
