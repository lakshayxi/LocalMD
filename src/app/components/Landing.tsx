import { useState } from 'react';
import { createEmptyDocument, createPastedDocument, openFile } from '@/platform/files';
import { MOD_KEY } from '../format';
import { FEEDBACK_URL, REPO_URL } from '../links';
import { useDocument } from '../store';
import { DraftRecovery } from './DraftRecovery';
import { Recents } from './Recents';

/**
 * The empty state.
 *
 * Deliberately not a marketing page: no hero, no gradient, no feature grid. A
 * developer who lands here wants their file open in five seconds, and every
 * element between them and that is a cost.
 *
 * The trust line is one sentence and sits below the actions rather than above
 * them, because it answers a question the reader has *after* deciding to try
 * this, not before.
 */
export function Landing({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  const open = useDocument((s) => s.open);
  const error = useDocument((s) => s.error);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  async function choose() {
    const source = await openFile();
    if (source) await open(source);
  }

  function submitPaste() {
    if (!pasted.trim()) return;
    void open(createPastedDocument(pasted));
  }

  return (
    <main className="lmd-landing">
      <div className="lmd-landing-inner">
        <h1 className="lmd-landing-title">LocalMD</h1>
        <p className="lmd-landing-sub">Markdown stays local.</p>

        {error && (
          <p className="lmd-landing-error" role="alert">
            {error}
          </p>
        )}

        {/* Above the actions, which is the one thing on this screen it should
            outrank: work the reader has already done and not saved matters more
            than the file they came here to open. */}
        <DraftRecovery />

        {pasting ? (
          <div className="lmd-paste">
            <textarea
              className="lmd-paste-input"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder="Paste Markdown here…"
              aria-label="Markdown to read"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submitPaste();
                if (event.key === 'Escape') setPasting(false);
              }}
            />
            <div className="lmd-landing-actions">
              <button type="button" className="lmd-button is-primary" onClick={submitPaste}>
                Read it
              </button>
              <button type="button" className="lmd-button" onClick={() => setPasting(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="lmd-landing-actions">
            <button type="button" className="lmd-button is-primary" onClick={() => void choose()}>
              Open Markdown
            </button>
            <button type="button" className="lmd-button" onClick={() => setPasting(true)}>
              Paste
            </button>
            <button
              type="button"
              className="lmd-button"
              onClick={() => void open(createEmptyDocument())}
            >
              New
            </button>
          </div>
        )}

        <p className="lmd-landing-hint">
          or drop a file anywhere on this page, paste with {MOD_KEY}V, or press {MOD_KEY}K
        </p>

        <Recents />

        <p className="lmd-landing-trust">
          No uploads. No account. Your file is read in this browser and never sent anywhere.{' '}
          <button type="button" className="lmd-linkish" onClick={onOpenPrivacy}>
            How this works
          </button>
        </p>

        <p className="lmd-landing-meta">
          Open source, and built in the open.{' '}
          <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
            Report something
          </a>{' '}
          or{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            read the source
          </a>
          .
        </p>
      </div>
    </main>
  );
}
