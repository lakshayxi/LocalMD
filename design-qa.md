# Desktop design QA

## Design sources

The primary sources are the user's screenshots and product brief.

We also reviewed the official Notion desktop shell and sidebar guidance. The third-party Notion UI kit supplied component-level reference patterns.

LocalMD uses the references as design grammar. It does not copy Notion's product model, workspace features, account areas, or promotional surfaces.

## Implementation evidence

Native Tauri captures:

- `reports/macos/screenshots/native-notion-empty-light-final.png`
- `reports/macos/screenshots/native-notion-read-light-final.png`
- `reports/macos/screenshots/native-notion-read-dark-final.png`
- `reports/macos/screenshots/native-notion-editor-loading-light-final.png`
- `reports/macos/screenshots/native-notion-edit-light-final.png`
- `reports/macos/screenshots/native-notion-split-light-final.png`
- `reports/macos/screenshots/native-notion-command-palette-light-final.png`

Deterministic browser evidence:

- `e2e/desktop/bootstrap.spec.ts-snapshots/`
- `e2e/design-graph/__screenshots__/`

The Playwright fixtures cover empty, loading, error, Read, Edit, Split, palette, sidebar, narrow, wide, light, dark, focus, and hover states.

## Design decisions

- The document surface is white in light mode and `#191919` in dark mode.
- The quiet sidebar uses a warmer adjacent surface and one separator.
- The sidebar is 240 pixels wide. The title bar is 44 pixels high.
- Document and editor columns use a 708-pixel maximum width.
- Page titles use 40-pixel system text. Body copy uses 16-pixel text with a 26-pixel line height.
- Source editing and keyboard shortcuts use the local DM Mono font.
- Navigation rows are 30 pixels high with 5-pixel radii.
- A restrained underline marks the active Read, Edit, or Split tab.
- Split mode reduces heading scale to fit the narrower preview pane.
- The command palette uses sans-serif labels and mono shortcuts.
- Empty, loading, error, and editor-loading states use the same document alignment.
- All visible creation and file actions use document vocabulary.

## Review history

### Initial native shell

The first shell had a centered filename, boxed Open action, segmented mode pill, narrow document measure, and generic landing copy.

### Notion-inspired pass

We moved document identity left, flattened navigation, widened the reading measure, strengthened page typography, and removed promotional copy.

We adopted a warm neutral palette and replaced custom icons with a consistent icon library.

### Final native review

The first Edit capture showed an empty Suspense fallback. This could resemble data loss on a cold editor load.

The fallback now shows a quiet editor-column skeleton with a polite status. The final Edit capture waits for the real textbox.

The first Split capture used the full page heading scale. Split now uses smaller heading tokens without changing Read mode.

The loading fixture now exposes a polite live status. Error remains an alert.

The final combined comparison confirmed the intended shared grammar: quiet navigation, low chrome, warm surfaces, and a dominant document canvas.

## Result

No P0, P1, or P2 visual issue remains in the reviewed states.

The final application icon uses the same warm paper, charcoal, and terracotta vocabulary, with a small handwritten `.md` signature. Durable native recents remain separate later work.
