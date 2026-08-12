# Contributing to LocalMD

## Development

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server. Relaxed CSP — never verify privacy behavior here |
| `npm run build` | Typecheck, build, assert no third-party URLs reached `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | E2E across Chromium, Firefox, WebKit against a production build |
| `npm run lint` | ESLint, including module boundary enforcement |
| `npm run typecheck` | TypeScript project references |
| `npm run desktop:dev` | Start the Tauri macOS application in development mode |
| `npm run desktop:build -- --target aarch64-apple-darwin` | Build the local `.app` and `.dmg` |
| `npm run test:desktop` | Test the production desktop composition |

Publishing a GitHub Release runs the build/lint/test gate and the full E2E
matrix as a release-time record. It does not deploy — Cloudflare Pages
deploys the browser app on its own, through its Git integration, on every
push to `main`. See [.github/workflows/release.yml](.github/workflows/release.yml).

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
  desktop/    the macOS shell, native dialogs, close/quit protection
  styles/     tokens, typography, themes, print
```

ESLint enforces the import direction: `core` imports nothing internal and no
React/DOM; `platform`, `render`, and `editor` may import `core`; `app` and
`desktop` may import anything. Cross-module imports use the `@/` alias.

## Testing

- [`e2e/privacy.spec.ts`](e2e/privacy.spec.ts) — zero cross-origin requests. A release blocker at every gate.
- [`test/security/xss-payloads.ts`](test/security/xss-payloads.ts) — the sanitizer corpus, guarding against allowlist drift.
- [`scripts/assert-no-external-urls.mjs`](scripts/assert-no-external-urls.mjs) — fails the build if any third-party URL reaches `dist/`.
- [`e2e/save.spec.ts`](e2e/save.spec.ts) — proves download bytes and Save As adoption with a real Chromium OPFS handle.

More evidence: [reports/gate-b-release.md](reports/gate-b-release.md),
[reports/gate-b-manual-checklist.md](reports/gate-b-manual-checklist.md),
[reports/gate-b-performance.md](reports/gate-b-performance.md).
