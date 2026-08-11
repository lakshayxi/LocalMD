import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
  markdownLanguage,
} from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, keymap } from '@codemirror/view';
import { editorTheme } from './theme';

/**
 * The editor's extension set, assembled by hand.
 *
 * **Deliberately not `basicSetup`.** The umbrella export from the `codemirror`
 * package is a curated IDE: line numbers, a fold gutter, bracket closing,
 * autocompletion, lint gutters, active-line highlighting. It also makes every
 * one of those a static dependency, so the bundle pays for an autocompletion
 * engine that a Markdown editor never opens. Listing extensions individually
 * costs a dozen lines and buys both a smaller chunk and an editor that behaves
 * like a writing surface.
 *
 * What is left out, and why:
 *
 * - **Line numbers and the fold gutter.** This edits prose. A gutter would put
 *   a column of numbers beside a paragraph and make the thing look like an IDE,
 *   which the plan rules out explicitly.
 * - **Autocompletion.** There is nothing to complete in Markdown, and the
 *   package is one of the larger ones.
 * - **`closeBrackets`.** Auto-inserting `)` while writing prose is actively
 *   wrong: parentheses in a sentence are far more common than in an expression.
 * - **`indentWithTab`.** Binding Tab to indentation traps keyboard users inside
 *   the editor with no way to tab out, which fails the keyboard-operability
 *   commitment. CodeMirror's default — Tab moves focus — is the accessible one,
 *   and Markdown needs no indentation help.
 *
 * **Note the import below: `markdownLanguage`, never `markdown()`.** This is a
 * measured 69.5 KB gzip, not a style preference. `@codemirror/lang-markdown`
 * evaluates `html()` at module scope so that `markdown()` can highlight
 * embedded HTML tags, which drags in the HTML, JavaScript, and CSS Lezer
 * grammars plus the autocompletion engine — 178.0 KB gzip against 108.5 KB for
 * this chunk. Taking the language and the two commands as named imports leaves
 * that binding unreachable, and it shakes out; the built chunk is checked for
 * those grammars in e2e/editor.spec.ts so the saving cannot silently regress.
 *
 * The cost is that raw HTML inside a document is not syntax coloured while
 * editing. It still parses; it is simply grey. Raw HTML in these documents is
 * `<details>`, `<br>`, and `<img align>`, which nobody needs coloured.
 *
 * Building the language from `@lezer/markdown` directly measures the same
 * 108.5 KB and looks tempting, but is a trap: `insertNewlineContinueMarkup`
 * gates on `markdownLanguage.isActiveAt()` against *that* instance, so pairing
 * the commands with a hand-built language turns them into silent no-ops. Same
 * bytes, no list continuation.
 */

export interface EditorOptions {
  doc: string;
  onChange: (text: string) => void;
  /** Named for screen readers, which otherwise announce only "edit text". */
  ariaLabel: string;
}

export function editorExtensions({ onChange, ariaLabel }: Omit<EditorOptions, 'doc'>): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    // Continues lists and blockquotes onto the next line, which is the one
    // structural affordance prose editing genuinely wants.
    indentOnInput(),
    bracketMatching(),
    search({ top: true }),
    highlightSelectionMatches(),

    // GFM — tables, task lists, strikethrough, autolinks. The language on its
    // own, without the `markdown()` wrapper; see the note above for why.
    //
    // Fenced code is deliberately not highlighted *inside the editor*. Wiring in
    // @codemirror/language-data would mean a language registry plus a chunk per
    // language, and the preview already shows those blocks fully highlighted by
    // Shiki — the editor would be duplicating work the reader can already see.
    markdownLanguage,

    // Prose wraps. Without this a long paragraph becomes one horizontal scroll.
    EditorView.lineWrapping,
    editorTheme,

    EditorState.allowMultipleSelections.of(true),
    EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),

    EditorView.updateListener.of((update) => {
      // `docChanged` rather than every update: selection moves and focus changes
      // fire here too, and reporting those as edits would mark a document dirty
      // for putting the cursor in it.
      if (update.docChanged) onChange(update.state.doc.toString());
    }),

    // Order matters: the first matching binding wins. Enter continues a list or
    // blockquote and Backspace removes a whole marker rather than one character
    // of it — the two commands that make editing Markdown feel like Markdown —
    // so both are registered ahead of the defaults they would otherwise lose to.
    keymap.of([
      { key: 'Enter', run: insertNewlineContinueMarkup },
      { key: 'Backspace', run: deleteMarkupBackward },
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
  ];
}

/** Creates a mounted editor. The caller owns the returned view and must destroy it. */
export function createEditor(parent: HTMLElement, options: EditorOptions): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: editorExtensions(options),
    }),
  });
}
