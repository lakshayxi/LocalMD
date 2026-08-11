import { useEffect, useRef, useState } from 'react';
import { scrubSvgCss } from '@/core/security/svg-css';

/**
 * Renders a Mermaid diagram after mount.
 *
 * Mermaid is the heaviest and least predictable dependency in the product, so
 * it is fenced in on four sides:
 *
 * 1. **Loaded on demand, and only once.** ~500KB that most documents never
 *    need. The import promise is cached at module scope so a document with
 *    thirty diagrams downloads it once.
 *
 * 2. **`securityLevel: 'strict'` with `htmlLabels: false`.** Diagram labels are
 *    document content, and with HTML labels enabled they are an injection
 *    vector straight into the SVG.
 *
 * 3. **Output sanitized before insertion.** Mermaid already runs DOMPurify
 *    internally at strict level; this is a second, independent pass with our
 *    own configuration, because inserting generated SVG is the one place in the
 *    product where `dangerouslySetInnerHTML` is unavoidable, and a CVE in
 *    Mermaid should not become a CVE in LocalMD.
 *
 * 4. **Every failure is caught and shown in place.** A malformed diagram is a
 *    thing the reader wants explained, not a blank space and certainly not a
 *    dead page. Mermaid throws readily and its errors are actually useful, so
 *    they are surfaced verbatim alongside the source.
 *
 * Rendering is deferred until the diagram is near the viewport: a document with
 * many diagrams would otherwise block on all of them at once.
 */

type MermaidModule = typeof import('mermaid')['default'];

let mermaidPromise: Promise<MermaidModule> | null = null;

async function loadMermaid(): Promise<MermaidModule> {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      // Diagram colours follow the page. Reading the resolved custom property
      // rather than guessing keeps diagrams consistent with the document in
      // both themes.
      theme: 'base',
      themeVariables: readThemeVariables(),
      fontFamily: 'var(--font-prose)',
    });
    return mermaid;
  });

  return mermaidPromise;
}

function readThemeVariables(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  const fg = token('--fg', '#1a1a18');
  const bg = token('--bg-surface', '#f4f4f0');
  const border = token('--border-strong', '#d2d2ca');

  return {
    background: bg,
    primaryColor: bg,
    primaryTextColor: fg,
    primaryBorderColor: border,
    lineColor: border,
    secondaryColor: bg,
    tertiaryColor: bg,
    textColor: fg,
    mainBkg: bg,
    nodeBorder: border,
  };
}

/**
 * Independent sanitization of Mermaid's SVG output.
 *
 * Mermaid produces this markup itself, but "produced by a dependency" is not
 * the same as "trusted" when the input to that dependency is an untrusted
 * document. DOMPurify comes along with Mermaid, so this costs no extra bytes.
 */
async function sanitizeSvg(svg: string): Promise<string> {
  const { default: DOMPurify } = await import('dompurify');

  const clean = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // `style` is allowed because Mermaid puts every fill and stroke rule in an
    // embedded stylesheet — strip it and the diagram renders as solid black
    // shapes. It is scrubbed below rather than trusted.
    //
    // foreignObject smuggles arbitrary HTML into an SVG context; it is the
    // reason htmlLabels is off above, and the backstop if that regresses.
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'a'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'href', 'xlink:href'],
    ADD_TAGS: ['style'],
  });

  // CSS is a network primitive, not just presentation — see scrubSvgCss.
  return scrubSvgCss(clean);
}

interface Status {
  state: 'pending' | 'ready' | 'failed';
  svg?: string;
  error?: string;
}

let diagramCounter = 0;

export function Mermaid({ source }: { source: string }) {
  const [status, setStatus] = useState<Status>({ state: 'pending' });
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;

    // Printing must not silently omit diagrams. Deferred rendering means
    // anything below the fold has never been drawn, so a print started from the
    // top of a long document would emit source text where the diagrams should
    // be. `beforeprint` fires early enough to force them; Safari does not fire
    // it reliably, hence the matchMedia listener as well.
    const renderNow = () => setVisible(true);
    const printQuery = window.matchMedia('print');

    window.addEventListener('beforeprint', renderNow);
    printQuery.addEventListener('change', (event) => {
      if (event.matches) renderNow();
    });

    const element = container.current;
    const observer = element
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) renderNow();
          },
          // Start a little before the diagram scrolls in, so it is usually
          // ready by the time the reader reaches it.
          { rootMargin: '400px' },
        )
      : null;

    if (element && observer) observer.observe(element);

    return () => {
      window.removeEventListener('beforeprint', renderNow);
      observer?.disconnect();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    void (async () => {
      try {
        const mermaid = await loadMermaid();
        diagramCounter += 1;
        const { svg } = await mermaid.render(`lmd-diagram-${diagramCounter}`, source);
        const safe = await sanitizeSvg(svg);
        if (!cancelled) setStatus({ state: 'ready', svg: safe });
      } catch (error) {
        if (cancelled) return;
        setStatus({
          state: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, source]);

  if (status.state === 'failed') {
    return (
      <div className="lmd-mermaid-error" role="group" aria-label="Diagram failed to render">
        <p className="lmd-mermaid-error-title">This diagram could not be rendered</p>
        <pre className="lmd-mermaid-error-message">{status.error}</pre>
        <details>
          <summary>Diagram source</summary>
          <pre>{source}</pre>
        </details>
      </div>
    );
  }

  return (
    <div ref={container} className="lmd-mermaid-figure">
      {status.state === 'ready' && status.svg ? (
        // The one place in the product that inserts markup as a string. The
        // value is machine-generated and has been through two independent
        // sanitizers; see the note at the top of this file.
        <div className="lmd-mermaid-svg" dangerouslySetInnerHTML={{ __html: status.svg }} />
      ) : (
        <pre className="lmd-mermaid-source">{source}</pre>
      )}
    </div>
  );
}
