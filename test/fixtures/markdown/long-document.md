# LocalMD Product & Technical Plan

> A real long-form technical document, used to judge typography under actual
> reading conditions rather than on a paragraph of lorem ipsum. It has the
> things that make documentation hard to set: dense prose, tables, inline
> `code` mixed into sentences, nested lists, and long headings.


## Context

`/Users/shay/Desktop/projects/LocalMD` is empty. This is a greenfield product plan, not a code change. The goal of this document is to lock the product thesis, MVP boundary, architecture, and privacy/security model *before* implementation, so that v1 is small, coherent, and genuinely shippable rather than a demo.

Everything below states a recommendation. Where I disagree with the brief, I say so.

---

# Part 1 — Product analysis

## 1. Critique of the thesis

**What holds up.** Markdown genuinely has no good "just look at this file" surface. The AI-workflow angle is real and growing — `CLAUDE.md`, `AGENTS.md`, generated plans, specs, and prompt files are proliferating, and they are read far more often than they are edited. A reader-first tool is correctly positioned.

**Three corrections.**

**(a) Privacy is a wedge against the wrong competitor.** Nobody's Markdown leaks when they open VS Code. The privacy claim does not beat local tools — it beats *online* Markdown tools (dillinger.io, StackEdit, and the long tail of ad-laden "markdown preview" sites), several of which do round-trip content to a server. That is the honest framing: **LocalMD is the online Markdown viewer you can actually paste an internal spec into.** Privacy is a trust unlock for a web-delivered tool, not a feature people shop for.

**(b) The real advantage is the delivery surface, not privacy.** A URL works on a locked-down work laptop, on someone else's machine, on a machine where you can't install VS Code or a Chrome extension, and in five seconds. That is a genuine capability advantage over VS Code/Obsidian and should be co-equal with privacy in the pitch.

**(c) Diagnostics is not a primary strength.** Nobody adopts a viewer because of linting. It is a *retention and delight* feature — the thing that makes a developer say "oh, that's nice" on the third visit — and it is genuinely un-copied. Keep it, demote it from pillar to signature detail, and ship only the inline-error tier in MVP.

**The structural weakness the brief doesn't name: repeat usage.** A viewer with no memory is a one-shot tool. You visit, you read, you never return, because next time it's easier to open VS Code. The features that convert this into a habit are *recent documents with retained file handles* and *PWA install with `.md` file association* (Chromium supports registering an installed PWA as a `.md` handler via the manifest — this is a big deal and is nearly free). Recents belong in MVP. File handlers belong immediately after.

**The other structural limit: the web can't own the double-click.** On macOS, double-clicking a `.md` will never open a website. That ceiling is real and is exactly why Tauri is on the future list. Framing: **the web app is the acquisition surface; a thin desktop wrapper is the retention surface later.** Don't fight this in v1.

**One flag on the name:** "LocalMD" parses as *local medical doctor* on first read, which is a real SEO and first-impression cost. Not worth solving now — just don't get attached.

## 2. Differentiated vs. commodity

| Commodity (npm install) | Differentiated by execution | Actually defensible |
|---|---|---|
| Parsing, GFM, KaTeX, Mermaid, CodeMirror, dark mode, TOC | Typography and reading design; perceived instant on large docs; offline reliability; diagnostics; remote-content blocking; print/export fidelity | Nothing technically |

Accept that there is no technical moat. The moat is **taste, speed, and trust** — being the thing people bookmark. That has one hard implication: *polish is the roadmap*. A feature that isn't excellent is worse than absent.

**Corollary — open-source it.** For a product whose core claim is "your content never leaves," verifiability *is* the feature. Publish the repo under MIT, link it in the header, and tell people to open the network tab. This costs nothing and is the single strongest support for the privacy claim.

Production source maps are **not** part of this and are not a product requirement — the repo and the observable network behavior already provide verifiability. Generate and upload source maps only if error debugging later requires them.

## 3. Personas and use cases

**Primary**

- **P1 — The AI-workflow developer.** Lives with `CLAUDE.md`, `AGENTS.md`, generated specs, prompt files, and LLM output pasted from a chat window. Reads far more than writes. Actively uncomfortable pasting prompts into a random web tool. Highest volume, best thesis fit. **Optimize for this person.**
- **P2 — The developer reading docs outside their editor.** A README in a cloned repo, release notes from a download, a doc a colleague sent, a machine without their tooling.

**Secondary**

- **P3 — Technical writer / PM / researcher** who receives `.md` from engineers, won't install anything, wants to read and lightly edit.
- **P4 — The sensitive-content paster** (legal, medical, internal strategy) currently using dillinger.io and shouldn't be.

**Explicit non-user:** anyone who wants a note system. Every feature request from that persona gets declined by policy, not case-by-case.

**Ranked use cases:** (1) open a local `.md` and read it beautifully; (2) paste LLM output and read it; (3) quick edit and save back; (4) navigate a long doc (outline + find); (5) understand why a diagram/render broke; (6) print or export a clean copy.

## 4–5. MVP boundary

**MVP is defined as the launch build (end of M4): Open → Read → Edit → Save.** Everything below is in that build. Offline/PWA, file handlers, the diagnostics panel, and large-document optimization are **post-launch increments**, not deferred MVP scope — the product is complete and honest without them, and shipping a partial service worker is actively worse than shipping none.

**In MVP (= launch)**

- **Input:** drag-drop anywhere on the viewport, file picker, paste Markdown, new empty document.
- **View mode (default):** CommonMark + GFM (tables, task lists, strikethrough, autolinks, footnotes), fenced code with syntax highlighting, heading anchors + deep links, images, blockquotes, math, Mermaid, conservative raw-HTML support.
- **Edit mode:** CodeMirror 6, Markdown-aware, deliberately not IDE-like.
- **Split mode:** side-by-side ≥1024px; collapses to a toggle below that.
- **Save:** in-place via File System Access API where available; download fallback everywhere else; Save As; dirty state; navigation guard; **EOL and trailing-newline preservation**.
- **Navigate:** ⌘K palette (headings + recents + commands); optional pinned outline on wide screens; native browser find in View mode.
- **Memory:** recent documents with retained file handles; unsaved-draft recovery; theme and reading prefs.
- **Privacy/security:** strict CSP, remote content blocked by default with explicit per-document opt-in, sanitization, zero telemetry.
- **Diagnostics (tier A only):** inline render failures — Mermaid parse errors shown in place with the message, unresolvable relative images shown as a clear placeholder, malformed fences surfaced.
- **A11y baseline** and full keyboard operation.

**Post-launch increments** (built, just not gating the launch)

| Increment | Milestone | Reason it can wait |
|---|---|---|
| Offline / PWA | M5 | A web app that requires connectivity to *load* is normal and expected. Half-shipping a service worker risks pinning users to a broken build — strictly worse than not having one |
| Worker pipeline + large-doc optimization | M5 | Main-thread rendering is adequate to ~250KB, which covers the overwhelming majority of real documents |
| Document Health panel (tier B diagnostics) | M6 | Design the `Diagnostic[]` interface in MVP, ship the UI after |
| PWA `file_handlers` (`.md` association) | M7 | High leverage, but meaningless before the PWA exists |

**Explicitly out of scope** (and why)

| Excluded | Reason |
|---|---|
| Open folder / multi-file / tabs | Doubles the file model; strongest v1.1 candidate (see Risks) |
| Open from URL, GitHub integration | Requires network egress; breaks the `connect-src 'none'` guarantee |
| Export to HTML/PDF | Browser print with a good print stylesheet covers v1 |
| WYSIWYG, vim mode, presentation mode, frontmatter editor UI | Scope creep toward an IDE |
| Mobile-optimized *editing* | Mobile view mode is first-class; editing is available but unoptimized |
| MDX evaluation | `.mdx` opens as plain Markdown text, never evaluated. Permanent non-goal |
| Settings page | A small popover is enough |
| Accounts, sync, collab, AI, plugins, desktop, i18n | Per brief |

**Two judgment calls worth naming.** *Split is in* — it's cheap once Edit exists and power users expect it. *Mermaid is in* — it's the heaviest, riskiest dependency in the stack, but LLMs emit Mermaid constantly and P1 is the target persona; lazy-load it and isolate it.

---

# Part 2 — Technical plan

## 6. Main technical risks

1. **File System Access API is Chromium-only.** Safari and Firefox cannot write to user files at all. The core loop — open, edit, ⌘S — works for roughly two-thirds of desktop users. The fallback must be designed as a first-class path, not an apology.
2. **Mermaid.** Large, DOM-mutating, style-injecting, poor error surfaces, historically XSS-prone, high version churn. Contain it.
3. **Large-document performance.** Highlighting many code blocks and re-rendering on keystroke are the two cliffs.
4. **Sanitization drift.** The failure mode is loosening the allowlist one feature request at a time until it's meaningless. Lock it behind a test suite.
5. **Service worker update semantics.** The classic footgun: users pinned to a broken cached build, or an auto-reload that discards unsaved edits.
6. **Split-mode scroll sync** is deceptively hard and never fully right. Timebox it.
7. **Storage eviction.** Safari evicts IndexedDB after ~7 days of no origin visits — draft recovery is not durable there. Must be stated, not assumed.

## 7. Privacy and security model

### The guarantee, stated precisely

> **LocalMD never uploads your document.** Parsing, rendering, and editing happen entirely in your browser. There is no upload endpoint and no document backend. After the first load, LocalMD makes no network requests of its own.

### The three honest caveats

1. **Your document's own URLs.** `![](https://example.com/private-id.png)` would cause *your browser* to contact that host. **LocalMD blocks all remote images and media by default** (decided), shows an inline placeholder, and offers a per-document, session-scoped "Load remote content" opt-in. A persistent indicator in the header shows the current state. No other Markdown viewer does this, and it converts a privacy footnote into a visible feature.

   **The known cost, and how to pay it.** A typical GitHub README opens as a row of grey badge placeholders. If that reads as *broken*, we lose the user in the first three seconds — this is the single biggest first-impression risk in the product. Mitigations, all required:
   - Placeholders must look **deliberate**, not like failed images: correctly sized inline chips carrying the image's alt text, in a muted style that reads as "withheld," never a broken-image glyph.
   - A single obvious affordance — one click in the header banner loads everything in the document, no per-image clicking.
   - The banner states the reason in one plain line, e.g. *"3 remote images blocked — they'd contact `img.shields.io`. Load them?"* Naming the host teaches the concept in one sentence and turns the friction into the demo.
   - **Per-origin memory is deferred, not rejected.** If alpha feedback shows the badge case is costing us users, adding a persisted per-origin allowlist is the fix, and the policy store should be shaped to accommodate it from the start.
2. **Static hosting logs.** Whoever serves the app sees that you loaded it — IP, user agent, asset paths — exactly as with any website. It never sees a file. Say this plainly on the privacy page.
3. **Local storage is not encrypted by us.** Drafts and preferences live in your browser's IndexedDB, readable by anything with access to your browser profile. Provide a "Clear local data" control. Don't overclaim.

### Enforcement — two independent layers

The claim rests on two mechanisms with different strengths. **State them separately; do not collapse them into one absolute claim.**

**Layer 1 — CSP, structural.** `connect-src 'none'` structurally prevents *programmatic* network egress: no `fetch`, `XHR`, `WebSocket`, `sendBeacon`, or EventSource can leave the page, even if a dependency is compromised. This is genuinely airtight and verifiable by anyone in devtools. It also forces "open from URL" out of MVP — an acceptable price.

**Layer 2 — the renderer, enforced in code.** Remote *subresources* — images, media — are blocked by LocalMD's own image gate unless the user explicitly enables them. This is a code-level guarantee, not a CSP one, because `img-src https:` must remain permitted for the opt-in feature to work at all. **A bug in the image gate or in sanitization could therefore still produce a cross-origin request.** That is the honest limit of the claim.

The accurate formulation, to be used verbatim in the privacy page:

> `connect-src 'none'` structurally prevents programmatic network egress. Remote resources are independently blocked by LocalMD's renderer unless you explicitly enable them.

Because Layer 2 is code rather than policy, it needs a test rather than a promise: **the Playwright zero-cross-origin-request assertion is the real guarantee** and is a release blocker at every gate, not a nice-to-have. It is the only thing that catches a gating regression.

- Full CSP: `default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
  - `style-src 'unsafe-inline'` is required by KaTeX and Shiki; it is a much smaller risk than script injection, and sanitization strips user-supplied `style` attributes regardless.
  - Worth evaluating later: a strict deployment variant with `img-src 'self' data: blob:` and no remote-image opt-in at all, which would move Layer 2 into Layer 1. Not for v1 — it would make GitHub READMEs permanently badge-less.
- **Zero third-party runtime dependencies.** No CDN, no Google Fonts, no analytics, no Sentry. All fonts and assets self-hosted. Enforce with a build check that fails on any non-relative URL in the bundle.
- **Zero in-app telemetry in v1.** Judge success from host-level aggregate request counts (which exist regardless) and qualitative feedback via GitHub issues. If telemetry is ever added, it must be opt-in and must never derive from document content.
- **Service worker caches app assets only.** Never document content.
- **Privacy regression test in CI:** Playwright opens a document containing remote images, external links, and math, and asserts **zero non-same-origin network requests**. This is the most valuable test in the suite.

### Security — Markdown as untrusted input

- **Raw HTML: sanitize, don't strip.** GitHub READMEs depend on `<details>`, `<img align>`, `<br>`, `<p align="center">`, badges. Stripping HTML makes the #1 use case render badly. Use `rehype-raw` followed by `rehype-sanitize` with a tight custom schema.
- **Pipeline invariant (the rule that prevents drift):** *sanitize everything user-derived first, then inject our own generated markup.* KaTeX, Shiki, slugs, and autolinks all run **after** sanitization, because their output is generated by us from text content, not from user HTML.
- **Allowed:** structural tags, `details`/`summary`, `kbd`, `sub`/`sup`, tables, `img`, `a`, `br`, `hr`, limited `div`/`span`. **Blocked:** `script`, `iframe`, `object`, `embed`, `form`, `input`, `style`, `link`, `meta`, all `on*` attributes, all `style` attributes.
- **No raw SVG in v1.** SVG is an XSS vector (`foreignObject`, `<script>`, `animate`). Mermaid's *generated* SVG is sanitized before insertion.
- **URL scheme allowlist:** `http`, `https`, `mailto`, `#anchor`, `blob:` (ours). Blocked: `javascript:`, `data:` (except `data:image/{png,jpeg,gif,webp}` — **not** `svg+xml`), `vbscript:`, `file:`. Handle entity-encoded and mixed-case bypasses; test them.
- **External links:** `rel="noopener noreferrer"`, `referrerpolicy="no-referrer"`, `target="_blank"`, and show the destination host on hover.
- **Mermaid:** `securityLevel: 'strict'`, `htmlLabels: false`, output sanitized, every render wrapped in try/catch. Escape hatch if a CVE lands: move it into a `sandbox`-attributed blob iframe.
- **Origin hygiene:** never host user-generated content on this origin, never add a third-party script. Local storage is only as safe as the origin.

## 8. Frontend architecture

**Stack:** React 19 + TypeScript + Vite. **Zustand** for the document/session store (the editor and renderer need to read and write outside the React render cycle; context would cause re-render storms for ~1KB of savings). No router — this is a single surface; use the URL only for `#heading` deep links.

**Data flow**

```
DocumentSource (adapter)
   → DocumentStore { text, dirty, source, meta }
       → MarkdownPipeline  (pure, async interface, worker-ready)
            → hast tree + Diagnostic[]
                → React renderer (hast → JSX, block-memoized)
                    → DOM
                        → post-mount hydration: Mermaid (main thread only)
```

**Three decisions that matter:**

**(a) Async pipeline interface from commit one, worker later.** The pipeline is a pure `async (text, opts) => {tree, diagnostics}`. It runs on the main thread initially and moves into a Web Worker at the performance milestone with zero call-site changes. This is how we avoid trapping ourselves without optimizing prematurely. KaTeX and Shiki can run in the worker; Mermaid needs the DOM and stays on the main thread, hydrating placeholder nodes after mount.

**(b) hast → React elements, not `dangerouslySetInnerHTML`.** Use `hast-util-to-jsx-runtime` with component overrides for `code`, `img`, `a`, `h1–h6`, `table`, and Mermaid blocks. Slightly slower than `innerHTML` on huge documents, but it gives us the image gate, link hardening, lazy diagram rendering, and stable reconciliation. Worth the cost.

**(c) Block-level memoization, not virtualization.** Split the root's top-level children into blocks, memoize each by content hash. A keystroke in paragraph 300 re-renders one block. **Do not virtualize** — virtualization would break native ⌘F, which is the browser find we deliberately rely on in View mode. Use progressive rendering (first screenful immediately, remainder in idle chunks) for large documents instead.

## 9. Markdown pipeline

```
remark-parse
  → remark-frontmatter        (parse YAML; render as a collapsed chip, not a table)
  → remark-gfm                (tables, task lists, strikethrough, autolinks, footnotes)
  → remark-math
  → remark-rehype             ({ allowDangerousHtml: true })
  → rehype-raw                (parse embedded HTML into hast)
  → rehype-sanitize           (custom schema)   ←— everything above this line is untrusted
  → rehype-katex              ({ trust: false, throwOnError: false })
  → rehype-slug + rehype-autolink-headings      (github-slugger handles dedup)
  → shiki highlighting        (dual-theme via CSS variables)
  → localmd-image-gate        (remote → placeholder unless allowed)
  → localmd-link-harden       (scheme allowlist, rel/referrerpolicy)
  → localmd-mermaid-extract   (fence → placeholder node for post-mount hydration)
  → localmd-diagnostics       (collect Diagnostic[] with source positions)
```

**Syntax highlighting: Shiki**, not Prism/highlight.js. Rationale: accurate TextMate grammars, VS Code-quality output, and — decisively — **dual-theme output driven by CSS variables**, so light/dark switching costs zero re-highlighting. Cost: heavy. Mitigate with `createHighlighterCore`, a curated ~20-language precache (js, ts, tsx, py, go, rust, java, c, cpp, sh, json, yaml, toml, sql, html, css, md, diff, docker, xml), dynamic import per additional language, and plain-`<pre>` fallback for unknown languages (silently — an unknown language is not an error).

**Math:** KaTeX over MathJax — smaller, faster, synchronous. Ship woff2 fonts only.

**Frontmatter:** parse with safe YAML defaults, render as a subtle collapsible chip. Never a table by default.

## 10. File abstraction

```ts
type SourceKind = 'fs-handle' | 'picked-file' | 'pasted' | 'new';

interface DocumentSource {
  id: string;
  name: string;
  kind: SourceKind;
  canSaveInPlace: boolean;
  read(): Promise<string>;
  save(text: string): Promise<SaveResult>;    // in-place, or triggers download
  saveAs(text: string, name?: string): Promise<SaveResult>;
  getFileMeta(): Promise<{ lastModified: number; size: number } | null>;
}
```

Implementations: `FileSystemAccessSource` (holds a serializable `FileSystemFileHandle`), `BlobFileSource` (drop/picker; read once, save → download), `MemorySource` (paste/new; save → download). Nothing above this layer knows which is active — the UI only reads `canSaveInPlace` to decide whether the button says **Save** or **Download**.

**Edge cases to handle in v1:**

- **Permission.** `queryPermission` on load, never auto-`requestPermission` (it needs user activation). Recents render immediately; clicking one triggers the prompt. On denial: explain, offer the recovered draft, offer Save As.
- **Dirty state.** `beforeunload` guard, plus a draft flush on `visibilitychange` — `beforeunload` is unreliable on mobile and Safari.
- **External modification.** On window focus, compare `file.lastModified` against the value at load. Clean → offer reload. Dirty → conflict banner: *Keep mine / Load theirs / Save as copy*. Never auto-merge.
- **Multiple tabs.** `BroadcastChannel` + `handle.isSameEntry` to detect the same file open twice; warn, don't hard-lock.
- **EOL and BOM.** Record the original line-ending style and trailing-newline state on read; restore them on save. Skipping this produces whole-file diffs and destroys trust with the git-using persona.
- **Encoding:** decode UTF-8, strip BOM on read, restore on write.
- **Input validation:** accept `.md`, `.markdown`, `.mdown`, `.mdx` (as plain text), `.txt`. Reject directories and other types with a clear message. Warn above ~2MB and offer read-only fast mode.

## 11. Local persistence

**IndexedDB (via `idb`), not OPFS.** OPFS solves a problem we don't have — we are not managing a filesystem, and the brief explicitly warns against becoming one. Revisit only if large binary caches appear.

| Store | Contents | Policy |
|---|---|---|
| `recents` | id, name, kind, `FileSystemFileHandle`, lastOpened, size | **No document content, not even a preview snippet.** Cap ~20 entries, LRU |
| `drafts` | sourceId, text, savedAt, baseHash | Only for *dirty* documents. Purge on successful save, or after 7 days. Global cap ~20MB, LRU |
| `prefs` | theme, default mode, reading width, font, remote-content policy | — |

The user's file is always the source of truth. Drafts are recovery only and surface as a banner — *"Unsaved changes from 3:42 PM · Restore / Discard"* — never applied silently. Call `navigator.storage.persist()` to reduce eviction, and be explicit in the UI copy that recovery is best-effort. Provide **Clear local data**.

## 12. Offline / PWA

**Post-launch (M5).** Not part of MVP — see §4–5. Design it now so nothing in M1–M4 blocks it; build it after launch, and ship it complete or not at all.

`vite-plugin-pwa` (Workbox).

- **Precache:** app shell, core JS/CSS, fonts, KaTeX (woff2 only), the 20 precached Shiki grammars. Target < 1.5MB installed.
- **Runtime-cache (CacheFirst):** Mermaid and additional Shiki grammars, fetched on first use. Plus a settings toggle: **"Download everything for offline"** — honest, user-controlled, avoids a bloated first load.
- **Updates: `registerType: 'prompt'`.** Never auto-reload. Show a quiet "Update available · Reload" chip, and **suppress it entirely while the document is dirty.**
- Keep a self-unregistering `sw.js` ready as a kill switch for a bad deploy. Cache versioning keyed to build hash.
- The service worker never caches document content.

## 13. Browser compatibility

| Tier | Browsers | Experience |
|---|---|---|
| **1 — Full** | Chrome/Edge desktop 108+ | Open, edit, **save in place**, ⌘S, PWA install, `.md` file association |
| **2 — No save-in-place** | Safari 16.4+, Firefox 115+ | Open via picker/drop/paste, edit, **download to save**. Safari's FSA covers OPFS only, not user files |
| **3 — Read-first** | Mobile browsers | View mode fully supported; editing available, unoptimized; no drag-drop |

Feature-detect, never UA-sniff. Show a quiet capability indicator in the header (⌘S reads *Save* or *Download* accordingly). Note the Safari IndexedDB eviction caveat in the recovery copy.

**High-leverage, nearly free:** the manifest's `file_handlers` + `launchQueue` makes an *installed* PWA a real `.md` handler on Chromium — this partially solves the double-click problem without Tauri. Slot it immediately post-MVP.

## 14. Interaction model

**Challenge to the proposed layout:** the segmented View/Edit/Split control is fine, but a permanent TOC sidebar contradicts "the document dominates." Recommendation:

- **Header, ~40px, always visible, very quiet.** Left: filename · dirty dot · local/remote-content indicator. Right: mode control · overflow menu. It stays visible because it's the anchor of the trust claim — but it must be genuinely thin. No auto-hide (janky, hurts a11y).
- **Outline: ⌘K palette as primary**, containing headings, recent documents, and commands. A pinned outline appears only above ~1400px where it costs nothing, and is opt-in.
- **Find: do not override ⌘F in View mode.** Native browser find beats anything we would build and operates on the actual rendered text. Override ⌘F only in Edit/Split (CodeMirror search). *This is why we don't virtualize.*
- **Shortcuts:** ⌘E toggle view/edit, ⌘\ split, ⌘K palette, ⌘S save/download, ⌘O open, ⌘⇧V paste-as-new. All discoverable via the palette.
- **Split:** side-by-side ≥1024px, otherwise a toggle. Scroll sync via mdast source positions, editor-leads-preview, explicitly best-effort. Timeboxed.
- **Drop target is the entire viewport**, always — not a box.
- **Landing:** wordmark, one line, three affordances (Open · Paste · New), one trust line, a link to the privacy page and the repo. **Recents appear here once they exist** — that's the habit loop. No hero gradient, no marketing copy, no cards.
- **Reading design:** ~72ch prose measure; tables, code blocks, and diagrams break out wider. One self-hosted variable sans (subset, ~40KB) + one mono; optional serif reading mode. Total font payload < 200KB.
- Enumerate and design the unglamorous states: empty, permission-denied, file-too-large, unsupported-type, render-failure, offline, update-available, conflict, recovery.

## 15. Diagnostics

**Tier A — MVP, inline only.** Failures the user can see are bugs, not lint:
- Mermaid parse errors rendered in place with the message and offending line.
- Unresolvable relative images (`./diagram.png` — always unresolvable from a picked file) → clear "local image not available" placeholder, not a broken-image icon.
- Malformed/unclosed fenced code.
- Blocked remote resources → placeholder with the load action.

**Tier B — v1.1, the Document Health popover.** Counts plus warnings: heading-level jumps, duplicate anchors, empty links/images, suspicious links, blocked remote resources. Implement the rules as a pure function over mdast/hast returning `Diagnostic[]` with source positions **in MVP**; ship only the panel later.

**Placement:** a status dot in the header — neutral when clean, amber with a count otherwise. Click → popover → click an item → scroll to it in View, jump to the line in Edit. That jump is what makes it feel like a developer tool rather than a lint report.

**Hard boundary:** correctness and rendering only. No style opinions — no line length, no ATX-vs-setext preaching. That boundary is what stops this becoming markdownlint.

## 16. Performance

**Budgets (enforced in CI):**

| Metric | Target |
|---|---|
| Initial JS before opening a doc | < 150KB gz |
| Core view mode incl. highlighting | < 400KB gz (Mermaid/KaTeX lazy) |
| Cold TTI (mid laptop, 4G) | < 2.5s; warm < 1.0s |
| 50KB README: read → first paint | < 150ms |
| 250KB doc: full render | < 600ms, scroll at 60fps |
| 1MB doc: usable | < 2.5s progressive; no main-thread task > 50ms |
| Keystroke → editor paint | < 16ms, always |
| Preview update after keystroke | 120ms trailing debounce + idle, cancellable |
| Memory, 1MB doc | < 250MB |

**Bottlenecks, in order:** Shiki over many code blocks → Mermaid init and per-diagram render → KaTeX on math-heavy docs → React reconciliation on huge trees → `rehype-raw` + sanitize on HTML-heavy docs → re-parse per keystroke.

**Mitigations:** worker pipeline (interface designed in from day one); block memoization by content hash; Mermaid and heavy code blocks rendered lazily via `IntersectionObserver` (plain text first paint, upgrade on approach); documents > 2MB open in read-only fast mode (no highlighting, no diagrams) with an explicit opt-in to full rendering.

**Make budgets real:** commit a perf fixture corpus — tiny README, 100KB spec, and a 1MB torture document with ~200 code blocks, ~30 Mermaid diagrams, and heavy math — and assert the key numbers in Playwright.

## 17. Testing strategy

**Unit (Vitest)**
- Pipeline snapshots over a fixture corpus (`.md` + expected HTML).
- **Sanitization suite treated as a security test suite** — `javascript:` variants, entity-encoded and mixed-case bypasses, `on*` attributes, nested raw HTML, `data:image/svg+xml`, SVG payloads. This suite is what prevents allowlist drift.
- Slug generation and duplicate-anchor dedup.
- Diagnostics rules, table-driven.
- EOL/BOM preservation round-trips.
- `DocumentSource` adapters against fake `FileSystemFileHandle`s.
- Draft store: write, restore, purge, LRU eviction; dirty-state reducer.

**Component (Vitest + Testing Library):** mode switching, palette, outline, save/dirty UI, recovery banner, conflict banner.

**E2E (Playwright — small and high-value)**
1. Drop a `.md` → renders correctly.
2. Edit → download fallback produces byte-correct output (WebKit + Firefox).
3. Refresh with unsaved changes → recovery banner restores.
4. Offline: reload with the network blocked → app works, document renders.
5. Remote image blocked by default; opt-in loads it.
6. Keyboard-only: open, switch modes, jump via outline, escape dialogs.
7. XSS fixture renders inert — no script execution, no `javascript:` href in the DOM.
8. **Privacy: zero non-same-origin requests while opening and rendering.**

**Known gap, stated honestly:** the real File System Access picker cannot be driven by Playwright. Test the adapter against fakes, and put "manual ⌘S save-in-place verification on Chrome and Edge" on the release checklist. Don't pretend otherwise.

**Also in CI:** Chromium/WebKit/Firefox matrix for view/edit/download; `axe-core` on view, edit, split, and dialogs; bundle-size budget check; the no-external-URLs build assertion.

## 18. Repository structure

**Verdict: a single Vite app, no monorepo — but with a hard, lint-enforced internal boundary.** A workspace setup at this stage is architecture theatre. Enforce boundaries with `eslint-plugin-boundaries` (or `import/no-restricted-paths`) so `core/` can never import React or DOM APIs. Extracting `packages/markdown-core` later becomes a `git mv` on the day a CLI or Tauri build actually needs it.

```
localmd/
  index.html
  vite.config.ts
  src/
    core/              # zero DOM, zero React — the future npm package
      markdown/        # unified pipeline, custom plugins, sanitize schema
      diagnostics/     # pure rules over mdast/hast
      types.ts
    platform/          # browser APIs, still no React
      files/           # DocumentSource adapters, FSA, download, EOL handling
      persistence/     # idb: recents, drafts, prefs
      worker/          # pipeline worker + typed client
    render/            # hast → React, block memo, component overrides
      components/      # CodeBlock, Mermaid, Image, Anchor, Table, Footnote
    editor/            # CodeMirror 6 setup, markdown extensions, keymap
    app/               # shell, store, modes, header, palette, outline, dialogs
    styles/            # tokens, typography, themes, print
  test/
    fixtures/          # markdown corpus + snapshots
    security/          # XSS payloads
    perf/              # large-doc corpus
  e2e/
  public/
```

**Import rule:** `core` imports nothing internal. `platform` may import `core`. `render` may import `core`. `editor` may import `core`. `app` may import everything.

## 19. Milestones

**M0 — Skeleton and guardrails.** Vite + TS + React, **CSP in place from the first commit**, ESLint boundary rules, Vitest, Playwright, CI, fixture corpus, the no-external-request test harness. Deploy a blank page to production immediately so the deploy path is never a late surprise.

**M1 — Read.** `DocumentSource` for drop/picker/paste, the pipeline through sanitization, heading anchors, View mode, the full typography system, light/dark.

**M2 — Rich rendering.** Shiki (dual-theme, lazy grammars), KaTeX, Mermaid (lazy, isolated, errors inline), remote-content gating and policy UI, tables/task-lists/footnotes polish, print stylesheet. **→ Public alpha ships here (Gate A).**

**M3 — Navigate and remember.** ⌘K palette, outline, deep links, recents in IndexedDB, reading prefs, full keyboard map, a11y pass.

**M4 — Edit and save.** CodeMirror 6, Edit and Split, dirty state, FSA save/save-as, download fallback, EOL preservation, navigation guard, draft recovery, external-change detection, multi-tab warning. **→ Real launch ships here (Gate B).**

**M5 — Offline and performance.** PWA with prompt updates, flip the pipeline into the worker, block memoization, lazy Mermaid/code via `IntersectionObserver`, large-doc fast mode, perf budgets enforced in CI. *Post-launch.* Note the perf budget items in Gate B must be met before launch even though the worker flip lands here — M4 ships with main-thread rendering, which is adequate up to ~250KB documents.

**M6 — Diagnostics and polish.** Document Health panel, jump-to-source, remaining error/empty states, cross-browser matrix hardening. *Post-launch.*

**M7 — v1 complete.** Manifest + `file_handlers` (PWA as a `.md` handler on Chromium), release checklist, manual QA on Safari/Firefox/mobile, large-doc fast mode verified. **→ Gate C.**

### Release strategy (decided)

**Two stages.**

- **Public alpha at end of M2** — the read-only viewer goes live once rendering, privacy, and typography are solid. Framed explicitly as an early build for feedback, not a launch: no Show HN, no product-hunt-style push. Purpose is real feedback on taste and rendering fidelity, which is the one thing that cannot be retrofitted.
  - *Note:* M1 alone (no highlighting, no math, no diagrams) is too thin to judge the reading experience. The alpha gate is **M2 complete**, and M3's outline/recents should follow quickly so alpha visitors have a reason to return.
  - Alpha needs a visible "early build" marker in the header, a feedback link to GitHub issues, and the privacy page live from day one — the privacy claim must be true and documented even in alpha.
- **Real launch at end of M4** — once View → Edit → Save works end to end on Tier 1 and Tier 2 browsers. This is the version that gets announced.
- **M5–M7 continue post-launch** as incremental releases. This means the public launch ships *before* offline/PWA and the diagnostics panel. Acceptable, with one exception: **the service worker must not ship half-done.** Either PWA is complete at launch or it is absent — a partial SW is the fastest way to pin users to a broken build.

## 20. Ship criteria

Split into three gates matching the release strategy above.

### Gate A — Public alpha (end of M2)

- [ ] CommonMark + GFM fixture corpus renders correctly; snapshots green
- [ ] The 20 most-starred GitHub READMEs render without visual defects
- [ ] Sanitization suite passes; no XSS payload executes or survives in the DOM
- [ ] CSP deployed with `connect-src 'none'`; verified in production response headers
- [ ] Zero non-same-origin network requests while opening and rendering (automated)
- [ ] No third-party scripts, fonts, or CDN references in the bundle (build assertion)
- [ ] Remote content blocked by default; opt-in works; state always visible
- [ ] Privacy page live and accurate, including all three caveats
- [ ] Repo public, MIT, linked from the header
- [ ] Typography passes a real reading test on a long technical document
- [ ] Contrast AA in both themes; visible focus; `prefers-reduced-motion` honored
- [ ] "Early build" marker and feedback link present
- [ ] No service worker registered yet (or a complete one — nothing in between)

### Gate B — Launch (end of M4)

Everything in Gate A, plus:

- [ ] Round-trip fidelity: open → save with no edits produces a byte-identical file (EOL, BOM, trailing newline)
- [ ] Save-in-place manually verified on Chrome and Edge; download fallback verified on Safari and Firefox
- [ ] Draft recovery survives refresh, crash, and tab close on all Tier 1/2 browsers
- [ ] External-modification conflict banner behaves correctly
- [ ] Navigation guard fires on dirty state; no silent data loss path exists
- [ ] Full keyboard operation across View/Edit/Split; axe clean on all surfaces
- [ ] Every state designed: empty, denied, too-large, unsupported, render-failure, conflict, recovery
- [ ] Perf budgets in §16 met on the perf corpus, asserted in CI
- [ ] Tier 1/2/3 browser matrix passes
- [ ] A developer goes from landing page to reading their own file in under 10 seconds with no instructions
- [ ] README complete

### Gate C — v1 complete (end of M7)

Everything in Gates A and B, plus:

- [ ] Works fully offline after first load, verified on a cold profile
- [ ] Update prompt never fires while dirty; no auto-reload ever; kill-switch SW verified
- [ ] 1MB torture document remains scrollable and responsive; fast mode works
- [ ] Document Health panel ships with jump-to-source in both View and Edit
- [ ] Print output is genuinely good
- [ ] Installed PWA registers as a `.md` handler on Chromium and opens files correctly
- [ ] Offline state designed and tested

## Risks register

| Risk | Impact | Mitigation |
|---|---|---|
| FSA absent in Safari/Firefox | Core loop degraded for ~⅓ of desktop | Download fallback designed as first-class; capability indicator; never apologize in copy |
| Mermaid weight, bugs, CVEs | Perf and security | Lazy-load, strict security level, sanitize output, catch all errors, iframe escape hatch ready |
| No repeat usage | Product is a demo | Recents in MVP; PWA `file_handlers` immediately after; Tauri as the real answer later |
| Sanitization allowlist drift | Silent security regression | Security test suite gates every schema change |
| Bad SW deploy pins users | Users stuck on broken build | Prompt-only updates, build-hash cache keys, self-unregistering kill switch |
| Safari evicts IndexedDB after ~7 days | Draft recovery silently fails | `storage.persist()`; state "best-effort" in the UI; never present recovery as a guarantee |
| Scroll sync rabbit hole | Weeks lost | Timeboxed, explicitly best-effort |
| Scope creep toward Obsidian | Loss of focus | Non-goals table is policy; "note system" requests declined by default |
| Web can't own double-click on `.md` | Ceiling on habit formation | Accept in v1; PWA file handlers, then Tauri |
| Name reads as "local medical doctor" | SEO and first impression | Flagged; not locked; revisit before launch |

**Top post-MVP candidate — "Open Folder."** The FSA directory picker would make `![](./diagram.png)` resolve locally with zero network access, which fixes the most visible rendering gap in the product *and* strengthens the privacy story. It is the strongest v1.1 feature. Do not build it in MVP.

---

# Part 3 — Consolidated spec

**Product thesis.** LocalMD is a browser-based Markdown reader — with editing when you need it — that never sends your document anywhere. It exists because `.md` files are now first-class documents (READMEs, specs, `CLAUDE.md`, `AGENTS.md`, LLM output) that still have no good way to simply be *read*. It competes with online Markdown tools on trust and with editors on speed and zero-install access. Reader first, editor second, developer diagnostics as the signature detail.

**Target users.** Primary: the AI-workflow developer (P1) and the developer reading docs outside their editor (P2). Secondary: technical writers/PMs (P3) and people handling sensitive Markdown (P4). Non-user: anyone wanting a note system.

**MVP (= the M4 launch build): Open → Read → Edit → Save.** Open (drop/picker/paste/new) → beautiful View with full rendering → navigate (⌘K outline, native find, anchors) → Edit/Split in CodeMirror → save in place or download, with EOL fidelity → recents and draft recovery → remote content blocked by default → inline render diagnostics. §4–5.

**Post-launch increments.** Offline/PWA (M5), worker pipeline and large-doc optimization (M5), Document Health panel (M6), PWA `.md` file handlers (M7).

**Non-goals.** Accounts, sync, collaboration, AI, plugins, mobile/desktop apps, GitHub/URL fetching, multi-file workspaces, MDX evaluation, export beyond print, WYSIWYG. §5.

**Technical architecture.** React 19 + TS + Vite + Zustand; unified/remark/rehype pipeline behind an async worker-ready interface; hast → React with block memoization; Shiki dual-theme; lazy KaTeX and Mermaid; `DocumentSource` adapter over FSA/Blob/Memory; IndexedDB for recents, drafts, prefs; Workbox PWA with prompt-only updates; single repo with lint-enforced module boundaries. §8–13, §18.

**Privacy/security model.** Two layers, stated separately: `connect-src 'none'` structurally prevents programmatic egress; remote subresources are independently blocked by the renderer unless the user enables them, backed by an automated zero-cross-origin-request test. Plus: no upload endpoint, no backend, no third-party runtime dependencies, no telemetry, sanitize-then-generate pipeline invariant, strict URL scheme allowlist, open source. Three stated caveats: your document's own URLs, static-host request logs, unencrypted local storage. §7.

**UX model.** One 40px quiet header; document dominates; ⌘K palette instead of a permanent sidebar; native find in View; ⌘E/⌘\ mode switching; whole-viewport drop target; minimal landing that grows recents. §14.

**Repository structure.** Single Vite app; `core` / `platform` / `render` / `editor` / `app` / `styles` with enforced import direction; `core` extractable to a package later by moving a directory. §18.

**Milestones.** M0 guardrails → M1 read → **M2 rich rendering (public alpha)** → M3 navigate/remember → **M4 edit/save (launch)** → M5 offline/perf → M6 diagnostics/polish → M7 v1 complete. §19.

**Risks.** FSA browser gap; Mermaid; repeat usage; sanitization drift; SW deploys; Safari storage eviction; scroll sync; scope creep; the double-click ceiling. §Risks register.

**Ship criteria.** §20 checklist.

---

## Verification approach (once implementation starts)

Not applicable yet — no code exists. When M0 lands, verification is: `npm test` (Vitest unit + component), `npm run e2e` (Playwright across Chromium/WebKit/Firefox), `npm run build` plus the bundle-size and no-external-URL assertions, and manual save-in-place QA on Chrome/Edge per the release checklist.

## Decisions locked

| Decision | Choice |
|---|---|
| Release | Public alpha at M2 (read-only viewer, framed as early build); real launch at M4 (View → Edit → Save end to end); M5–M7 post-launch |
| Repository | Public, MIT, from the first commit; bundle unobfuscated. Production source maps **not** required — add only if debugging later needs them |
| Mermaid | In MVP, lazy-loaded, `securityLevel: 'strict'`, output sanitized, errors inline; iframe isolation held as an escape hatch |
| Remote images | Blocked by default, per-document session opt-in, visible header indicator; per-origin allowlist deferred to post-alpha feedback |

## Still open (not blocking — decide during M1/M2)

1. **Prose typeface.** Self-hosted variable sans (Inter or Public Sans, ~40KB subset) vs. a serif reading default. Resolve by testing a real long document at M1.
2. **Name.** "LocalMD" reads as *local medical doctor* on first pass. Not locked; revisit before the M4 launch, not before.
3. **Editor library confirmation.** CodeMirror 6 is the recommendation and is very likely right, but validate bundle size and Markdown extension quality at the start of M4 before committing.
