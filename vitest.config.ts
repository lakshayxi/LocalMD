import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    // Node by default: src/core and src/platform logic shouldn't need a DOM.
    // Component tests (M3/M4) opt into jsdom per-file via `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // e2e/ is Playwright's; picking it up here produces confusing failures.
    exclude: ['node_modules', 'dist', 'e2e'],
  },
});
