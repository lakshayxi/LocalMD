import { useState } from 'react';
import { clearAllLocalData } from '@/platform/persistence';
import { FEEDBACK_URL, REPO_URL } from '../links';
import { useDocument } from '../store';

/**
 * The privacy page.
 *
 * This is the product's central claim written out in full, so it has one job
 * above all others: be *accurate*. An overclaim a competent reader can falsify
 * does more damage than a modest true one, because the whole proposition rests
 * on being believed.
 *
 * So the guarantee is stated as two layers with different strengths rather than
 * one absolute sentence, the weaker layer is named as weaker, and all three
 * caveats are given plainly rather than buried.
 */
/**
 * The erase control.
 *
 * Inline confirmation rather than a `confirm()` dialog: this sits inside the
 * page that just explained what is stored, so the second click happens with the
 * explanation still on screen. It reports completion, because a destructive
 * button that produces no visible change leaves you wondering whether it worked.
 */
function ClearLocalData() {
  const hydrate = useDocument((s) => s.hydrate);
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'done'>('idle');

  if (phase === 'done') {
    return <p role="status">Cleared. Recent documents and preferences are gone from this browser.</p>;
  }

  async function clear() {
    await clearAllLocalData();
    // Re-reads what is now an empty store, so the recents list and the theme
    // fall back to their defaults without a reload.
    await hydrate();
    setPhase('done');
  }

  return (
    <p>
      {phase === 'idle' ? (
        <button type="button" className="lmd-button" onClick={() => setPhase('confirming')}>
          Clear local data
        </button>
      ) : (
        <>
          <button type="button" className="lmd-button" onClick={() => void clear()}>
            Yes, clear it
          </button>{' '}
          <button type="button" className="lmd-button" onClick={() => setPhase('idle')}>
            Cancel
          </button>{' '}
          <span className="lmd-inline-note">Your files are not touched.</span>
        </>
      )}
    </p>
  );
}

export function PrivacyPage({ onClose }: { onClose: () => void }) {
  return (
    <main className="lmd-page">
      <article className="lmd-document lmd-prose-page">
        <p className="lmd-page-back">
          <button type="button" className="lmd-linkish" onClick={onClose}>
            ← Back
          </button>
        </p>

        <h1>Privacy</h1>

        <p className="lmd-lede">
          LocalMD never uploads your document. Parsing, rendering, and editing happen entirely in
          your browser. There is no upload endpoint and no document backend. After the first load,
          LocalMD makes no network requests of its own.
        </p>

        <h2>How that is enforced</h2>

        <p>
          The guarantee rests on two mechanisms with <strong>different strengths</strong>. They are
          described separately on purpose, because collapsing them into a single claim would
          overstate what the weaker one can promise.
        </p>

        <h3>1. Content Security Policy — structural</h3>

        <p>
          LocalMD is served with <code>connect-src 'none'</code>. This structurally prevents{' '}
          <em>programmatic</em> network egress: no <code>fetch</code>, <code>XMLHttpRequest</code>,{' '}
          <code>WebSocket</code>, <code>sendBeacon</code>, or <code>EventSource</code> can leave the
          page — even if one of our dependencies were compromised. It is enforced by your browser,
          not by our good intentions, and you can confirm it yourself in the network tab.
        </p>

        <h3>2. The renderer&rsquo;s image gate — application code</h3>

        <p>
          Remote images and media referenced <em>by your document</em> are blocked unless you
          explicitly allow them. This has to live in application code rather than in the policy,
          because <code>img-src</code> must keep permitting <code>https:</code> for the opt-in to be
          possible at all.
        </p>

        <p className="lmd-callout">
          This layer is ordinary code, and ordinary code can have bugs. A defect in the image gate
          could still produce a request we did not intend. That is the honest limit of the claim.
        </p>

        <p>
          Because it is code rather than policy, it is backed by a test rather than a promise. Every
          commit runs an automated check, in Chrome, Firefox, and Safari, that opens a document full
          of remote images and tracking pixels and asserts that <strong>zero</strong> cross-origin
          requests are made. A second check runs with the opt-in <em>enabled</em> and asserts that
          only the hosts your document actually names are contacted, and only for images.
        </p>

        <h2>Three things this does not cover</h2>

        <h3>Your document&rsquo;s own URLs</h3>
        <p>
          If your Markdown contains <code>![](https://example.com/private-id.png)</code>, loading it
          would tell <code>example.com</code> that you opened this document. LocalMD blocks that by
          default and tells you which host is involved before you decide. The decision applies to
          one document, for one session — opening another document starts from blocked again.
        </p>

        <h3>Hosting logs</h3>
        <p>
          Whoever serves the application sees that you loaded it: your IP address, your browser, and
          which files you fetched. That is true of every website, and it is the same information they
          would have if you loaded a blank page. They never see a document, because documents are
          never sent.
        </p>

        <h3>Local storage is not encrypted by us</h3>
        <p>
          Two things are kept in your browser&rsquo;s own storage: your reading preferences, and a
          list of recently opened documents. The recents list holds each file&rsquo;s{' '}
          <strong>name and a handle</strong> — a reference your browser can use to reopen it — and{' '}
          <strong>never any of its contents</strong>, not even a preview line. Once editing ships,
          unsaved drafts will be kept there too.
        </p>
        <p>
          Anything with access to your browser profile can read all of it. LocalMD does not add
          encryption on top, and you should not treat browser storage as a safe. You can erase all
          of it at any time:
        </p>

        <ClearLocalData />

        <h2>What LocalMD does not include</h2>

        <ul>
          <li>No analytics, of any kind.</li>
          <li>No error or crash reporting.</li>
          <li>No accounts, and nothing to sign in to.</li>
          <li>No cookies.</li>
          <li>
            No third-party code, fonts, or CDNs. Everything is served from this one origin, and the
            build fails if a third-party URL reaches the bundle.
          </li>
        </ul>

        <h2>Check it yourself</h2>

        <p>
          You do not have to take any of this on trust, and you should not have to. The source is
          public, the bundle is unobfuscated, and the behaviour is observable:
        </p>

        <ul>
          <li>Open your browser&rsquo;s network tab, load a document, and watch what happens.</li>
          <li>
            Read the <a href={REPO_URL}>source</a> — the policy is in <code>csp.config.mjs</code>,
            the image gate in <code>src/core/markdown/plugins/images.ts</code>.
          </li>
          <li>Turn off your network connection after the page loads. Everything still works.</li>
        </ul>

        <p className="lmd-page-footer">
          Something here inaccurate or unclear?{' '}
          <a href={FEEDBACK_URL}>Tell us</a> — being wrong about this matters more than most bugs.
        </p>
      </article>
    </main>
  );
}
