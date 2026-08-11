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
  {
    prefix: 'https://github.com/syntax-tree/',
    why: 'hast-util-to-jsx-runtime embeds docs links in error messages. Strings, never fetched.',
  },
  {
    prefix: 'http://www.ibm.com/data/dtd/',
    why: 'A public DTD identifier in parse5\'s doctype table. An identifier, not a fetch target.',
  },
  {
    prefix: 'https://html.spec.whatwg.org/multipage/parsing.html#parse-error-',
    why:
      "parse5 names each parse error after its section of the HTML spec. Interpolated into " +
      'error text, never requested. Present since the render worker started using parse5 to ' +
      'parse KaTeX output, which is what a DOM-free build of that path costs.',
  },
  {
    prefix: 'https://localmd.invalid',
    why:
      'Ours. Used as the base URL for parsing image hosts in core/markdown/plugins/images.ts. ' +
      '.invalid is reserved by RFC 2606 and can never resolve, which is why it was chosen.',
  },

  // Ours, and the only outbound links in the application. They are `href`
  // targets a reader clicks, never anything the page fetches — the distinction
  // this check exists to police is automatic requests, not navigation the user
  // chose. Defined in src/app/links.ts so they stay auditable in one place.
  {
    prefix: 'https://github.com/lakshayxi/LocalMD',
    why: 'Repository and feedback links in the header, landing page, and privacy page. Click-only.',
  },
  {
    prefix: 'https://example.com/private-id.png',
    why:
      'Illustrative example inside the privacy page explaining how a remote image in your ' +
      'own document would leak. Rendered as escaped text in a <code> element, not as a URL.',
  },

  // Mermaid's parser stack (chevrotain, langium, marked) embeds documentation
  // links in thrown error messages. All are string literals in error paths.
  // Note these are deliberately narrow: allowlisting `https://github.com/`
  // wholesale would make this check meaningless.
  {
    prefix: 'https://github.com/mermaid-js/mermaid',
    why: 'Mermaid points at its own issue tracker in error text.',
  },
  {
    prefix: 'https://github.com/chevrotain/',
    why: 'chevrotain (Mermaid parser) links its issues from grammar error messages.',
  },
  {
    prefix: 'https://github.com/markedjs/marked',
    why: 'marked (Mermaid label parser) names its repo in a deprecation warning.',
  },
  {
    prefix: 'https://chevrotain.io/docs/',
    why: 'chevrotain grammar-error messages cite its own docs.',
  },
  {
    prefix: 'https://langium.org/docs/',
    why: 'langium cites its docs when it detects a cyclic service dependency.',
  },
  {
    prefix: 'https://en.wikipedia.org/wiki/',
    why: 'chevrotain cites the LL-parser article when reporting a left-recursion error.',
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
