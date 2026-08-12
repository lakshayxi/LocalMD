#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist-desktop';
const FORBIDDEN_FILES = new Set(['sw.js', 'sw-kill.js', 'manifest.webmanifest']);
const FORBIDDEN_TEXT = ['virtual:pwa-register', 'data-localmd-design-graph'];

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

if (!existsSync(DIST)) {
  console.error(`✗ ${DIST}/ not found. Run the desktop frontend build first.`);
  process.exit(1);
}

const files = walk(DIST);
const violations = [];
const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8');

if (!/assets\/desktop-[^/"']+\.js/.test(indexHtml)) {
  violations.push('dist-desktop/index.html does not reference the desktop composition entry');
}

if (
  !files.some(
    (file) => /\.js$/.test(file) && readFileSync(file, 'utf8').includes('data-lmd-desktop-root'),
  )
) {
  violations.push('dist-desktop does not contain the desktop root marker');
}

for (const file of files) {
  const name = file.split('/').at(-1);
  if (name && FORBIDDEN_FILES.has(name)) violations.push(relative(process.cwd(), file));

  if (/\.(?:html|js|css)$/.test(file)) {
    const source = readFileSync(file, 'utf8');
    for (const marker of FORBIDDEN_TEXT) {
      if (source.includes(marker)) {
        violations.push(`${relative(process.cwd(), file)} contains ${marker}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('✗ Desktop artifact contains browser-only or development-only content:');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(
  `✓ Desktop artifact excludes service workers and design fixtures (${files.length} files checked)`,
);
