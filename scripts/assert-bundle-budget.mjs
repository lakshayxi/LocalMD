#!/usr/bin/env node
/**
 * Enforces the performance budgets from the plan against the real build.
 *
 * The point is to notice the day a dependency doubles the entry bundle, not to
 * micro-manage bytes. Budgets are gzip sizes, since that's what users download.
 *
 * These cover the app shell only. Lazy chunks (Mermaid, KaTeX, Shiki grammars)
 * are excluded by design — they're the reason the shell can stay small — and
 * get their own budgets once they exist.
 */

import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const DIST = 'dist';

const BUDGETS = {
  // Everything needed before a document is opened.
  'entry JS (gzip)': { limit: 150 * 1024, extensions: ['.js', '.mjs'] },
  'entry CSS (gzip)': { limit: 30 * 1024, extensions: ['.css'] },
};

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(DIST);
let failed = false;

for (const [label, { limit, extensions }] of Object.entries(BUDGETS)) {
  const matching = files.filter((f) => extensions.includes(extname(f)));
  const total = matching.reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const pct = Math.round((total / limit) * 100);

  if (total > limit) {
    failed = true;
    console.error(`✗ ${label}: ${kb(total)} exceeds budget of ${kb(limit)} (${pct}%)`);
    for (const f of matching) {
      console.error(`    ${f}  ${kb(gzipSync(readFileSync(f)).length)}`);
    }
  } else {
    console.log(`✓ ${label}: ${kb(total)} of ${kb(limit)} (${pct}%)`);
  }
}

if (failed) {
  console.error(
    '\nBudgets are in scripts/assert-bundle-budget.mjs. Raising one is a deliberate\n' +
      'decision, not a fix — prefer lazy-loading the dependency that pushed it over.',
  );
  process.exit(1);
}
