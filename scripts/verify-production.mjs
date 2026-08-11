#!/usr/bin/env node
/**
 * Verifies a live LocalMD deployment.
 *
 * The e2e suite runs against `vite preview`, which serves the built files but
 * does *not* apply `dist/_headers` — so everything about the real response
 * headers is unverified until it runs against the deployed origin. That gap is
 * exactly where a privacy claim would quietly become false: the meta tag would
 * still be there, the app would still look right, and `connect-src 'none'`
 * would not actually be enforced.
 *
 * This is the check that closes it. Run it against production after every
 * deploy, not just the first.
 *
 * Usage: node scripts/verify-production.mjs https://localmd.pages.dev
 */

import { chromium } from '@playwright/test';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/verify-production.mjs <url>');
  process.exit(1);
}

const origin = new URL(target).origin;
const checks = [];
const record = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`\nVerifying ${origin}\n`);

// ---------- Response headers ----------

const response = await fetch(target, { redirect: 'follow' });
const header = (name) => response.headers.get(name) ?? '';

record('responds 200', response.status === 200, `status ${response.status}`);
record('served over https', origin.startsWith('https://'), origin);

const csp = header('content-security-policy');
record('sends a Content-Security-Policy response header', csp.length > 0);

// The load-bearing directive. Its absence would not break anything visible,
// which is precisely why it needs asserting against the real deployment.
const required = [
  ["connect-src 'none'", 'blocks all programmatic network egress'],
  ["object-src 'none'", 'blocks plugin content'],
  ["base-uri 'none'", 'stops relative URLs being rerouted'],
  ["form-action 'none'", 'stops form submission anywhere'],
  ["frame-ancestors 'none'", 'blocks clickjacking; header-only, never in a meta tag'],
  ["script-src 'self'", 'no inline or third-party script'],
];
for (const [directive, why] of required) {
  record(`CSP: ${directive}`, csp.includes(directive), why);
}
record(
  "CSP does not allow inline script",
  !/script-src[^;]*'unsafe-inline'/.test(csp),
  'unsafe-inline in script-src would void the policy',
);

for (const [name, expected] of [
  ['referrer-policy', 'no-referrer'],
  ['x-content-type-options', 'nosniff'],
]) {
  record(`${name}: ${expected}`, header(name).toLowerCase().includes(expected));
}

// ---------- Runtime behaviour ----------

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const crossOrigin = [];
const consoleErrors = [];
page.on('request', (request) => {
  const url = request.url();
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  try {
    if (new URL(url).origin !== origin) crossOrigin.push(url);
  } catch {
    /* not a resolvable URL */
  }
});
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

await page.goto(target, { waitUntil: 'networkidle' });

record('app boots', await page.getByRole('heading', { name: 'LocalMD' }).isVisible());
record('no console errors', consoleErrors.length === 0, consoleErrors[0] ?? '');
record('loads nothing cross-origin', crossOrigin.length === 0, crossOrigin[0] ?? '');

// Gate A requires the PWA to be complete or absent, never partial. A
// half-shipped service worker is the one mistake here that is hard to undo
// remotely, because it can pin readers to a broken build.
const workers = await page.evaluate(async () =>
  'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
);
record('no service worker registered', workers === 0, `${workers} found`);

// The three surfaces a reader needs when something looks wrong. They live in
// the header on every screen, so losing one is a silent regression: the app
// still boots, still renders, and quietly stops being answerable.
record(
  'exposes privacy, feedback, and source',
  (await page.getByRole('button', { name: 'Privacy' }).isVisible()) &&
    (await page.getByRole('link', { name: 'Feedback' }).isVisible()) &&
    (await page.getByRole('link', { name: 'Source code on GitHub' }).isVisible()),
);

// ---------- Privacy page ----------

await page.goto(`${target.replace(/\/$/, '')}/#/privacy`, { waitUntil: 'networkidle' });
const privacyText = await page.locator('body').innerText();

record(
  'privacy page reachable at a shareable URL',
  await page.getByRole('heading', { name: 'Privacy', level: 1 }).isVisible(),
);
record(
  'privacy page states both enforcement layers',
  /structurally prevents/i.test(privacyText) && /image gate/i.test(privacyText),
);
record(
  'privacy page admits the limit of the weaker layer',
  /could still produce a request we did not intend/i.test(privacyText),
);
record(
  'privacy page states all three caveats',
  /own URLs/i.test(privacyText) &&
    /Hosting logs/i.test(privacyText) &&
    /not encrypted by us/i.test(privacyText),
);

// ---------- Document rendering, against the live origin ----------

await page.goto(target, { waitUntil: 'networkidle' });
crossOrigin.length = 0;

await page.getByRole('button', { name: 'Paste' }).click();
await page.getByLabel('Markdown to read').fill(
  '# Live check\n\n' +
    '![badge](https://img.shields.io/badge/a-b-green)\n' +
    '![pixel](https://analytics.example.com/p.gif?doc=secret)\n\n' +
    '```typescript\nconst x: number = 1;\n```\n',
);
await page.getByRole('button', { name: 'Read it' }).click();
await page.getByRole('article').waitFor();
await page.waitForLoadState('networkidle');

record('renders a document', await page.getByRole('heading', { name: 'Live check' }).isVisible());
record('highlighting works on the live build', (await page.locator('pre.shiki').count()) > 0);
record(
  'opening a document with remote images contacts nobody',
  crossOrigin.length === 0,
  crossOrigin[0] ?? '',
);
record('remote images are withheld', (await page.locator('.lmd-blocked-image').count()) === 2);

await browser.close();

// ---------- Result ----------

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

if (failed.length > 0) {
  console.error(`\n${failed.length} FAILED:`);
  for (const c of failed) console.error(`  - ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  process.exit(1);
}
console.log('\nProduction checks passed.');
