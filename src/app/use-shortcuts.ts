import { useEffect } from 'react';

/**
 * The global keyboard map.
 *
 * Everything here is a chord the browser either ignores or spends on something
 * a reading surface does not need. ⌘F is deliberately absent: native find beats
 * anything we would build, operates on the real rendered text, and is the
 * reason the document is not virtualized. ⌘E and ⌘\ belong to M4's editor and
 * are not claimed early.
 */

/** True when a keystroke is destined for a text field and is none of our business. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function useShortcuts({
  onPalette,
  onOpen,
  onPaste,
  onToggleMode,
  onToggleSplit,
  onSave,
  onSaveAs,
}: {
  onPalette: () => void;
  onOpen: () => void;
  onPaste: (text: string) => void;
  onToggleMode: () => void;
  onToggleSplit: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Ctrl alongside Meta so the same map works on Windows and Linux without
      // sniffing the platform.
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

      const key = event.key.toLowerCase();

      // ⌘K reaches the palette even from inside a text field — it is the way out
      // of wherever you are, which is the whole point of a command palette.
      if (key === 'k') {
        event.preventDefault();
        onPalette();
        return;
      }

      // These three all have to work from inside the editor: ⌘E is how you get
      // *out* of Edit mode, ⌘S is most wanted precisely while typing, and
      // CodeMirror's content counts as a text field.
      if (key === 'e') {
        event.preventDefault();
        onToggleMode();
        return;
      }

      if (key === '\\') {
        event.preventDefault();
        onToggleSplit();
        return;
      }

      // Taking ⌘S from the browser is the point: "Save Page As" is never what
      // someone means here, and letting it through would save the *application*
      // instead of the document.
      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) onSaveAs();
        else onSave();
        return;
      }

      if (isTyping(event.target)) return;

      if (key === 'o') {
        event.preventDefault();
        onOpen();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPalette, onOpen, onToggleMode, onToggleSplit, onSave, onSaveAs]);

  useEffect(() => {
    function onPasteEvent(event: ClipboardEvent) {
      // Reading the clipboard through the paste event rather than
      // `navigator.clipboard.readText()`: the event only ever carries what the
      // reader deliberately pasted, needs no permission, and never prompts. A
      // product built on not touching your data should not be asking for
      // standing clipboard access.
      if (isTyping(event.target)) return;

      const text = event.clipboardData?.getData('text/plain');
      if (!text?.trim()) return;

      event.preventDefault();
      onPaste(text);
    }

    window.addEventListener('paste', onPasteEvent);
    return () => window.removeEventListener('paste', onPasteEvent);
  }, [onPaste]);
}
