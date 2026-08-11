#!/usr/bin/env node
/**
 * Enforces the performance budgets from the plan against the real build.
 *
 * Measures the *initial* payload only: the entry chunk plus everything the
 * browser is told to preload alongside it. Lazily-imported chunks are excluded
 * deliberately — they are the mechanism by which the initial payload stays
 * small, so counting them would penalise the fix and reward inlining
 * everything into one file.
 *
 * Budgets are gzip sizes, since that is what users actually download.
 */

import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

const BUDGETS = {
  // Everything needed before a document is opened. The Markdown pipeline is
  // deliberately not in here — see src/app/pipeline-loader.ts.
  'initial JS (gzip)': { limit: 150 * 1024, test: (f) => f.endsWith('.js') },
  'initial CSS (gzip)': { limit: 30 * 1024, test: (f) => f.endsWith('.css') },
};

/**
 * Reads the built index.html to find what actually loads on first paint.
 * Vite emits a modulepreload link for every static dependency of the entry and
 * omits them for dynamic imports, which is exactly the distinction we want.
 */
function initialAssets() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const assets = new Set();

  const patterns = [
    /<script[^>]+src="([^"]+)"/g,
    /<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g,
    /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      if (match[1]) assets.add(match[1].replace(/^\//, ''));
    }
  }

  return [...assets];
}

const assets = initialAssets();
if (assets.length === 0) {
  console.error('✗ Could not find any entry assets in dist/index.html — did the build succeed?');
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let failed = false;

for (const [label, { limit, test }] of Object.entries(BUDGETS)) {
  const matching = assets.filter(test).map((asset) => {
    const path = join(DIST, asset);
    return { asset, size: gzipSync(readFileSync(path)).length };
  });

  const total = matching.reduce((sum, { size }) => sum + size, 0);
  const pct = Math.round((total / limit) * 100);

  if (total > limit) {
    failed = true;
    console.error(`✗ ${label}: ${kb(total)} exceeds budget of ${kb(limit)} (${pct}%)`);
    for (const { asset, size } of matching) console.error(`    ${asset}  ${kb(size)}`);
  } else {
    console.log(`✓ ${label}: ${kb(total)} of ${kb(limit)} (${pct}%)`);
  }
}

// Reported, not enforced. Lazy chunks get their own budgets once the heavy ones
// exist (Shiki and Mermaid in M2). For now the useful signal is simply being
// able to see that the split happened, and how big the deferred work is.
const lazyChunks = readdirSync(join(DIST, 'assets'))
  .filter((file) => file.endsWith('.js'))
  .filter((file) => !assets.some((asset) => asset.endsWith(file)))
  .map((file) => ({ file, size: gzipSync(readFileSync(join(DIST, 'assets', file))).length }))
  .sort((a, b) => b.size - a.size);

if (lazyChunks.length > 0) {
  const total = lazyChunks.reduce((sum, { size }) => sum + size, 0);
  console.log(`\n  deferred: ${kb(total)} across ${lazyChunks.length} lazy chunk(s)`);
  for (const { file, size } of lazyChunks) console.log(`    ${file}  ${kb(size)}`);
}

if (failed) {
  console.error(
    '\nBudgets are in scripts/assert-bundle-budget.mjs. Raising one is a deliberate\n' +
      'decision, not a fix — prefer lazy-loading the dependency that pushed it over.',
  );
  process.exit(1);
}
