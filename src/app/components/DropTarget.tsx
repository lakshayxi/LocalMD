import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { sourceFromDrop, UnsupportedFileError } from '@/platform/files';
import { useDocument } from '../store';

/**
 * Makes the whole viewport a drop target.
 *
 * A bordered drop *box* is a smaller target for no benefit — if a file is over
 * the window, the intent is unambiguous. The overlay appears only while
 * dragging, so it costs nothing visually the rest of the time.
 *
 * Drag events fire per-element, so a naive dragleave handler flickers as the
 * pointer crosses children. Counting enter/leave pairs is the standard fix and
 * the reason this tracks depth rather than a boolean.
 */
export function DropTarget({ children }: { children: ReactNode }) {
  const open = useDocument((s) => s.open);
  const [depth, setDepth] = useState(0);
  const [rejection, setRejection] = useState<string | null>(null);

  const reset = useCallback(() => setDepth(0), []);

  useEffect(() => {
    // Without these, dropping a file outside a handler makes the browser
    // navigate to it, silently discarding whatever the reader had open.
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    reset();
    setRejection(null);

    try {
      await open(await sourceFromDrop(event.dataTransfer));
    } catch (error) {
      setRejection(
        error instanceof UnsupportedFileError
          ? error.message
          : 'That file could not be opened.',
      );
    }
  }

  return (
    <div
      className="lmd-drop-root"
      onDragEnter={(event) => {
        event.preventDefault();
        setDepth((current) => current + 1);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDepth((current) => Math.max(0, current - 1))}
      onDrop={(event) => void handleDrop(event)}
    >
      {children}

      {depth > 0 && (
        <div className="lmd-drop-overlay" aria-hidden="true">
          <div className="lmd-drop-message">Drop to open</div>
        </div>
      )}

      {rejection && (
        <div className="lmd-toast" role="alert">
          {rejection}
          <button type="button" className="lmd-toast-close" onClick={() => setRejection(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
