import { useEffect } from 'react';

/**
 * Expands collapsed disclosures for printing, then puts them back.
 *
 * A `<details>` that is closed on paper is simply missing content — the reader
 * has no way to open it — so printing one shipped closed produces an incomplete
 * document.
 *
 * This cannot be done in CSS. A closed `<details>` hides its children through
 * the element's own state rather than through a `display` rule on them, so
 * `display: revert` on the children does nothing. The `open` attribute is the
 * only lever.
 *
 * Restoring afterwards matters: without it, printing silently rewrites the
 * reader's document state and every collapsed section stays expanded.
 */
export function usePrintPreparation() {
  useEffect(() => {
    let expanded: HTMLDetailsElement[] = [];

    const expandAll = () => {
      expanded = [...document.querySelectorAll<HTMLDetailsElement>('.lmd-document details')].filter(
        (element) => !element.open,
      );
      for (const element of expanded) element.open = true;
    };

    const restore = () => {
      for (const element of expanded) element.open = false;
      expanded = [];
    };

    window.addEventListener('beforeprint', expandAll);
    window.addEventListener('afterprint', restore);

    // Safari has historically not fired beforeprint/afterprint reliably; the
    // print media query is the fallback that does work there.
    const printQuery = window.matchMedia('print');
    const onMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) expandAll();
      else restore();
    };
    printQuery.addEventListener('change', onMediaChange);

    return () => {
      window.removeEventListener('beforeprint', expandAll);
      window.removeEventListener('afterprint', restore);
      printQuery.removeEventListener('change', onMediaChange);
    };
  }, []);
}
