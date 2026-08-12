# Desktop design graph

**Status:** Implemented
**Date:** 2026-08-12

## Purpose

The design graph is a development-only environment for deterministic desktop states. It renders production tokens, primitives, and shell components.

Fixtures supply representative document content and application state. Shell Edit and Split fixtures use the shell fallback editor, not production CodeMirror.

The desktop production suite covers the shared store, CodeMirror, Markdown pipeline, and renderer. That suite remains the integration authority.

Run it with:

```sh
npm run design:graph
```

Open `http://127.0.0.1:4174/design-graph.html`.

Each fixture has a stable URL. For example:

```text
/design-graph.html?fixture=shell-read&theme=light&width=standard
/design-graph.html?fixture=shell-collapsed&theme=dark&width=narrow
```

## Coverage

The graph includes 21 fixtures across foundations, components, and screens.

It covers:

- typography and control foundations
- sidebar normal, selected, dirty, missing, and truncated states
- contextual formatting, active formatting, link creation, existing link, and disabled actions
- command palette open, query, keyboard selection, disabled command, no results, and close behavior
- document Find open, query, match count, next, previous, focus, and no-query states
- no document, loading, open error, read, dirty, external change, drag target, and collapsed sidebar states
- shell-level Edit and Split layouts
- light and dark appearance
- narrow, standard, and wide canvases

## Validation

Run the focused suite with:

```sh
npm run test:design
```

The suite uses actual hover, click, focus, Tab, arrow keys, typing, and Escape interactions. It uses explicit fixture properties only for application states such as dirty, external change, and drag target.

The maintained screenshots cover:

- control focus in light appearance
- sidebar states in dark appearance
- standard light reading shell
- narrow dark shell with collapsed sidebar
- loading and error states in light appearance
- wide dark command palette
- standard light document Find

Accessibility scans cover representative foundations, components, palette, empty shell, and reading shell.

## Production boundary

The normal Vite build uses `index.html` only. It does not include `design-graph.html`.

The browser build runs `assert:no-design-graph`. The desktop artifact check also rejects design-graph markers. The graph does not register a service worker.

## Editing workflow

When an agent changes desktop UI:

1. Find or add the smallest fixture that represents the state.
2. Use production components in the fixture.
3. Reach CSS pseudo-states through Playwright interaction.
4. Run the focused design suite.
5. Inspect changed screenshots at full size.
6. Fix the design rule or component geometry that caused the issue.
7. Run the browser build to confirm that the graph remains excluded.

Do not add a snapshot for every property combination. Add one when a regression would materially affect hierarchy, interaction, appearance, or responsive behavior.
