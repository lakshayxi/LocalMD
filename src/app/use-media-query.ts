import { useEffect, useState } from 'react';

/**
 * The width below which Split has nowhere to go.
 *
 * Two columns of a 68ch measure plus the editor need roughly this much before
 * either half stops being readable, and a cramped split is worse than no split.
 */
export const SPLIT_MIN_WIDTH = 1024;

/**
 * Subscribes to a media query.
 *
 * Feature-and-viewport queries, never UA sniffing. The initial value is read in
 * a state initializer so the first render is already correct — starting false
 * and correcting in an effect would flash the wrong layout on every load at
 * exactly the widths this is meant to handle.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);

    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function useSplitAvailable(): boolean {
  return useMediaQuery(`(min-width: ${SPLIT_MIN_WIDTH}px)`);
}
