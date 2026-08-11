import { useEffect, useRef, useState } from 'react';

/**
 * Tells a heavy block when it is worth rendering itself.
 *
 * Two things ask this — Mermaid diagrams and syntax highlighting — for the same
 * reason: a document with two hundred of either would otherwise do all two
 * hundred at once, in one task, before the reader has scrolled anywhere.
 *
 * True once and stays true. A block that has been upgraded must not be
 * downgraded when it scrolls away: the work is already done, and tearing it
 * down would make scrolling *back* cost more than scrolling forward ever did.
 *
 * **Printing forces it, but does not wait for it.** Deferred work means anything
 * below the fold has never been done, so a print started from the top of a long
 * document would otherwise emit plain source where the diagrams and highlighting
 * should be. `beforeprint` starts that work; Safari does not fire it reliably,
 * hence the matchMedia listener alongside it. What no listener can do is hold
 * the print back for an async round trip, so a first print of a long document
 * can still put plain code on the page. That is survivable by design and not
 * worth more machinery: print forces every token to black anyway
 * (`src/styles/print.css`), so a plain block loses emphasis rather than
 * legibility, and `e2e/print.spec.ts` asserts both halves of that.
 */
export function useNearViewport<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  near: boolean;
} {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;

    const now = () => setNear(true);
    const printQuery = window.matchMedia('print');
    const onPrintQuery = (event: MediaQueryListEvent) => {
      if (event.matches) now();
    };

    window.addEventListener('beforeprint', now);
    printQuery.addEventListener('change', onPrintQuery);

    const element = ref.current;
    const observer = element
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) now();
          },
          // A little before it scrolls in, so it is usually ready by the time
          // the reader gets there.
          { rootMargin: '400px' },
        )
      : null;

    if (element && observer) observer.observe(element);

    return () => {
      window.removeEventListener('beforeprint', now);
      printQuery.removeEventListener('change', onPrintQuery);
      observer?.disconnect();
    };
  }, [near]);

  return { ref, near };
}
