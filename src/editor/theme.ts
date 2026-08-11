import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

/**
 * Editor appearance, expressed entirely in CSS custom properties.
 *
 * This is the same trick the Shiki output uses, and for the same reason:
 * CodeMirror compiles a theme object into a real stylesheet once, at module
 * load. If the colours were literals, switching light to dark would mean
 * rebuilding the theme and reconfiguring the editor — a visible hitch in the
 * middle of editing. Naming variables instead means the theme is compiled once
 * and the browser repaints when `data-theme` changes on <html>. Nothing is
 * recomputed and no state is touched.
 *
 * It also keeps the palette in one place: tokens.css owns the colours, and the
 * editor cannot drift from the rest of the application.
 */

/**
 * Markdown is prose with markers, not code. The syntax colouring is therefore
 * deliberately quiet — enough to see structure at a glance, not so much that
 * the text stops reading like text. Only what earns its place: headings,
 * links, code, emphasis, and the markers themselves.
 */
const markdownHighlighting = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--fg)', fontWeight: '600' },
  { tag: tags.strong, color: 'var(--fg)', fontWeight: '600' },
  { tag: tags.emphasis, color: 'var(--fg)', fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--accent)' },
  { tag: tags.monospace, color: 'var(--fg)', fontFamily: 'var(--font-mono)' },
  { tag: tags.quote, color: 'var(--fg-muted)' },
  { tag: tags.list, color: 'var(--accent)' },
  // The `#`, `*`, and backticks. Muted rather than hidden: knowing where a
  // marker begins is the point of editing the source at all.
  { tag: tags.processingInstruction, color: 'var(--fg-subtle)' },
  { tag: tags.contentSeparator, color: 'var(--fg-subtle)' },
  { tag: tags.meta, color: 'var(--fg-subtle)' },
]);

const appearance = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'transparent',
    fontSize: 'var(--editor-size)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.7',
    // Matches the document's own top offset so switching modes does not shift
    // the text under the reader's eyes.
    padding: '1.5rem 0 12rem',
  },
  '.cm-content': {
    caretColor: 'var(--fg)',
    // The same measure the rendered document uses, so a paragraph occupies
    // roughly the same width in both modes.
    maxWidth: 'var(--prose-measure)',
    margin: '0 auto',
    padding: '0 1.5rem',
  },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  // CodeMirror paints its own selection layer once `drawSelection` is on, and
  // the native ::selection has to be matched to it or the two disagree.
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--accent-soft)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--bg-raised)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--warning-soft)',
    outline: '1px solid var(--warning)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--accent-soft)' },
  '.cm-panel input, .cm-panel button': {
    fontFamily: 'inherit',
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)',
  },
});

export const editorTheme: Extension = [appearance, syntaxHighlighting(markdownHighlighting)];
