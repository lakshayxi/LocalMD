import { expect, test, type Page } from '@playwright/test';
import { recordCrossOriginRequests } from './helpers/network';
import { BASE_URL } from '../playwright.config';

/**
 * The privacy guarantee, asserted rather than promised.
 *
 * A release blocker at every gate. Runs against the production build (see
 * playwright.config.ts) because the dev server relaxes the CSP for HMR and so
 * proves nothing about the policy that ships.
 */

const APP_ORIGIN = new URL(BASE_URL).origin;

const DOCUMENT_WITH_REMOTE_CONTENT = `# Report

![badge](https://img.shields.io/badge/build-passing-green)
![tracker](https://analytics.example.com/pixel.gif?doc=private-id-12345)

A [link to somewhere](https://example.com) and a local one: ![diagram](./diagram.png)

<img src="https://evil.example.com/beacon.png">
`;

async function openPastedDocument(page: Page, markdown: string) {
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.getByLabel('Markdown to read').fill(markdown);
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.getByRole('article')).toBeVisible();
}

test('the app shell makes no cross-origin requests', async ({ page }) => {
  const network = recordCrossOriginRequests(page, APP_ORIGIN);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LocalMD' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(network.summary(), 'the app contacted a third-party origin').toEqual([]);
});

test('rendering a document full of remote references contacts nobody', async ({ page }) => {
  // The load-bearing test. CSP cannot cover this case: img-src must permit
  // https: for the opt-in to exist, so only the renderer's image gate stands
  // between a hostile document and a tracking pixel firing on open.
  const network = recordCrossOriginRequests(page, APP_ORIGIN);

  await page.goto('/');
  await openPastedDocument(page, DOCUMENT_WITH_REMOTE_CONTENT);
  await page.waitForLoadState('networkidle');

  expect(network.summary(), 'opening a document leaked a request').toEqual([]);
  await expect(page.locator('.lmd-document img')).toHaveCount(0);
});

test('with the opt-in enabled, contacts only the hosts the document names', async ({ page }) => {
  // The other half of the guarantee. Blocking by default is easy to verify;
  // what matters equally is that *allowing* stays narrowly scoped — it must
  // load the document's own images and nothing else. A telemetry ping, a font
  // fetch, or an error report riding along on the opt-in would be exactly the
  // leak the product claims to make impossible.
  const network = recordCrossOriginRequests(page, APP_ORIGIN);

  await page.goto('/');
  await openPastedDocument(page, DOCUMENT_WITH_REMOTE_CONTENT);
  await page.getByRole('button', { name: 'Load images' }).click();
  await expect(page.locator('.lmd-blocked-image')).toHaveCount(0);
  await page.waitForLoadState('networkidle');

  const contacted = new Set(network.attempts.map((a) => new URL(a.url).host));
  const declaredInDocument = new Set([
    'img.shields.io',
    'analytics.example.com',
    'evil.example.com',
  ]);

  for (const host of contacted) {
    expect(
      declaredInDocument.has(host),
      `contacted ${host}, which the document never referenced`,
    ).toBe(true);
  }

  // Every request must be an image load. Anything else — a fetch, a script,
  // a beacon — means something other than the image gate opened a connection.
  for (const attempt of network.attempts) {
    expect(attempt.resourceType, `unexpected ${attempt.resourceType} request`).toBe('image');
  }
});

test('names the host that would be contacted, and loads only on request', async ({ page }) => {
  await page.goto('/');
  await openPastedDocument(page, DOCUMENT_WITH_REMOTE_CONTENT);

  // Naming the host is what turns the friction into an explanation. A generic
  // "content blocked" message would teach the reader nothing.
  const notice = page.getByRole('status');
  await expect(notice).toContainText('withheld');
  await expect(notice).toContainText('img.shields.io');

  await notice.getByRole('button', { name: 'Load images' }).click();

  await expect(page.locator('.lmd-blocked-image')).toHaveCount(0);
  await expect(page.getByText('Remote content on')).toBeVisible();
  // The relative image is unresolvable rather than withheld — a different
  // problem, and one this control must not silently claim to have fixed.
  await expect(page.locator('.lmd-unresolved-image')).toHaveCount(1);
});

test('opening a second document resets the remote-content decision', async ({ page }) => {
  await page.goto('/');
  await openPastedDocument(page, DOCUMENT_WITH_REMOTE_CONTENT);
  await page.getByRole('button', { name: 'Load images' }).click();
  await expect(page.getByText('Remote content on')).toBeVisible();

  await page.getByRole('button', { name: 'Close document' }).click();
  await openPastedDocument(page, DOCUMENT_WITH_REMOTE_CONTENT);

  // Trusting your own README must not imply trusting the next file someone
  // sends you. The reset is the security property, not a convenience.
  await expect(page.getByRole('status')).toContainText('withheld');
  await expect(page.locator('.lmd-document img')).toHaveCount(0);
});

test('renders hostile markdown inert', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as unknown as { __xss: boolean }).__xss = false;
  });

  await page.goto('/');
  await openPastedDocument(
    page,
    [
      '<script>window.__xss = true;</script>',
      '<img src=x onerror="window.__xss = true">',
      '[click](javascript:window.__xss = true)',
      '<iframe src="https://evil.example.com"></iframe>',
    ].join('\n\n'),
  );

  const executed = await page.evaluate(() => (window as unknown as { __xss: boolean }).__xss);
  expect(executed, 'injected script executed').toBe(false);
  expect(errors).toEqual([]);

  await expect(page.locator('.lmd-document iframe')).toHaveCount(0);
  await expect(page.locator('.lmd-document a[href^="javascript:"]')).toHaveCount(0);
});

test('ships a Content-Security-Policy that forbids programmatic egress', async ({ page }) => {
  const response = await page.goto('/');
  const html = (await response?.text()) ?? '';

  // `vite preview` does not apply dist/_headers, so the meta tag is what's
  // observable here. Header delivery is the deploy platform's job and is
  // verified against the real deployment on the release checklist.
  const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];

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
