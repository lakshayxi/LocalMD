import { expect, test } from '@playwright/test';
import { recordCrossOriginRequests } from './helpers/network';
import { BASE_URL } from '../playwright.config';

/**
 * The privacy guarantee, asserted rather than promised.
 *
 * Per the plan this is a release blocker at every gate. It runs against the
 * production build (see playwright.config.ts) because the dev server relaxes
 * the CSP for HMR.
 *
 * M0 covers the app shell only. As the renderer lands in M1/M2 these tests
 * extend to cover documents containing remote images, external links, and math
 * — the cases where a gating bug would actually leak.
 */

const APP_ORIGIN = new URL(BASE_URL).origin;

test('the app shell makes no cross-origin requests', async ({ page }) => {
  const network = recordCrossOriginRequests(page, APP_ORIGIN);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LocalMD' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(network.summary(), 'the app contacted a third-party origin').toEqual([]);
});

test('ships a Content-Security-Policy that forbids programmatic egress', async ({ page }) => {
  const response = await page.goto('/');
  const html = (await response?.text()) ?? '';

  // `vite preview` does not apply dist/_headers, so the meta tag is what's
  // observable here. Header delivery is the deploy platform's job and is
  // verified against the real deployment on the release checklist.
  const policy = html.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/,
  )?.[1];

  expect(policy, 'no CSP meta tag in the built index.html').toBeTruthy();
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'none'");
  expect(policy).toContain("form-action 'none'");
  expect(policy).toContain("script-src 'self'");
  expect(policy, 'inline script must never be allowed in production').not.toContain(
    "script-src 'self' 'unsafe-inline'",
  );
});

test('emits deploy headers including frame-ancestors', async () => {
  // frame-ancestors is ignored inside a meta tag, so it only exists in _headers.
  // Reading the built artifact directly is the only way to cover it.
  const { readFileSync } = await import('node:fs');
  const headers = readFileSync('dist/_headers', 'utf8');

  expect(headers).toContain("frame-ancestors 'none'");
  expect(headers).toContain("connect-src 'none'");
  expect(headers).toContain('Referrer-Policy: no-referrer');
  expect(headers).toContain('X-Content-Type-Options: nosniff');
});
