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
 * **Printing forces it.** Deferred work means anything below the fold has never
 * been done, so a print started from the top of a long document would emit
 * plain source where the diagrams and highlighting should be. `beforeprint`
 * fires early enough; Safari does not fire it reliably, hence the matchMedia
 * listener alongside it.
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
