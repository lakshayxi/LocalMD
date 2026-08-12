# macOS architecture

**Status:** Accepted bootstrap architecture
**Date:** 2026-08-12
**Branch:** `macos`

## Product structure

LocalMD remains one product in one repository.

```text
LocalMD
├── shared document, editor, and rendering logic
├── browser distribution
└── macOS distribution
```

The browser distribution remains a release target. The macOS distribution uses Tauri 2 and a purpose-built desktop shell.

## Current repository constraints

The repository already has useful module boundaries:

- `src/core` contains portable Markdown and text logic.
- `src/platform` contains browser file, persistence, synchronization, and worker code.
- `src/render` converts sanitized trees into React output.
- `src/editor` owns CodeMirror integration.
- `src/app` owns document state and the browser shell.

The branch began with uncommitted browser changes. Desktop work preserves these changes and avoids unrelated rewrites.

The shared document path already preserves these properties:

- UTF-8 byte order mark behavior
- LF and CRLF line endings
- final-newline behavior
- explicit save cancellation
- save-time external-change protection
- Save As source adoption
- bounded draft recovery
- per-document remote-content permission

The desktop distribution must keep these properties.

## Chosen architecture

Keep the current Vite project. Add a small Tauri 2 backend under `src-tauri`. The first bootstrap ran the browser composition in Tauri to prove the build and runtime path. The desktop Vite mode now replaces only the HTML entry module and starts a dedicated desktop composition root.

Use separate browser and desktop composition roots. The desktop root renders the purpose-built shell with the shared document store, CodeMirror editor, Markdown pipeline, and renderer. It excludes the browser application shell and PWA registration.

```text
                         shared logic
               document state, editor, renderer
                              |
                     platform contracts
                     /                \
          browser adapter          desktop adapter
         browser APIs and UI       Tauri commands and UI
```

Keep target selection at the composition root. Do not add distributed `isTauri` checks.

The desktop root uses the shared store with injected desktop document actions. The store recognizes an explicit file-backed source capability. Browser handle persistence stays behind a browser-only source guard. Native sources do not expose paths or browser handles to shared state.

Reuse these modules in both distributions:

- text decoding and encoding
- Markdown parsing and sanitization
- render worker and React renderer
- CodeMirror setup
- document state rules
- save outcome rules
- conflict resolution rules
- design primitives where both shells need them

Give each distribution its own shell. The desktop shell will not reuse the browser header and landing layout as its final interface.

## Platform contract changes

Keep `DocumentSource` as the main document contract. Extend its capabilities without exposing browser or Tauri implementation details.

`FileBackedDocumentSource` provides metadata access and reload behavior. The shared store uses this capability for conflict checks. A separate browser-source guard protects browser recents, handle persistence, and peer-tab identity.

The current capabilities include:

- persistent file reference
- recent-file support
- draft-file reference
- file metadata access
- external-change checks
- reload from the original file
- file identity where available

Keep browser `FileSystemFileHandle` values inside the browser adapter. Keep native paths inside the Rust backend.

Use one shared save result model. Preserve `saved`, `downloaded`, `cancelled`, and `conflict` results.

## Native bridge

The Tauri bridge stays narrow. Rust owns operating-system integration and filesystem authority. The frontend receives an opaque document identifier and public metadata. Rust maps that identifier to a canonical path in a private registry.

Rust responsibilities:

- native Open and Save dialogs
- validated UTF-8 file reads
- same-directory atomic replacement
- fresh size, modification-time, and SHA-256 checks before writes
- Finder and Open With events
- native application menus
- window close and application quit coordination
- macOS bundle metadata
- file associations
- native drag paths
- application and disk image packaging

React and TypeScript responsibilities:

- document state
- editor behavior
- Markdown rendering
- conflict decisions
- mode transitions
- command presentation
- desktop shell layout
- design system and design graph

Do not route ordinary document logic through Rust.

## Filesystem security

Do not grant the frontend broad home-directory access.

Use native dialogs and Finder events to establish file authority. Validate every path before the backend reads or writes it.

The main window grants only six custom commands: open, read, stat, save, Save As, and close. It grants no frontend file-system or dialog plugin permissions. Close revokes the opaque file token when the user replaces a document or leaves the shell.

Use a same-directory temporary file and atomic replacement for saves. A failed write must not truncate the original file.

Check a fresh file fingerprint immediately before every in-place save. A file watcher can provide earlier notice, but cannot replace this check.

This approach provides conflict preflight and atomic replacement. It does not provide an absolute compare-and-swap operation. Another process can replace the target between the final comparison and rename.

## Persistence

Keep the browser persistence adapter unchanged where practical.

The desktop distribution needs platform-neutral recent and draft references. It must not store browser handles in shared state.

The first desktop version keeps preferences and draft text in WebView storage. It does not persist opaque native identifiers because they expire when the application exits. Native recents need a separate persistent-reference design.

Store no saved document content in recents. Store draft text only while the document remains dirty.

## Application lifecycle

Browser `beforeunload` does not protect a native window close or application quit.

Add one shared discard decision flow. Connect browser navigation and Tauri lifecycle events to that flow.

Queue Finder file-open events until the frontend is ready. Handle cold-start and warm-start events.

Use a single application process for the first desktop milestone. Defer multiple desktop windows unless native behavior requires them.

## Browser and desktop builds

Keep the browser build commands and production checks unchanged.

Use separate desktop development and build commands. Tauri uses the dedicated desktop Vite mode. A small Vite HTML transform selects `src/desktop/main.tsx` without adding a second HTML document or duplicating build configuration.

The desktop build must not register the browser service worker. The browser distribution keeps its current offline behavior.

Use separate Content Security Policy settings for browser and desktop builds. Use CSP after this first definition.

The browser CSP uses response headers and a meta element. Tauri injects its configured CSP into bundled application files.

The desktop privacy claim relies on three controls:

- no document upload or remote processing code
- no analytics, telemetry, or remote logging
- narrow Tauri capabilities and no remote image source in the desktop CSP

The browser response-header guarantee does not transfer to the desktop runtime. Desktop documentation must state this difference.

## Desktop design architecture

Create a small first-party design system before the desktop shell grows.

Use production tokens and primitives in a development-only design graph. Keep design fixtures outside the production user experience.

Use Playwright to reach real hover, focus, keyboard, selection, and menu states. Use explicit fixtures only for deterministic application state.

Keep screenshot coverage small and high value. Cover shell widths, themes, document states, sidebar states, and the command palette.

## Tauri 2 configuration

Use the official Vite integration model:

- `frontendDist` points to the desktop build output.
- `devUrl` uses a fixed Vite port.
- `beforeDevCommand` starts the desktop Vite mode.
- `beforeBuildCommand` builds the desktop frontend.

Define one capability for the main window. Grant only the five generated custom command permissions. Rust uses the dialog plugin without exposing its frontend commands.

Configure `md` and `markdown` file associations only after LocalMD handles Finder open events. The confirmed bundle identifier is `com.lakshayxi.localmd`.

Build `app` and `dmg` targets. Keep updater artifacts disabled.

Official references:

- [Tauri Vite integration](https://v2.tauri.app/start/frontend/vite/)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri dialog plugin](https://v2.tauri.app/plugin/dialog/)
- [Tauri configuration](https://v2.tauri.app/reference/config/)
- [Tauri disk image packaging](https://v2.tauri.app/distribute/dmg/)

## Alternatives considered

### SwiftUI rewrite

Rejected. It would duplicate the editor, rendering pipeline, document rules, and test surface.

### Final web shell inside Tauri

Rejected as the product architecture. It is acceptable only as a bootstrap check.

### Large monorepo conversion

Rejected for the first desktop version. The existing boundaries can support two distributions with smaller changes.

### Broad Tauri file-system scopes

Rejected. They would give compromised frontend code more filesystem authority than LocalMD needs.

### Storybook

Deferred. A small design graph can reuse production components without another build system.

## Main risks

- Current browser work overlaps the store, application shell, rendering path, styles, Vite configuration, dependencies, and tests.
- This machine uses Rust stable for `aarch64-apple-darwin`.
- This machine uses the selected full Xcode toolchain. The current desktop work does not depend on an Xcode-only tool.
- Native close and quit events require a new discard decision flow.
- Desktop recent files need a persistent native reference without broad filesystem access.
- Finder open events need deterministic cold-start and warm-start handling.
- The browser service worker must stay out of the desktop build.
- Tauri CSP and command permissions need separate privacy verification.
- A universal application requires Apple Silicon and Intel Rust targets.

## Confirmed product defaults

- primary architecture: Apple Silicon
- Intel and universal compatibility: preserve, but defer production and testing
- bundle identifier: `com.lakshayxi.localmd`
- minimum macOS version: macOS 12.0
- distribution: direct-download `.dmg` only
- Mac App Store: deferred
- design source: the design language in the macOS brief
- browser features: keep all current features unless a native replacement is better

The first packaging milestone will produce and test the distributable artifacts. The current bootstrap produces only an unsigned local debug application.
