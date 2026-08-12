# LocalMD

**Markdown stays local.**

LocalMD reads and edits Markdown without sending your document anywhere. No
uploads, no accounts, no document backend. Use it two ways: as a website in
your browser, or as a native macOS application. Both share the same privacy
guarantee and most of the same code.

## Get LocalMD

- **Browser.** Open <https://localmd-12t.pages.dev>. This needs no install
  and no download.
- **macOS (Apple Silicon).** Download the disk image from
  [GitHub Releases](https://github.com/lakshayxi/LocalMD/releases). Read
  [reports/macos/distribution.md](reports/macos/distribution.md) first. This
  release is an unsigned beta, and that page explains what that means and
  how to open it.

> **Browser status: v0.1.0.** Reading, editing, Split, save-in-place where the
> browser permits it, download fallback everywhere else, draft recovery,
> external-change protection, recents, and multi-tab warnings all ship. The
> hosted URL serves the tagged release.
>
> The development build adds an offline app shell and reader-controlled updates
> for the next release. The hosted v0.1.0 URL does not include them yet. See
> [`reports/gate-b-release.md`](reports/gate-b-release.md) for the release
> evidence and the known limitations.
> [Tell us what's broken](https://github.com/lakshayxi/LocalMD/issues).

> **macOS status: 0.2.0 unsigned beta.** LocalMD for macOS is a Tauri 2
> application. It has native Open, Save, Save As, and close/quit protection
> for unsaved work. This project has no Apple Developer Program membership
> yet. Because of this, macOS Gatekeeper needs one extra step on first
> launch. Read [reports/macos/distribution.md](reports/macos/distribution.md)
> for the install steps.

Every release verifies the privacy claim against the live browser deployment.
See [reports/gate-a-production.md](reports/gate-a-production.md) for the
response headers as actually served. Run `scripts/verify-production.mjs` to
check this yourself.

## What it does

The browser and macOS apps share this core feature set. Bullets marked
**(browser)** or **(macOS)** apply to one platform only.

- Opens Markdown by picker, drop, paste, recent file, or a new blank document.
- Renders CommonMark and GFM, heading links, tables, task lists, footnotes,
  syntax-highlighted code, KaTeX math, and Mermaid diagrams.
- Switches between Read, Edit, and Split without losing the editor state.
- **(browser)** Saves back to picker-opened files where the File System
  Access API is available; other browsers download the same bytes with a
  Markdown filename.
- **(macOS)** Saves back to the file through native Open and Save dialogs,
  and blocks a native window close or Quit with unsaved changes.
- Preserves LF or CRLF, a UTF-8 BOM, and the presence or absence of the final
  newline across edits and saves.
- Keeps bounded, local drafts and offers recovery after an interrupted session.
- **(browser)** Reloads the app shell offline and installs updates only
  after you accept a prompt.
- Opens documents over 2 MiB in read-only fast mode until you choose full rendering.
- Refuses to silently overwrite a file that changed on disk.
- **(browser)** Warns when the same file stays open in several LocalMD tabs at once.
- Provides a command palette, keyboard shortcuts, a wide-screen outline,
  deep links, reading preferences, and print styles.

| Browser path | Save behaviour |
| --- | --- |
| Chrome and Edge desktop | Save in place after permission; Save As adopts the new file |
| Firefox and Safari | Download fallback; the UI calls it **Download** |

## A note on math delimiters

Single-dollar inline math (`$x$`) is **off**. With it on, `$5.00 and $6.00`
parses as a formula and renders as mangled glyphs — and prices, `$PATH`, and
`${VAR}` are far more common in the documents this targets than inline LaTeX is.
Use `$$x$$` for inline math; display math (`$$` on its own lines) stays the same.

Silently corrupting ordinary prose is a worse failure for a reader than
requiring an extra dollar sign.

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
> LocalMD checks this origin for app updates and caches only its own app files.
> It never sends your document or drafts.

This rests on two mechanisms with **different strengths**, and it matters that
they are not conflated:

1. **`connect-src 'none'` (structural).** No `fetch`, `XHR`, `WebSocket`,
   `sendBeacon`, or EventSource can leave the page — even if a dependency is
   compromised. Verifiable in devtools.
2. **The renderer's image gate (code).** The renderer blocks remote images
   and media unless you explicitly allow them. This is application code, not
   policy, because `img-src https:` has to stay permitted for the opt-in to
   work at all. **A bug here could still produce a cross-origin request.**

The second layer is code, not policy. So a test backs it, not a promise:
[`e2e/privacy.spec.ts`](e2e/privacy.spec.ts) asserts zero cross-origin
requests against a real production build, on every browser, on every commit.
That test is the actual guarantee.

Three honest caveats:

- **Your document's own URLs.** A remote image in your Markdown would make *your
  browser* contact that host. Blocked by default; you can opt in per document.
- **Static hosting logs.** Whoever serves the app sees that you loaded it — IP,
  user agent, asset paths — like any website. It never sees a file.
- **Local storage is not encrypted by us.** Drafts live in your browser's
  IndexedDB, readable by anything with access to your browser profile.

No analytics. No error reporting. No CDN. No third-party runtime dependencies.

## Performance

Chromium renders the release corpus from the production build. On the
recorded Apple M4 / 16GB sign-off machine, the latest strict run measured:

| Document | Result | Budget |
| --- | ---: | ---: |
| 45KB real README | 104ms | <150ms |
| 250KB corpus | 438ms | <600ms |
| 1MB torture document | 1877ms, no task over 50ms | <2500ms, no task over 50ms |

Run `PERF_STRICT=1 npm run perf` for the release thresholds. CI uses a looser
regression ceiling because shared-runner load is not a stable benchmark. The
corpus, method, tradeoffs, and machine details are in
[`reports/gate-b-performance.md`](reports/gate-b-performance.md).

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
| `npm run perf` | §16 render budgets on the committed corpus. `PERF_STRICT=1` asserts the targets themselves |
| `npm run lint` | ESLint, including module boundary enforcement |
| `npm run typecheck` | TypeScript project references |
| `npm run desktop:dev` | Start the Tauri macOS application in development mode |
| `npm run build:desktop` | Build and inspect the dedicated desktop frontend artifact |
| `npm run desktop:build -- --target aarch64-apple-darwin` | Build the local Apple Silicon `.app` and `.dmg` |
| `npm run test:desktop` | Test the production desktop composition |
| `npm run test:design` | Test design graph interactions, screenshots, and accessibility |

### macOS distribution

v0.2.0 distributes as an unsigned, not-notarized disk image through GitHub
Releases. Download it with `curl`, not a browser. `curl` never applies the
quarantine flag a browser download does, so Gatekeeper never blocks the
first launch. A browser download also works. But current macOS answers this
ad hoc-signed build with a "damaged, move to Trash" warning, not an "Open
Anyway" button. The warning is misleading. The app is not damaged. Run
`xattr -dr com.apple.quarantine` on the installed app to clear it. Signed
and notarized releases, and a Homebrew Cask, wait on an Apple Developer
Program membership for this project.

Read the complete [macOS distribution procedure](reports/macos/distribution.md)
for the install steps, what signing and notarization actually change, and the
deferred signed-release path.

### Releasing

Publishing a GitHub Release runs
[`.github/workflows/release.yml`](.github/workflows/release.yml): build and
check, then e2e on Chromium, Firefox, and WebKit. The tag has to match
`package.json`.

This workflow does not deploy the browser app. Cloudflare Pages builds and
deploys it directly through its own Git integration, on every push to
`main`. Run `scripts/verify-production.mjs` yourself against the live origin
to check a deploy landed correctly.

`workflow_dispatch` re-runs the same checks against a chosen ref without
cutting a new release.

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

ESLint enforces import direction: `core` imports nothing internal and no
React/DOM; `platform`, `render`, and `editor` may import `core`; `app` may
import anything. Cross-module imports use the `@/` alias; `../../` escapes are
banned so nobody can route around the rules.

## Testing

Beyond the usual, three suites carry unusual weight:

- **[`e2e/privacy.spec.ts`](e2e/privacy.spec.ts)** — zero cross-origin requests.
  A release blocker at every gate.
- **[`test/security/xss-payloads.ts`](test/security/xss-payloads.ts)** — the
  sanitizer corpus. Markdown counts as untrusted input, and the expected failure mode is
  allowlist drift: loosening the schema one feature request at a time until it
  means nothing. This corpus is what stops that.
- **[`scripts/assert-no-external-urls.mjs`](scripts/assert-no-external-urls.mjs)**
  — fails the build if any third-party URL reaches `dist/`, catching transitive
  additions a `package.json` review would miss.
- **[`e2e/save.spec.ts`](e2e/save.spec.ts)** — proves the download bytes on
  Firefox and WebKit and uses a real Chromium OPFS handle to prove that Save As
  adopts its new file before the next save.

The release-specific evidence lives in
[`reports/gate-b-release.md`](reports/gate-b-release.md),
[`reports/gate-b-manual-checklist.md`](reports/gate-b-manual-checklist.md), and
[`reports/gate-b-performance.md`](reports/gate-b-performance.md).

## License

MIT
