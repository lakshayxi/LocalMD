import type { Root } from 'hast';

/**
 * Syntax highlighting, per block, off the first-paint path.
 *
 * This used to be a pipeline plugin that highlighted every fence before the
 * document could be rendered at all. The trace that came out of the Gate B perf
 * run is why it is not any more: on a 45KB README with a single `ts` fence,
 * highlighting cost **172ms of a 250ms render** — and almost none of that was
 * the block. It was Shiki's JavaScript regex engine compiling the grammar on
 * first use, inside a highlighter that the plugin built and then `dispose()`d on
 * every single render. The document waited for a compile it then threw away.
 *
 * Two decisions follow from that, and both are load-bearing:
 *
 * 1. **One highlighter for the life of the session.** Grammars compile once.
 *    The disposal it replaces was there to stop memory climbing per keystroke,
 *    which a single cached instance solves better: what is retained is bounded
 *    by the number of distinct languages a reader has actually opened, not by
 *    how many times they have typed.
 *
 * 2. **A block at a time, asked for by the renderer.** Nothing here runs during
 *    the pipeline, so no document waits on highlighting to appear. Code renders
 *    as plain text and upgrades when it is near the viewport — the M5 design,
 *    pulled forward, and the only version of this that keeps a 45KB README
 *    inside its 150ms budget on a cold visit.
 *
 * Three decisions carried over unchanged from the plugin:
 *
 * - **Dual theme via CSS variables.** Shiki emits both palettes as
 *   `--lmd-code-light` / `--lmd-code-dark` on each token and CSS picks one, so
 *   switching theme costs nothing — no re-highlight, no re-render, no flash.
 * - **The JavaScript regex engine, not Oniguruma**, which is a few hundred KB
 *   of WASM for grammars the JS engine handles.
 * - **The `-default` GitHub themes.** Plain `github-light`'s keyword red
 *   (#d73a49) is 4.14:1 on our code background — an AA failure on the most
 *   common token in most snippets. Do not swap back.
 *
 * Unknown languages are not an error. A fence tagged `notarealanguage` stays
 * plain, silently — the reader wanted to read it, not to be told off.
 *
 * Still DOM-free, so this runs in the render worker. Highlighting on the main
 * thread would put that first-use compile straight back into a long task, which
 * is the one thing the 50ms budget cannot afford.
 */

/**
 * Languages we can highlight. A curated list rather than the full Shiki bundle,
 * which is several megabytes: these cover what appears in technical
 * documentation, and each is its own chunk, so a document with one Python block
 * downloads one Python grammar.
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

export type Language = keyof typeof GRAMMARS;
export type HighlightLanguage = Language | 'auto';

/** Common fence tags that mean the same grammar. */
const ALIASES: Record<string, Language> = {
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

export function resolveLanguage(name: string): Language | null {
  const lower = name.toLowerCase();
  if (lower in GRAMMARS) return lower as Language;
  return ALIASES[lower] ?? null;
}

/**
 * Best-effort language detection for an unlabeled fenced block.
 *
 * This intentionally recognizes only strong, local signals. A wrong grammar
 * is more distracting than plain code, so prose and small ambiguous snippets
 * stay unhighlighted. Detection does not load a grammar and never leaves the
 * render worker.
 */
export function detectLanguage(code: string): Language | null {
  const source = code.trim().slice(0, 32 * 1024);
  if (!source || source.length < 4) return null;

  if (source.startsWith('{') || source.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(source);
      if (parsed !== null && typeof parsed === 'object') return 'json';
    } catch {
      // Continue through the conservative language rules below.
    }
  }

  if (/^#!.*\b(?:ba|z|k)?sh\b/m.test(source)) return 'bash';
  if (/^diff --git\s/m.test(source) || (/^@@\s/m.test(source) && /^[-+]\S/m.test(source))) {
    return 'diff';
  }

  if (/<!doctype\s+html|<html\b|<(?:main|section|article|div|span)\b[^>]*>/i.test(source)) {
    return 'html';
  }
  if (/^<\?xml\b|<\w+(?:\s+[^>]*)?>[\s\S]*<\/\w+>$/i.test(source)) return 'xml';

  if (
    /\b(?:interface|type)\s+[A-Z]\w*\s*(?:=|\{)|\b(?:const|let|var)\s+\w+\s*:\s*[A-Za-z_$]/.test(
      source,
    )
  ) {
    return /<\/?[A-Z][A-Za-z0-9.]*(?:\s|\/?>)/.test(source) ? 'tsx' : 'typescript';
  }
  if (
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|\bfunction\s+[A-Za-z_$][\w$]*\s*\(|=>/.test(
      source,
    )
  ) {
    return 'javascript';
  }

  if (
    /^(?:from\s+[\w.]+\s+import\s+|import\s+[\w.]+\s*$)/m.test(source) ||
    /^(?:async\s+)?def\s+\w+\s*\([^)]*\)\s*:/m.test(source) ||
    /^class\s+\w+(?:\([^)]*\))?\s*:/m.test(source)
  ) {
    return 'python';
  }

  if (/\bSELECT\b[\s\S]+\bFROM\b|\bINSERT\s+INTO\b|\bCREATE\s+TABLE\b/i.test(source)) {
    return 'sql';
  }
  if (/^package\s+\w+\s*$/m.test(source) && /\bfunc\s+\w+\s*\(/.test(source)) return 'go';
  if (/\bfn\s+\w+\s*\([^)]*\)|\blet\s+mut\b|^use\s+(?:crate|std)::/m.test(source)) {
    return 'rust';
  }
  if (
    /^import\s+SwiftUI\s*$/m.test(source) ||
    /\bfunc\s+\w+\s*\([^)]*\)\s*(?:->[^{]+)?\{/m.test(source)
  ) {
    return 'swift';
  }
  if (/\b(?:FROM|RUN|CMD|ENTRYPOINT|WORKDIR)\s+\S+/m.test(source)) return 'docker';
  if (/^\s*(?:export\s+)?[A-Z_][A-Z0-9_]*=\S+/m.test(source) && /(?:\$\w+|\$\{\w+\})/.test(source)) {
    return 'bash';
  }
  if (/^[.#]?[\w-]+(?:\s+[.#]?[\w-]+)*\s*\{[\s\S]*\b[\w-]+\s*:\s*[^;{}]+;/m.test(source)) {
    return 'css';
  }
  if (/^\[[\w.-]+\]\s*$/m.test(source) && /^\w[\w.-]*\s*=\s*.+$/m.test(source)) return 'toml';
  if ((source.match(/^\s*[\w.-]+:\s+\S.+$/gm)?.length ?? 0) >= 2) return 'yaml';

  return null;
}

/** Reads the language out of a `language-x` class list, if there is one. */
export function languageOfClassNames(classNames: readonly unknown[]): Language | null {
  const tag = classNames
    .filter((name): name is string => typeof name === 'string')
    .find((name) => name.startsWith('language-'))
    ?.slice('language-'.length);

  return tag ? resolveLanguage(tag) : null;
}

type Highlighter = Awaited<ReturnType<typeof createCore>>;

async function createCore() {
  const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark] =
    await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('@shikijs/themes/github-light-default'),
      import('@shikijs/themes/github-dark-default'),
    ]);

  return createHighlighterCore({
    themes: [light.default, dark.default],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
}

let highlighter: Promise<Highlighter> | null = null;

/**
 * Grammars already asked for, keyed by language.
 *
 * The promise is cached rather than a boolean: a document with thirty Python
 * blocks asks thirty times before the first load resolves, and without this
 * every one of them would import and compile the grammar again.
 */
const grammars = new Map<Language, Promise<void>>();

async function ready(language: Language): Promise<Highlighter> {
  highlighter ??= createCore();
  const core = await highlighter;

  let loading = grammars.get(language);
  if (!loading) {
    loading = GRAMMARS[language]().then((module) => core.loadLanguage(module.default));
    grammars.set(language, loading);
  }
  await loading;

  return core;
}

/**
 * Highlights one block, returning the `pre` Shiki produced.
 *
 * Null when the language is one we do not carry or the grammar fails to load —
 * both mean the same thing to the reader, which is that the code stays plain.
 */
export async function highlightCode(
  requestedLanguage: HighlightLanguage,
  code: string,
): Promise<Root | null> {
  try {
    const language = requestedLanguage === 'auto' ? detectLanguage(code) : requestedLanguage;
    if (!language) return null;
    const core = await ready(language);

    return core.codeToHast(code.replace(/\n$/, ''), {
      lang: language,
      themes: { light: 'github-light-default', dark: 'github-dark-default' },
      // Both palettes as CSS custom properties instead of one baked in, so the
      // theme toggle is a CSS switch rather than a re-render.
      defaultColor: false,
      cssVariablePrefix: '--lmd-code-',
    });
  } catch {
    return null;
  }
}
