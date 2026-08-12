# macOS design system

**Status:** Refined and validated
**Date:** 2026-08-12

## Direction

LocalMD uses a quiet page workspace. The design takes structural cues from Notion without copying its product model or components.

The document remains the primary surface. The sidebar keeps file actions and recent documents close without becoming a file explorer.

Use these rules:

- Keep the document surface continuous.
- Use warm neutral surfaces and restrained separators.
- Use compact navigation rows instead of raised action bars.
- Reserve blue for focus and primary actions.
- Keep shadows for menus and contextual controls.
- Use motion only for state feedback.
- Let the native window draw macOS traffic lights.

## Reference boundary

The [Notion UI documentation](https://notion-ui.vercel.app/docs) is a third-party, Notion-inspired component library. It is not an official Notion specification.

LocalMD uses its sidebar anatomy, compact control density, neutral states, and menu hierarchy as design references. LocalMD does not import its components.

LocalMD does not add workspaces, accounts, sharing, favorites, databases, templates, or trash. Those features do not serve the current file workflow.

## Color and surfaces

Light appearance uses a white document surface and a warm `#f7f7f5` sidebar. Primary text uses `#37352f`.

Dark appearance uses a `#191919` document surface and a `#202020` sidebar. Popovers use `#252525`.

Selected and hover states use low-opacity neutral layers. The selected state does not use an accent rail.

## Typography

- Application controls use the macOS system sans-serif stack at 11 to 14 pixels.
- Page titles use the system display stack at 40 pixels and bold weight.
- Second-level headings use 30 pixels. Third-level headings use 24 pixels.
- Document prose uses 16 pixels with a 26-pixel line height.
- Source editing uses self-hosted DM Mono at 14 pixels.
- Command labels use the system stack. Shortcuts use DM Mono.

Typography carries hierarchy before the interface uses color or borders.

## Geometry

- Titlebar height: 44 pixels.
- Sidebar width: 240 pixels.
- Sidebar row height: 30 pixels.
- Control height: 28 pixels.
- Reading and editor width: 708 pixels.
- Navigation radius: 5 pixels.
- Bar radius: 6 pixels.
- Popover radius: 8 pixels.
- Icon sizes: 14, 16, and 18 pixels.

The spacing scale ranges from 2 to 48 pixels. Production components use shared tokens instead of local values.

## Interaction

Production primitives expose real hover, active, focus-visible, selected, and disabled states.

- Arrow keys move within mode tabs.
- Arrow keys move within the contextual toolbar.
- The command palette supports query, selection, Enter, Escape, Home, and End.
- Keyboard movement skips disabled actions.
- Focus rings remain visible in both appearances.
- Reduced-motion preferences remove nonessential motion.

## Components

The design system includes buttons, icon buttons, mode tabs, sidebar rows, the desktop shell, the contextual toolbar, and the command palette.

Empty, loading, and error states use the document column. They describe the current state and the next action.

All desktop styles use the `data-lmd-shell="desktop"` scope. The browser interface keeps its existing design system.

## Avoid

Do not add card grids, decorative icon boxes, broad gradients, persistent formatting toolbars, or strong borders on every surface.

Do not copy Notion product features that do not match LocalMD. Correct the shared token or state model before adding local CSS exceptions.
