# Gate B — v0.1.0 release

**Version:** 0.1.0
**Date:** 2026-08-12
**Released commit:** `f7e2cfe` — "release localmd 0.1.0"
**Tag:** `v0.1.0`, placed on the commit that adds this report and a timing fix
to `scripts/verify-production.mjs`. Neither is part of `dist/`, so the tagged
tree's application build is byte-identical to the one deployed below.
**Live:** <https://localmd-12t.pages.dev>
**Deployment:** <https://f852bf1f.localmd-12t.pages.dev>
**CI run:** <https://github.com/lakshayxi/LocalMD/actions/runs/31540922207>

## Outcome

Gate B passes. M4 — open, read, edit, save, recover — is complete and live. The
build behind the tag is the build serving production: the deployment above was
made from the same `dist/` that CI verified at `f7e2cfe`, and the production
verifier was run against the live origin afterwards rather than against a
preview server.

## CI and cross-browser evidence

CI runs typecheck, lint, unit tests, the production build with the third-party
URL assertion, the bundle budget, and the full Playwright suite on every push
to `main`.

| Suite | Result |
| --- | --- |
| Unit (Vitest) | 215 passed, 15 files |
| E2E (Chromium, Firefox, WebKit) + perf | 288 passed, 27 skipped |
| Typecheck, lint | clean |
| `assert-no-external-urls` | no third-party URLs in `dist/` (218 files) |

The 27 skipped are browser-gated: File System Access paths do not exist on
Firefox and WebKit, and their equivalent — that saving degrades to a download
rather than failing — is asserted on those browsers instead.

## Production verification

`node scripts/verify-production.mjs https://localmd-12t.pages.dev/` — **25/25 passed**

It asserts, against the live origin: the CSP response header and its
load-bearing directives (`connect-src 'none'`, `object-src 'none'`,
`base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`,
`script-src 'self'`, no `unsafe-inline`), `referrer-policy: no-referrer`,
`x-content-type-options: nosniff`, a clean boot with no console errors, zero
cross-origin requests, no service worker, the privacy page and its three
caveats, live rendering with syntax highlighting, and that remote images in a
pasted document are withheld without contacting anyone.

Two changes to the verifier this release. The alpha-marker assertion was
replaced with a launch-surface assertion: Privacy, Feedback, and Source must be
visible in the header. And the highlighting check now waits, bounded, instead of
counting immediately — highlighting is applied after first paint by design, so
the old check asserted the scheduling rather than the outcome and failed against
a build where highlighting demonstrably works. The assertion itself was not
weakened: a build that never highlights still fails.

Confirmed by hand against the live site as well: no alpha or early-build copy
anywhere, **New** opens straight into a focused editor on `Untitled.md`, and
Privacy, Feedback, and Source are all in the header.

## Bundle

`node scripts/assert-bundle-budget.mjs`, gzipped:

| Budget | Measured | Limit |
| --- | ---: | ---: |
| Initial JS | 88.4 KB | 150 KB |
| Initial CSS | 9.7 KB | 30 KB |

1781.8 KB across 139 lazy chunks is deferred — Shiki grammars, Mermaid
diagram types, KaTeX, and the editor load only when a document needs them.

## Performance

`PERF_STRICT=1 npm run perf` on the sign-off machine (Apple M4, 16GB,
macOS 26.5.2), production build, one worker, warm:

| Document | Measured | Target |
| --- | ---: | ---: |
| 45KB real README, read → first paint | 104ms | < 150ms |
| 250KB corpus, full render | 458ms | < 600ms |
| 1MB torture document, usable | 1795ms | < 2500ms |
| 1MB, longest main-thread task | none over 50ms | none over 50ms |
| 1MB, heap | 10MB | < 250MB |

All three rows passed on their first attempt; strict mode disables retries.
Method and corpus: [`gate-b-performance.md`](gate-b-performance.md).

## Privacy and security guarantees

Stated at their true strength, because the two layers are not equally strong:

1. **`connect-src 'none'`, served as a response header (structural).** No
   `fetch`, `XHR`, `WebSocket`, `sendBeacon`, or EventSource can leave the
   page, even if a dependency is compromised. Verified against the live origin,
   not just the meta tag in the build.
2. **The renderer's image gate (application code).** Remote images and media
   are blocked unless the reader opts in per document. `img-src https:` must
   stay permitted for the opt-in to work, so this layer is code, not policy — a
   bug here could still produce a cross-origin request. It is backed by
   `e2e/privacy.spec.ts`, which asserts zero cross-origin requests against a
   real production build on all three browsers on every commit.

There is no upload endpoint, no document backend, no analytics, no error
reporting, no CDN, and no third-party runtime dependency. Markdown is treated
as untrusted input and sanitized against the corpus in
`test/security/xss-payloads.ts`.

Standing caveats, unchanged: a remote URL in your own document would make your
browser contact that host if you allow it; static hosting sees that you loaded
the app, as any website does; and drafts in IndexedDB are not encrypted by us.

## Browser save behavior

| Browser | Behavior |
| --- | --- |
| Chrome, Edge (desktop) | Save in place after permission; Save As adopts the new file for subsequent saves |
| Firefox, Safari | Download fallback with the same bytes; the UI says **Download** |

LF/CRLF, a UTF-8 BOM, and the presence or absence of a final newline survive an
edit and a save on every path.

## Known limitations

- **Save-in-place is Chromium-only.** Chrome and Edge write to the opened file;
  Firefox and Safari download, because they have no handles for user files.
- **Remote resources stay blocked by default.** Images and media in a document
  require a per-document opt-in; there is no persisted per-origin allowlist.
- **Relative local assets do not resolve.** A document referencing
  `./diagram.png` cannot load it — that needs folder handles, which are not
  shipped.
- **No offline or PWA support.** No service worker is registered, by design: a
  half-shipped one is the one mistake here that is hard to undo remotely.
- **Drafts are browser-local and best-effort.** They live in this browser's
  IndexedDB, are bounded in size, and are not a backup.
- **The native Edge picker UI was not manually verified on this machine.**
  Everything downstream of the returned handle — write, Save As adoption,
  identity, conflict detection — is automated against a real Chromium
  `FileSystemFileHandle`. See
  [`gate-b-manual-checklist.md`](gate-b-manual-checklist.md).

## Next operational improvement

Deployment is still manual (`npx wrangler pages deploy dist`). Automating
tag → build → deploy → verify is the first operational task after v0.1.0, and
was deliberately not bundled into this release.
