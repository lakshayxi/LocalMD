# macOS implementation status

**Milestone:** I - Unsigned public beta readiness
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
- Native window close and application quit protect unsaved work. The red close button, Command-W, Command-Q, and the Dock or menu-bar Quit item all funnel through one Rust-owned lifecycle protocol.
- A clean document closes immediately. A dirty one gets a native macOS alert with `Save`, `Don't Save`, and `Cancel`.
- `Save` runs the same store save (or Save As, for an untitled document) every other save path uses. It closes only once that clears the dirty bit. A cancelled picker, a conflict, or an edit that lands mid-save all keep the application open instead.
- `Don't Save` clears the dirty bit and discards the recovery draft for real. It does not leave the draft for the next launch to offer back.
- `Cancel` leaves the document exactly as it was.
- A coordinator flag in Rust makes a second close signal arriving mid-flow a no-op. A double Command-W, or Command-Q while the alert is still open, cannot open a second dialog.
- Fixed a pre-existing correctness bug found during this pass. `confirmDiscard` is the in-app guard behind Open, New, Save As adoption, restoring a draft, reloading from disk, and Close Document. It read `window.confirm(...)` synchronously.
- The dialog plugin the desktop build already depends on for its file pickers replaces `window.confirm` with an async function on init. `!window.confirm(...)` therefore always read a truthy `Promise`, and the "Cancel" branch was never taken. Every one of those guards silently discarded unsaved work in the packaged desktop app, regardless of the reader's answer.
- `confirmDiscard` and its call sites now await the result. That is correct in both the browser, where `confirm` returns a plain boolean, and the desktop build, where it returns a real `Promise<boolean>`.
- Covered by `test/app/store-ownership.test.ts`'s `confirmDiscard against an async confirm` suite. It mocks `window.confirm` as async to reproduce the exact shape that hid the bug.

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

## Close and quit verification

We drove the final release bundle directly, from outside the automated suites, to verify the native lifecycle protocol end to end.

- **Clean quit.** With no document open, Command-Q closed the application immediately. The process exited within about a second, with no dialog. This exercised the real `RunEvent::ExitRequested` path, not a mock.
- **Dirty close.** We opened a disposable file, edited it in Edit mode, and pressed Command-W. The native alert appeared with the exact title and message the Rust code sends — `Do you want to save the changes you made?` / `This document has unsaved changes. Your changes will be lost if you don't save them.` — and `Save`, `Don't Save`, and `Cancel` in that order, `Save` as the default button.
- **Cancel.** Choosing Cancel left the document open with the edit and the dirty marker intact. The application kept running.

This ran against a real Apple Silicon release build. It launched outside Xcode or any test harness — not a debug build, and not a mock of the dialog plugin.

### Gatekeeper behavior on the unsigned build

We also verified, directly, what a reader sees when the disk image counts as downloaded.

- `syspolicyd` killed a quarantined copy of the release `.app` on every launch attempt, whether through `open` or a real Finder double-click. The unified log confirmed the reason each time: `Terminating process due to Gatekeeper rejection`. The kill is asynchronous — the process can run for several seconds, sometimes over a minute, before macOS ends it. A launch that briefly appears to succeed is not evidence Gatekeeper let it through.
- The dialog macOS shows is `"LocalMD" is damaged and can't be opened. You should move it to the Trash.` We checked System Settings → Privacy & Security right after a fresh rejection. One rejection came from an actual Finder double-click, not a script. No "Open Anyway" button appeared either way. Current macOS treats a purely ad hoc-signed binary — no Developer ID identity, no CMS blob — differently from the signed-but-unnotarized case most Gatekeeper guides describe.
- A copy made without the quarantine attribute launched immediately, with no Gatekeeper interference, no App Translocation, and no delayed kill, confirmed by log inspection. That is the state `curl` leaves a file in, since it never applies quarantine the way a browser download does.

This changed the distribution guidance. `reports/macos/distribution.md` now recommends `curl` as the primary install path. It documents `xattr -dr com.apple.quarantine` as the browser-download recovery step, rather than assuming "Open Anyway" is available.

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
report_close_readiness
complete_close_flow
```

It also grants `core:event:allow-listen` and `core:event:allow-unlisten`, added for the close/quit lifecycle protocol: Rust emits the close-check, save, and discard signals, and the frontend listens for them. Neither permission lets the frontend emit an event Rust would act on; it can only receive the three Rust already chooses to send.

The capability does not grant frontend `fs:*`, `dialog:*`, or `core:default` permissions. The Rust backend owns the native dialogs and filesystem operations, including the close/quit alert itself — the frontend never gets a `dialog:*` permission to show one.

The desktop CSP permits bundled content and Tauri IPC. It does not permit remote image sources, and the desktop UI does not offer the browser-only remote-image action. This differs from the browser deployment's response-header CSP. The desktop privacy boundary depends on bundled code, eight narrow commands, two narrow event permissions, and the opaque file registry.

## Verified commands

The following commands passed on 2026-08-13, after the close/quit protocol and the `confirmDiscard` fix:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run build:desktop
npm run test:desktop
npm run test:design
npm run e2e
python3 /Users/shay/.codex/plugins/cache/personal/plain-technical-docs/0.1.0/scripts/ste_lint.py design-qa.md reports/macos/design-system.md reports/macos/implementation-status.md reports/macos/distribution.md
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri -- permission list
npm run desktop:build -- --target aarch64-apple-darwin
hdiutil verify src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/LocalMD_0.2.0_aarch64.dmg
git diff --check
```

Results:

- 282 unit tests passed, including the new close/quit store coverage and the `confirmDiscard against an async confirm` regression suite.
- 15 desktop production tests passed.
- 18 design graph tests passed, including 10 accessibility fixtures.
- The complete Chromium, Firefox, and WebKit matrix completed 321 tests with no failures. It passed 290 tests with 31 intentional capability skips.
- 10 Rust tests passed, including the two new `CloseCoordinator` state-machine tests.
- Browser and desktop production builds passed their external-URL and artifact checks, including the desktop-only assertion that the build excludes service workers and design fixtures.
- The release-mode Apple Silicon application and disk image builds completed successfully from a clean build.
- The disk image passed `hdiutil verify` and has SHA-256 `7d4f0ddcf2dfaeb3302f26963d1198de3f69556fa31afe6a29c9025e0323856f`. This supersedes the earlier `97bfa0ec...` checksum recorded before the close/quit work; the binary changed, so the checksum changed with it.
- The release application reports version 0.2.0, bundle identifier `com.lakshayxi.localmd`, minimum macOS 12.0, and an arm64 executable.
- The packaged application's icon is present at `Contents/Resources/icon.icns`.
- `git diff --check` reported no whitespace errors.
- The focused Markdown reports, including the rewritten distribution report, passed the plain technical English linter.

The debug application path is:

```text
src-tauri/target/debug/bundle/macos/LocalMD.app
```

The local release artifacts are:

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/LocalMD.app
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/LocalMD_0.2.0_aarch64.dmg
```

These artifacts are ready for the v0.2.0 unsigned public beta. This Mac has no Developer ID identity or Apple notarization credentials. The binary carries only its linker-generated ad hoc signature. `spctl` assessment fails on that basis alone. Every build this project produces does this, until a Developer ID exists. That failure does not block distribution. See `reports/macos/distribution.md` for what it means to someone installing the app. See "Close and quit verification" above for what we confirmed about Gatekeeper's real behavior against this exact build.

## Incomplete and limitations

- Finder Open With and cold-start or warm-start file-open events are not implemented.
- Native application menu commands are not implemented. The current File menu is the default Tauri menu.
- Native recents and durable native file references are not implemented. The sidebar shows the active document for the current session, while browser handle persistence remains browser-only.
- Rust revokes opaque native document identifiers when the user replaces or closes a document.
- Drag and drop does not yet establish native file ownership.
- Cmd+W and the red close button quit the whole application rather than closing to an empty state, matching LocalMD's single-window design. Reopening from the Dock without a window is not implemented and is out of scope for this milestone.
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

v0.2.0 is ready to publish as an unsigned Apple Silicon beta. It waits on the maintainer's explicit go-ahead to merge, tag, and upload the release asset. After that, add Developer ID signing and notarization. Handle Finder integration, native menus, and native recents as separate incremental changes.
