#!/usr/bin/env node
/**
 * Fails the build if any third-party URL survives into dist/.
 *
 * LocalMD's privacy claim depends on there being no CDN, no remote fonts, no
 * analytics, and no error reporting — not as a policy someone remembers, but as
 * a property of the artifact. A dependency that quietly adds a CDN reference in
 * a minor version would otherwise ship silently.
 *
 * This checks the *shipped bundle*, so it catches transitive additions that a
 * package.json review would miss.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const DIST = 'dist';
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.map']);

/**
 * URLs that may legitimately appear as literal strings in the bundle.
 *
 * This check cannot tell a fetched URL from an inert one — a URL inside an
 * error message looks identical to a script src. So every exemption must state
 * why it is never requested, and the runtime proof stays with
 * e2e/privacy.spec.ts, which observes actual network traffic.
 *
 * Adding an entry here is a security-relevant change. Justify it or self-host.
 */
const ALLOWED = [
  { prefix: 'http://www.w3.org/', why: 'XML/SVG namespace identifiers; never resolved.' },
  { prefix: 'https://www.w3.org/', why: 'XML/SVG namespace identifiers; never resolved.' },
  {
    prefix: 'https://react.dev/errors/',
    why: 'React embeds a docs link in minified error text. Rendered as a string, never fetched.',
  },
];

/** URLs the document itself may reference at runtime are NOT covered here —
 *  those live in user content, not in our bundle. */
const URL_PATTERN = /https?:\/\/[^\s"'`<>)\\]+/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

let distFiles;
try {
  distFiles = walk(DIST);
} catch {
  console.error(`✗ ${DIST}/ not found — run the build first.`);
  process.exit(1);
}

const findings = [];

for (const file of distFiles) {
  if (!TEXT_EXTENSIONS.has(extname(file))) continue;

  const contents = readFileSync(file, 'utf8');
  const lines = contents.split('\n');

  lines.forEach((line, index) => {
    for (const match of line.matchAll(URL_PATTERN)) {
      const url = match[0];
      if (ALLOWED.some(({ prefix }) => url.startsWith(prefix))) continue;
      // The CSP itself names schemes, not hosts; skip the policy string.
      if (line.includes('Content-Security-Policy')) continue;
      findings.push({ file: relative(process.cwd(), file), line: index + 1, url });
    }
  });
}

if (findings.length > 0) {
  console.error(`✗ Found ${findings.length} third-party URL(s) in ${DIST}/:\n`);
  for (const { file, line, url } of findings) {
    console.error(`  ${file}:${line}\n    ${url}`);
  }
  console.error(
    '\nLocalMD must load nothing from a third party. Self-host the asset, or add the\n' +
      'origin to ALLOWED in scripts/assert-no-external-urls.mjs if it is a namespace\n' +
      'string that is never fetched.',
  );
  process.exit(1);
}

console.log(`✓ No third-party URLs in ${DIST}/ (${distFiles.length} files checked)`);
