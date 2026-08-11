# LocalMD

**Markdown stays local.**

A browser-based Markdown reader — with editing when you need it — that never
sends your document anywhere. No uploads, no accounts, no document backend.

> **Status: M1.** You can open a Markdown file — by drop, picker, or paste —
> and read it. CommonMark and GFM render with heading anchors, task lists,
> footnotes, and tables, in light and dark themes. Syntax highlighting, math,
> and Mermaid arrive in M2; editing and saving in M4.

## Why

`.md` files are now first-class documents — READMEs, specs, `CLAUDE.md`,
`AGENTS.md`, generated plans, LLM output — and there is still no good way to
just *read* one. The options are an editor, a git host, a browser extension, or
raw text. LocalMD is a fourth option: a URL, five seconds, no install.

It competes with online Markdown tools on trust, and with editors on speed and
zero-install access.

## Privacy

The guarantee, stated precisely:

> LocalMD never uploads your document. Parsing, rendering, and editing happen
> entirely in your browser. There is no upload endpoint and no document backend.
> After the first load, LocalMD makes no network requests of its own.

This rests on two mechanisms with **different strengths**, and it matters that
they are not conflated:

1. **`connect-src 'none'` (structural).** No `fetch`, `XHR`, `WebSocket`,
   `sendBeacon`, or EventSource can leave the page — even if a dependency is
   compromised. Verifiable in devtools.
2. **The renderer's image gate (code).** Remote images and media are blocked
   unless you explicitly allow them. This is application code, not policy,
   because `img-src https:` has to stay permitted for the opt-in to work at all.
   **A bug here could still produce a cross-origin request.**

Because the second layer is code rather than policy, it is backed by a test
rather than a promise: [`e2e/privacy.spec.ts`](e2e/privacy.spec.ts) asserts zero
cross-origin requests against a real production build, on every browser, on
every commit. That test is the actual guarantee.

Three honest caveats:

- **Your document's own URLs.** A remote image in your Markdown would make *your
  browser* contact that host. Blocked by default; you can opt in per document.
- **Static hosting logs.** Whoever serves the app sees that you loaded it — IP,
  user agent, asset paths — like any website. It never sees a file.
- **Local storage isn't encrypted by us.** Drafts live in your browser's
  IndexedDB, readable by anything with access to your browser profile.

No analytics. No error reporting. No CDN. No third-party runtime dependencies.

## Development

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server. **Relaxed CSP** — never verify privacy behavior here |
| `npm run build` | Typecheck, build, assert no third-party URLs reached `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | E2E across Chromium, Firefox, WebKit against a production build |
| `npm run lint` | ESLint, including module boundary enforcement |
| `npm run typecheck` | TypeScript project references |

### A note on the dev server

`vite dev` relaxes the CSP so HMR can work (inline scripts, a websocket back to
the dev server). **The dev server proves nothing about the policy that ships.**
Anything verifying CSP or network behavior must run against `vite preview` or a
real build. See [`csp.config.mjs`](csp.config.mjs).

## Architecture

Single Vite app, no monorepo — but with lint-enforced module boundaries, so
`src/core` stays extractable to a package by moving the directory.

```
src/
  core/       zero DOM, zero React — the future npm package
  platform/   browser APIs (files, persistence, workers), still no React
  render/     hast -> React, block memoization, component overrides
  editor/     CodeMirror 6
  app/        shell, state, header, palette, dialogs
  styles/     tokens, typography, themes, print
```

Import direction is enforced by ESLint: `core` imports nothing internal and no
React/DOM; `platform`, `render`, and `editor` may import `core`; `app` may
import anything. Cross-module imports use the `@/` alias; `../../` escapes are
banned so nobody can route around the rules.

## Testing

Beyond the usual, three suites carry unusual weight:

- **[`e2e/privacy.spec.ts`](e2e/privacy.spec.ts)** — zero cross-origin requests.
  A release blocker at every gate.
- **[`test/security/xss-payloads.ts`](test/security/xss-payloads.ts)** — the
  sanitizer corpus. Markdown is untrusted input, and the expected failure mode is
  allowlist drift: loosening the schema one feature request at a time until it
  means nothing. This corpus is what stops that.
- **[`scripts/assert-no-external-urls.mjs`](scripts/assert-no-external-urls.mjs)**
  — fails the build if any third-party URL reaches `dist/`, catching transitive
  additions a `package.json` review would miss.

## License

MIT
