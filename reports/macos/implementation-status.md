# macOS implementation status

**Milestone:** H - Local packaging validation
**Date:** 2026-08-13
**Branch:** `macos`

Latest verification: 2026-08-13.

## Working now

- Tauri 2 builds Apple Silicon debug and release applications with bundle identifier `com.lakshayxi.localmd` and minimum macOS version 12.0.
- Version 0.2.0 builds a local release-mode application bundle and disk image.
- The production icon uses a charcoal macOS squircle, warm document surface, terracotta Markdown mark, and a small handwritten `.md` signature on the lower-right of the page. Tauri generated the required PNG, ICNS, and ICO variants.
- The desktop build uses a dedicated React composition root. It excludes the browser service worker and design graph.
- The purpose-built desktop shell uses the shared document store, CodeMirror editor, Markdown pipeline, renderer, and text-shape rules.
- Read, Edit, and Split modes work. Split becomes unavailable when the window is too narrow.
- Command-F searches rendered text in Read mode through a compact, nonmodal titlebar control. It reports the current and total matches, supports forward and backward navigation, and restores focus when closed.
- Edit mode keeps CodeMirror's existing Command-F search. Split uses CodeMirror search when the editor owns focus and document search when the preview owns focus.
- The sidebar keeps Command-K, Command-N, and Command-O hints visible in muted text.
- Unlabelled fenced code uses conservative, local language detection before lazy Shiki highlighting. Ambiguous snippets remain plain.
- The sidebar, command palette, empty state, loading state, error state, light theme, and dark theme use the first-party desktop design system.
- The Tauri overlay title bar uses the real macOS window controls without a duplicate title bar.
- The appearance control switches and persists the selected light or dark theme.
- The desktop shell now uses a Notion-inspired design grammar without copying Notion's product model.
- The 240-pixel sidebar, 44-pixel title bar, and 708-pixel document measure keep the document visually dominant.
- The 40-pixel page title and 16-pixel body text establish a clear editorial hierarchy.
- Read, Edit, and Split use unboxed tabs with a restrained active underline.
- A cold first entry into Edit displays a quiet loading skeleton instead of a blank document surface.
- The active document appears as a selected current-session sidebar item even when it does not have a durable native recent entry.
- Native Open, Save, and Save As work through macOS dialogs.
- A file opened by the native adapter remains file-backed for later in-place saves.
- A new untitled document adopts the selected file after Save As.
- Native reads and writes preserve the shared UTF-8 BOM, LF or CRLF, and final-newline rules.
- Recovered desktop drafts preserve their text shape and use native Save As instead of browser downloads.
- Save checks the current file fingerprint before replacement and reports a conflict instead of writing when the baseline changed.
- Edits made while Save or Save As runs remain dirty and keep their recovery draft.
- Late save and metadata results cannot mutate a replacement document.
- Browser Save rechecks modification time and size after its permission prompt. Ordinary Save refuses to recreate a missing original.
- The desktop checks file metadata when its window regains focus and presents the existing conflict flow.
- The browser distribution remains a separate first-class build target.

## Native verification

We launched and inspected the rebuilt debug application as a real macOS window. We did not infer this result from the browser design graph.

The native smoke flow completed these steps:

1. Opened a disposable `.md` file through the macOS Open panel.
2. Rendered the selected file in Read mode.
3. Switched to Edit, changed the source, and saved in place.
4. Confirmed the dirty marker cleared and the application reported the saved filename.
5. Inspected the saved bytes and confirmed the UTF-8 BOM, CRLF line endings, and final newline remained present.
6. Created an untitled document and opened the macOS Save panel.
7. Selected a Markdown filename and confirmed that the application adopted the new file.
8. Switched the actual native window to dark appearance and back to light appearance.

On 2026-08-13, we launched the exact rebuilt application binary to avoid a stale macOS process and verified:

1. The sidebar displays the Command-K, Command-N, and Command-O hints.
2. Command-F opens the native desktop composition's titlebar Find control.
3. A query with two occurrences reports `1 of 2` and selects the current occurrence.
4. LocalMD detects and highlights an unlabelled TypeScript block in the real Tauri window.

We also launched the final release-mode application bundle. Its accessibility tree exposed the production Tauri root, native window controls, desktop commands, appearance control, and document shell.

We removed the two disposable files after verification.

## Visual verification

We reviewed the actual native window and deterministic desktop screenshots against the LocalMD design brief.

The corrected shell keeps the document as the visual center. The sidebar is quiet, uses one thin separator, and does not compete with the document. The title bar, document identity, mode control, and actions share one compact hierarchy. Read and Edit use a controlled 708-pixel measure. Split aligns both panes and reduces preview heading sizes for the narrower column.

The command palette sits over the document region instead of the full window. Its backdrop uses restrained opacity. Loading, editor-loading, and error states use the document alignment. Light and dark appearances use separate surface and foreground tokens.

We inspected the refined native shell at 1100 by 761 pixels in light and dark appearances. Native Open presented the macOS Open panel. We inspected Read, Edit, Split, and the native command palette. The durable native captures are in `reports/macos/screenshots/`.

Inspectable screenshot coverage includes:

- empty state in light appearance
- Edit in light appearance
- Read in light appearance
- Split in light appearance
- command palette in light and dark appearances
- document search with a live match count
- automatic code detection with a deliberately ambiguous plain-code fallback
- sidebar selected, hover, dirty, missing, long-name, and keyboard-focus states
- loading state
- error state
- narrow collapsed shell
- standard and wide shell geometry

The native screenshots use the `native-notion-*.png` names. Playwright provides the deterministic loading, error, hover, focus, narrow, and wide evidence.

Playwright performs real hover, focus, keyboard, palette, theme, and mode interactions where those states are reachable.

## Security and privacy

The application adds no analytics, telemetry, remote logging, crash service, updater, or remote document processing.

The frontend receives an opaque per-session document identifier, not a filesystem path. Rust keeps the path in a private registry. No command accepts an arbitrary path from the frontend.

The main window capability grants only these custom commands:

```text
open_document
read_document
stat_document
save_document
save_document_as
close_document
```

The capability does not grant frontend `fs:*`, `dialog:*`, or `core:default` permissions. The Rust backend owns the native dialogs and filesystem operations.

The desktop CSP permits bundled content and Tauri IPC. It does not permit remote image sources, and the desktop UI does not offer the browser-only remote-image action. This differs from the browser deployment's response-header CSP. The desktop privacy boundary depends on bundled code, six narrow commands, and the opaque file registry.

## Verified commands

The following commands passed on 2026-08-12:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run build:desktop
npm run test:desktop -- --update-snapshots
npm run test:design -- --update-snapshots
python3 /Users/shay/.codex/plugins/cache/personal/plain-technical-docs/0.1.0/scripts/ste_lint.py design-qa.md reports/macos/design-system.md reports/macos/implementation-status.md
npx playwright test e2e/editor.spec.ts e2e/save.spec.ts e2e/a11y.spec.ts --project=chromium
npx playwright test e2e/reading.spec.ts e2e/print.spec.ts e2e/navigate.spec.ts --project=chromium
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- permission list
npm run tauri -- build --debug --bundles app
npm run desktop:build -- --target aarch64-apple-darwin
hdiutil verify src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/LocalMD_0.2.0_aarch64.dmg
```

Results:

- 276 unit tests passed.
- 15 desktop production tests passed.
- 18 design graph tests passed, including 10 accessibility fixtures.
- 34 focused reading, print, and navigation browser tests passed.
- 32 relevant Chromium browser tests passed.
- The complete Chromium, Firefox, and WebKit matrix completed 321 tests with no failures. It passed 290 tests with 31 intentional capability skips.
- Their existing feature condition skipped 5 download-fallback browser tests.
- 8 Rust native document tests passed.
- Browser and desktop production builds passed their external-URL and artifact checks.
- The final Apple Silicon debug application build completed successfully.
- The release-mode Apple Silicon application and disk image builds completed successfully.
- The disk image passed `hdiutil verify` and has SHA-256 `97bfa0ec8b4569eeea5af55045c2e9ccdfff349a3cc88a047fad4492c3726391`.
- The release application reports version 0.2.0, bundle identifier `com.lakshayxi.localmd`, minimum macOS 12.0, and an arm64 executable.
- The rebuilt native window completed the Command-F and automatic code-detection smoke flow.
- The macOS Open panel opened from the final isolated native QA build.
- The final native Edit view loaded the real CodeMirror textbox after its visible loading state.
- The final native Split view used the reduced preview heading scale.
- The focused Markdown reports passed the plain technical English linter.

The debug application path is:

```text
src-tauri/target/debug/bundle/macos/LocalMD.app
```

The local release artifacts are:

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/LocalMD.app
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/LocalMD_0.2.0_aarch64.dmg
```

These artifacts are not public-ready. This Mac has no Developer ID identity or Apple notarization credentials. Gatekeeper rejects the application, and strict bundle signature verification fails because the binary has only its linker-generated ad hoc signature.

## Incomplete and limitations

- Finder Open With and cold-start or warm-start file-open events are not implemented.
- Native application menu commands are not implemented. The current File menu is the default Tauri menu.
- Native recents and durable native file references are not implemented. The sidebar shows the active document for the current session, while browser handle persistence remains browser-only.
- Rust revokes opaque native document identifiers when the user replaces or closes a document.
- Native close and quit protection are not implemented.
- Drag and drop does not yet establish native file ownership.
- External-change polling uses metadata for the early warning. Save performs the stronger size, modification-time, and SHA-256 comparison.
- Save uses conflict preflight followed by same-directory atomic replacement. Another process can still replace the file in the narrow interval between the final comparison and rename.
- Atomic replacement preserves macOS extended attributes, Finder tags, ACLs, permissions, and ownership where macOS permits.
- Native Open and Save reject files larger than 32 MiB before the Tauri IPC boundary. The shared renderer enters its large-document path above 2 MiB.
- Invalid UTF-8 and mixed line-ending files do not have byte-exact round-trip support. This matches the current shared text model.
- Automatic code detection is best effort. It only applies to unlabelled fenced blocks with strong syntax signals. Explicit language tags always win, and uncertain blocks stay plain.
- Intel and universal builds remain deferred.
- Developer ID signing, notarization, stapling, and release publication remain deferred.
- The complete public distribution procedure is in `reports/macos/distribution.md`.

## Next milestone

Add native close and quit protection before a public release. Then add Developer ID signing and notarization. Handle Finder integration, native menus, and native recents as separate incremental changes.
