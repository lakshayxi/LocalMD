import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Module boundaries.
 *
 * The layering below is the whole reason this project isn't a monorepo: it buys
 * real boundaries without workspace overhead, and `src/core` stays extractable
 * to a package by moving the directory.
 *
 *   core      -> imports nothing internal, and no React/DOM. Pure logic.
 *   platform  -> may import core. Browser APIs live here, still no React.
 *   render    -> may import core.
 *   editor    -> may import core.
 *   app       -> may import anything.
 *
 * Cross-module imports must use the `@/` alias so these patterns can see them;
 * `../../` escapes are banned outright so nobody can route around the rules.
 */
const LAYERS = {
  core: ['@/platform/*', '@/render/*', '@/editor/*', '@/app/*'],
  platform: ['@/render/*', '@/editor/*', '@/app/*'],
  render: ['@/platform/*', '@/editor/*', '@/app/*'],
  editor: ['@/platform/*', '@/render/*', '@/app/*'],
};

const layerConfigs = Object.entries(LAYERS).map(([layer, forbidden]) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: forbidden,
            message: `src/${layer} may not import from that layer. See the boundary map in eslint.config.js.`,
          },
        ],
      },
    ],
  },
}));

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Escaping two levels up means crossing a module boundary while dodging
      // the layer rules below. Use the @/ alias instead.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['../../*'], message: 'Use the @/ alias for cross-module imports.' }] },
      ],
    },
  },

  ...layerConfigs,

  {
    // core must stay portable: no React, no DOM. This is a lint rule rather than
    // a tsconfig `lib` restriction only because core doesn't have its own tsconfig
    // yet — when it becomes a package, the type system enforces this instead.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB'].map(
          (name) => ({ name, message: 'src/core must stay DOM-free.' }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/core must stay React-free.' },
            { name: 'react-dom', message: 'src/core must stay React-free.' },
          ],
          patterns: [
            {
              group: LAYERS.core,
              message: 'src/core may not import from other layers.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.{mjs,js}', '*.config.ts', 'scripts/**', 'e2e/**'],
    languageOptions: { globals: globals.node },
    rules: { 'no-restricted-imports': 'off' },
  },
);
