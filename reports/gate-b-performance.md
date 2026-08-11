# Gate B — §16 performance

Measured on a controlled machine, against the production build, before and after
the M5 performance work was pulled forward.

**Machine:** Apple M4, 16GB, macOS 26.5.2. Chromium via Playwright 1.62.1,
headless, foreground page. Server: `vite preview` on a fresh `dist/`.
**Command:** `PERF_STRICT=1 npm run perf`.
**Corpus:** `test/perf/corpus.ts` — a real 45KB document from fixtures, plus a
built 250KB document and a built 1MB torture document (200 code blocks, 30
Mermaid diagrams, 100 formulas). Deterministic, so these numbers are comparable
to the next ones.

Every measurement is **warm**: a small document containing a fence and a formula
is opened first, so no chunk downloads inside the measured window. Download and
boot are a different budget, asserted by `scripts/assert-bundle-budget.mjs`.

## Result

| Document | §16 target | Before | After |
|---|---|---|---|
| 45KB README, read → first paint | < 150ms | **280ms** ✗ | **91ms** ✓ |
| 250KB, full render | < 600ms | **690ms** ✗ | **472ms** ✓ |
| 1MB, usable | < 2500ms | 2400ms ✓ | **1790ms** ✓ |
| 1MB, no main-thread task | > 50ms is a failure | **1431ms** ✗ | **none** ✓ |
| 1MB, memory | < 250MB | 11MB ✓ | 10MB ✓ |

"None" is literal: over the render plus a three-second settle window, the
browser recorded no `longtask` entry at all, and a `longtask` entry exists only
for tasks over 50ms.

## The trace that decided it

Phase timings from the instrumented production build, before any change:

| Phase | 45KB | 250KB | 1MB |
|---|---|---|---|
| file read + decode | 18ms | 11ms | 8ms |
| remark parse | 23ms | 183ms | **1012ms** |
| raw HTML → hast | 6ms | 37ms | 197ms |
| sanitize | 1ms | 16ms | 65ms |
| slugs, anchors, headings | 3ms | 35ms | 158ms |
| KaTeX | 1ms | 29ms | 55ms |
| Mermaid extraction | 1ms | 9ms | 41ms |
| **Shiki** | **171ms** | 146ms | 212ms |
| images + link hardening | 1ms | 19ms | 88ms |
| hast → React | 1ms | 10ms | 41ms |
| React commit + paint | 23ms | 140ms | **353ms** |

Two findings, and they point in different directions — which is why the answer
was both of the available architectures rather than either.

**Shiki cost 171ms on a document with one fence.** Not per-block work: 200
fences in the 1MB document cost 212ms, barely more. Nearly all of it was the
JavaScript regex engine compiling a grammar on first use — inside a highlighter
the pipeline built and then `dispose()`d **on every render**. The document
waited for a compile that was then thrown away. This is what no amount of worker
migration would have fixed: moving 171ms to another thread still leaves the
reader waiting 171ms, because nothing could paint until the pipeline resolved.

**Parsing a megabyte is a 1012ms task, and the React commit is another 353ms.**
Those are unfixable on the main thread by any amount of deferral. §16's 50ms
rule is not reachable with that work on the thread at all.

## What changed

1. **Highlighting left the pipeline.** Code renders as plain text immediately
   and each block upgrades itself when it comes near the viewport
   (`src/render/highlighting.tsx`). One highlighter now lives for the session
   instead of being rebuilt per render, so the grammar compile happens once.
   This is the M5 design in the plan — "plain text first paint, upgrade on
   approach" — and it is what the 45KB row needed.
2. **The pipeline moved into a render worker** (`src/platform/render/`), with a
   main-thread fallback wherever a worker cannot be constructed. Highlighting
   runs there too: the grammar compile has to happen somewhere, and the worker
   is the only place it is not a 170ms main-thread task.
3. **The document crosses in slices and mounts in slices.** One slicing,
   `src/core/markdown/slice.ts`, used at both ends.

## Three things that only showed up under measurement

**A worker made it slower before it made it faster.** Posting the finished tree
as a single message cost 1.3 seconds of structured-clone deserialization *on the
main thread* — a longer block than the parse the worker was introduced to move,
and end-to-end the 1MB document went from 2400ms to 3016ms. Slicing the transfer
is what turned the worker into a win. A worker is not automatically a
performance improvement; it is a relocation, and relocation has a price at the
boundary.

**The worker spent two builds silently not running.** It threw at startup — 
first `document is not defined`, from Vite bundling the worker as an IIFE and
inlining every dynamic import including KaTeX, then again from
`decode-named-character-reference`'s browser build, and a third time
`DOMParser is not defined` from the browser build of the HTML parser rehype-katex
uses. Each time the client's fallback caught it and rendered on the main thread,
so the app looked correct and merely performed exactly as it had before. **The
fallback is what made this hard to see**, and it is why the perf spec asserts
long tasks rather than only wall-clock time: the timings alone would have been
explained away as noise, but a 1.3s main-thread task cannot be.

**Two dependencies claim to be isomorphic and are not.** Both ship a `browser`
condition that reaches for the DOM at module scope. Both are aliased to their
DOM-free builds in `vite.config.ts`, globally rather than for the worker alone —
`src/core` claims to be DOM-free and worker-ready, and a dependency quietly
reaching for `document` makes that claim false everywhere it is relied on.

## What is not covered here

**Mermaid hydration is measured only as an absence.** Diagrams render on the
main thread — Mermaid measures text, so it needs a DOM — and they are deferred
until near the viewport, which means the 1MB document's thirty diagrams mostly
never render at all during this measurement. What the settle window proves is
that the ones that *do* render did not produce a task over 50ms. A document with
thirty diagrams stacked in the first screenful is not in this corpus and is not
covered by this result.

**Cold first visit is not measured.** These are warm numbers by design. The
first document of a session additionally pays for the pipeline chunk, and its
first code block for a grammar — off the paint path now, but real.

**One machine.** An M4 is faster than the median developer laptop and much
faster than a CI runner. That is exactly why CI asserts a looser ceiling than
§16 and this report exists to record the strict result separately.
