import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKDOWN_DIR = join(import.meta.dirname, 'markdown');

export interface Fixture {
  /** Filename without extension, e.g. "kitchen-sink". */
  name: string;
  path: string;
  source: string;
}

/**
 * Loads every Markdown fixture. Pipeline tests iterate this so that dropping a
 * new .md file into test/fixtures/markdown/ is enough to extend coverage —
 * there is no registry to update.
 */
export function loadMarkdownFixtures(): Fixture[] {
  return readdirSync(MARKDOWN_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const path = join(MARKDOWN_DIR, file);
      return { name: file.replace(/\.md$/, ''), path, source: readFileSync(path, 'utf8') };
    });
}

export function loadMarkdownFixture(name: string): Fixture {
  const fixture = loadMarkdownFixtures().find((f) => f.name === name);
  if (!fixture) throw new Error(`No Markdown fixture named "${name}"`);
  return fixture;
}
