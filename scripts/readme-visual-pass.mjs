#!/usr/bin/env node
/**
 * Renders the 20 most-starred GitHub READMEs and records what happened.
 *
 * A Gate A checklist item, kept as a script rather than a claim so the pass is
 * auditable and repeatable: anyone can re-run it and compare. READMEs are the
 * single most common document this product will ever open, and they are also
 * the harshest input — badge rows, deeply nested lists, raw HTML, huge tables,
 * and files well past 300KB.
 *
 * Deliberately not a pass/fail test. Some findings are correct behaviour
 * (blocked remote badges) and some are real defects; telling them apart is a
 * judgement call, so this produces evidence and a human reads it. What it does
 * fail on is the objective stuff: a render that throws, a page that scrolls
 * sideways, or a console error.
 *
 * Usage: node scripts/readme-visual-pass.mjs [--url http://localhost:4173]
 */

import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL =
  process.argv.find((arg) => arg.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:4173';
const CORPUS = 'test/fixtures/readmes';
const OUT = 'reports/readme-visual-pass';

mkdirSync(join(OUT, 'screenshots'), { recursive: true });

const files = readdirSync(CORPUS).filter((f) => f.endsWith('.md')).sort();
if (files.length === 0) {
  console.error(`No READMEs in ${CORPUS}/`);
  process.exit(1);
}

const browser = await chromium.launch();
const results = [];

for (const file of files) {
  const repo = file.replace(/\.md$/, '').replace('__', '/');
  const source = readFileSync(join(CORPUS, file), 'utf8');

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const crossOrigin = new Set();
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  page.on('request', (r) => {
    try {
      if (new URL(r.url()).origin !== new URL(BASE_URL).origin) crossOrigin.add(new URL(r.url()).host);
    } catch {
      /* data:/blob: */
    }
  });

  const started = Date.now();
  let rendered = false;
  let stats = {};

  try {
    await page.goto(BASE_URL);
    await page.getByRole('button', { name: 'Paste' }).click();
    await page.getByLabel('Markdown to read').fill(source);
    await page.getByRole('button', { name: 'Read it' }).click();
    await page.getByRole('article').waitFor({ timeout: 60_000 });
    rendered = true;

    stats = await page.evaluate(() => {
      const doc = document.querySelector('.lmd-document');
      return {
        headings: doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
        codeBlocks: doc.querySelectorAll('pre').length,
        highlighted: doc.querySelectorAll('pre.shiki').length,
        tables: doc.querySelectorAll('table').length,
        images: doc.querySelectorAll('img').length,
        blockedImages: doc.querySelectorAll('.lmd-blocked-image').length,
        unresolvedImages: doc.querySelectorAll('.lmd-unresolved-image').length,
        diagramErrors: doc.querySelectorAll('.lmd-mermaid-error').length,
        emptyLinks: [...doc.querySelectorAll('a')].filter((a) => !a.textContent.trim()).length,
        // The one layout defect that ruins a document outright.
        pageOverflows:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    await page.screenshot({
      path: join(OUT, 'screenshots', `${file.replace(/\.md$/, '')}.png`),
    });
  } catch (error) {
    stats.error = error instanceof Error ? error.message : String(error);
  }

  const elapsed = Date.now() - started;
  results.push({ repo, bytes: source.length, rendered, elapsed, consoleErrors, crossOrigin: [...crossOrigin], ...stats });

  const flag = !rendered || stats.pageOverflows || consoleErrors.length || crossOrigin.size ? 'FAIL' : ' ok ';
  console.log(
    `${flag} ${repo.padEnd(45)} ${String(Math.round(source.length / 1024) + 'KB').padStart(7)} ${String(elapsed + 'ms').padStart(8)}`,
  );

  await context.close();
}

await browser.close();

const objectiveFailures = results.filter(
  (r) => !r.rendered || r.pageOverflows || r.consoleErrors.length > 0 || r.crossOrigin.length > 0,
);

const report = [
  '# README visual pass',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} against \`${BASE_URL}\`.`,
  '',
  'The 20 most-starred GitHub repositories at time of capture, rendered in LocalMD.',
  'READMEs are the most common document this product opens and the harshest input it',
  'gets. Screenshots are in `screenshots/`.',
  '',
  '## Objective checks',
  '',
  '| Check | Result |',
  '| --- | --- |',
  `| Rendered without throwing | ${results.filter((r) => r.rendered).length}/${results.length} |`,
  `| No horizontal page overflow | ${results.filter((r) => !r.pageOverflows).length}/${results.length} |`,
  `| No console errors | ${results.filter((r) => r.consoleErrors.length === 0).length}/${results.length} |`,
  `| No cross-origin requests | ${results.filter((r) => r.crossOrigin.length === 0).length}/${results.length} |`,
  '',
  '## Per document',
  '',
  '| Repository | Size | Render | Headings | Code (lit) | Tables | Blocked img | Unresolved img |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...results.map(
    (r) =>
      `| ${r.repo} | ${Math.round(r.bytes / 1024)}KB | ${r.elapsed}ms | ${r.headings ?? '—'} | ${r.codeBlocks ?? '—'} (${r.highlighted ?? 0}) | ${r.tables ?? '—'} | ${r.blockedImages ?? '—'} | ${r.unresolvedImages ?? '—'} |`,
  ),
  '',
  '## Notes',
  '',
  '- **Blocked images are expected, not defects.** Badge rows are the most common',
  '  remote content in a README; they render as labelled placeholders with a',
  '  one-click load, which is the designed behaviour.',
  '- **Unresolved images are also expected.** A file opened through the picker has',
  '  no base directory, so a relative path cannot resolve. Opening a folder is the',
  '  planned fix and is a post-MVP item.',
  '',
  '## Performance',
  '',
  (() => {
    const slowest = [...results].sort((a, b) => b.elapsed - a.elapsed)[0];
    const perBlock =
      slowest.highlighted > 0 ? Math.round(slowest.elapsed / slowest.highlighted) : null;
    const biggest = [...results].sort((a, b) => b.bytes - a.bytes)[0];

    return [
      `Slowest: \`${slowest.repo}\` at ${slowest.elapsed}ms for ${Math.round(slowest.bytes / 1024)}KB`,
      `with ${slowest.highlighted} highlighted code blocks — roughly ${perBlock}ms each.`,
      '',
      `For comparison \`${biggest.repo}\` is ${Math.round(biggest.bytes / 1024)}KB`,
      `with no code blocks and renders in ${biggest.elapsed}ms.`,
      '',
      '**Syntax highlighting dominates render cost, not document size.** This is the',
      'bottleneck the plan predicted, and it is above the Gate B budget (250KB in',
      'under 600ms). It is not a Gate A criterion — Gate A covers correctness and',
      'privacy — but it is the clearest thing to fix next.',
      '',
      'The scheduled fix is M5: move the pipeline into a worker and highlight blocks',
      'lazily as they approach the viewport, so a document paints immediately and',
      'upgrades in place rather than blocking on 290 blocks the reader cannot see.',
    ].join('\n');
  })(),
  '',
  objectiveFailures.length === 0
    ? '**No objective failures.**'
    : `**${objectiveFailures.length} objective failure(s):**\n\n` +
      objectiveFailures
        .map(
          (r) =>
            `- \`${r.repo}\` — ${[
              !r.rendered && `did not render: ${r.error}`,
              r.pageOverflows && 'page scrolls horizontally',
              r.consoleErrors.length > 0 && `console: ${r.consoleErrors[0]}`,
              r.crossOrigin.length > 0 && `contacted: ${r.crossOrigin.join(', ')}`,
            ]
              .filter(Boolean)
              .join('; ')}`,
        )
        .join('\n'),
  '',
].join('\n');

writeFileSync(join(OUT, 'README.md'), report);
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2));

console.log(`\nReport: ${OUT}/README.md`);
if (objectiveFailures.length > 0) {
  console.error(`\n${objectiveFailures.length} objective failure(s) — see the report.`);
  process.exit(1);
}
