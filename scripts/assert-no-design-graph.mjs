import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const buildDirectories = process.argv.slice(2);
const targets = buildDirectories.length > 0 ? buildDirectories : ['dist'];
const forbiddenText = [
  'data-localmd-design-graph',
  '/src/design-graph/',
  'design-graph.html',
  'data-lmd-desktop-root',
];

function collectFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}

for (const directory of targets) {
  if (!existsSync(directory)) {
    throw new Error(`Build directory does not exist: ${directory}`);
  }

  const files = collectFiles(directory);
  const forbiddenFile = files.find((file) => file.endsWith('design-graph.html'));
  if (forbiddenFile) {
    throw new Error(`Development-only design graph was emitted: ${forbiddenFile}`);
  }

  for (const file of files.filter((path) => /\.(?:css|html|js|json|map)$/.test(path))) {
    const contents = readFileSync(file, 'utf8');
    const marker = forbiddenText.find((text) => contents.includes(text));
    if (marker) {
      throw new Error(`Development-only design graph marker ${marker} found in ${file}`);
    }
  }
}

console.log(`Verified ${targets.join(', ')} contain no design graph artifacts.`);
