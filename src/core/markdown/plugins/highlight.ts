import type { Element, Root } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Syntax highlighting with Shiki.
 *
 * Three decisions worth keeping:
 *
 * 1. **Dual theme via CSS variables.** Shiki emits both palettes as
 *    `--shiki-light` / `--shiki-dark` custom properties on each token, and CSS
 *    picks one. Switching theme therefore costs nothing — no re-highlight, no
 *    re-render, no flash. Highlighting a large document twice to toggle a theme
 *    would be the single worst interaction in the reader.
 *
 * 2. **The JavaScript regex engine, not Oniguruma.** Oniguruma is a WASM binary
 *    of a few hundred KB. The JS engine handles every grammar we precache and
 *    keeps the highlighting chunk to grammars alone.
 *
 * 3. **Grammars load per language, on demand.** An explicit map rather than a
 *    glob, so each grammar is its own chunk and a document containing one Python
 *    block downloads one Python grammar.
 *
 * Unknown languages are not an error. A fence tagged `notarealanguage` renders
 * as plain code, silently — the reader wanted to read it, not to be told off.
 *
 * **The `-default` themes, not the plain `github-light` / `github-dark` pair.**
 * The older ones are GitHub's pre-2022 palette, and their keyword red (#d73a49)
 * reaches only 4.14:1 against our code background — an AA failure on the most
 * common token in most snippets. The current themes were rebuilt for contrast
 * and clear AA. Verified by the axe pass in e2e/a11y.spec.ts; do not swap back.
 */

/**
 * Languages we can highlight. Deliberately a curated list rather than the full
 * Shiki bundle, which is several megabytes: these cover what appears in
 * technical documentation, and anything else degrades to plain text.
 */
const GRAMMARS = {
  bash: () => import('@shikijs/langs/bash'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  css: () => import('@shikijs/langs/css'),
  diff: () => import('@shikijs/langs/diff'),
  docker: () => import('@shikijs/langs/docker'),
  go: () => import('@shikijs/langs/go'),
  graphql: () => import('@shikijs/langs/graphql'),
  html: () => import('@shikijs/langs/html'),
  java: () => import('@shikijs/langs/java'),
  javascript: () => import('@shikijs/langs/javascript'),
  json: () => import('@shikijs/langs/json'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  markdown: () => import('@shikijs/langs/markdown'),
  php: () => import('@shikijs/langs/php'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  sql: () => import('@shikijs/langs/sql'),
  swift: () => import('@shikijs/langs/swift'),
  toml: () => import('@shikijs/langs/toml'),
  tsx: () => import('@shikijs/langs/tsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  xml: () => import('@shikijs/langs/xml'),
  yaml: () => import('@shikijs/langs/yaml'),
} as const;

/** Common fence tags that mean the same grammar. */
const ALIASES: Record<string, keyof typeof GRAMMARS> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  js: 'javascript',
  jsx: 'tsx',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  yml: 'yaml',
  md: 'markdown',
  dockerfile: 'docker',
  'c++': 'cpp',
  cs: 'csharp',
  htm: 'html',
  golang: 'go',
  kt: 'kotlin',
};

function resolveLanguage(name: string): keyof typeof GRAMMARS | null {
  const lower = name.toLowerCase();
  if (lower in GRAMMARS) return lower as keyof typeof GRAMMARS;
  return ALIASES[lower] ?? null;
}

interface CodeBlock {
  node: Element;
  language: keyof typeof GRAMMARS;
  code: string;
}

function textOf(node: Element): string {
  let text = '';
  visit(node, 'text', (child: { value: string }) => {
    text += child.value;
  });
  return text;
}

/** Finds fenced code blocks whose language we can actually highlight. */
function collectBlocks(tree: Root): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'pre') return;

    const code = node.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'code',
    );
    if (!code) return;

    const classes = code.properties?.['className'];
    if (!Array.isArray(classes)) return;

    const tag = classes
      .filter((name): name is string => typeof name === 'string')
      .find((name) => name.startsWith('language-'))
      ?.slice('language-'.length);
    if (!tag) return;

    const language = resolveLanguage(tag);
    if (!language) return;

    blocks.push({ node, language, code: textOf(code) });
  });

  return blocks;
}

export function highlight() {
  return async (tree: Root): Promise<void> => {
    const blocks = collectBlocks(tree);
    // Nothing highlightable: do not pay for Shiki at all.
    if (blocks.length === 0) return;

    const languages = [...new Set(blocks.map((block) => block.language))];

    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark, ...grammars] =
      await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('@shikijs/themes/github-light-default'),
        import('@shikijs/themes/github-dark-default'),
        ...languages.map((language) => GRAMMARS[language]()),
      ]);

    const highlighter = await createHighlighterCore({
      themes: [light.default, dark.default],
      langs: grammars.map((grammar) => grammar.default),
      engine: createJavaScriptRegexEngine(),
    });

    try {
      for (const block of blocks) {
        const result = highlighter.codeToHast(block.code.replace(/\n$/, ''), {
          lang: block.language,
          themes: { light: 'github-light-default', dark: 'github-dark-default' },
          // Emits both palettes as CSS custom properties instead of baking one
          // in, so the theme toggle is a CSS switch rather than a re-render.
          defaultColor: false,
          cssVariablePrefix: '--lmd-code-',
        });

        const pre = result.children[0];
        if (pre?.type === 'element') {
          block.node.tagName = pre.tagName;
          block.node.properties = pre.properties;
          block.node.children = pre.children;
        }
      }
    } finally {
      // Each render builds a highlighter; without this the grammars and their
      // compiled regexes stay reachable and memory climbs with every keystroke
      // once the editor lands in M4.
      highlighter.dispose();
    }
  };
}
