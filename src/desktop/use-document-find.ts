import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DesktopMode } from './DesktopShell';
import type { DocumentFindBarProps } from './DocumentFindBar';

interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

function searchableTextNodes(root: HTMLElement): TextSegment[] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!node.textContent || parent?.closest('[aria-hidden="true"], script, style')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const segments: TextSegment[] = [];
  let offset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const length = node.data.length;
    segments.push({ node, start: offset, end: offset + length });
    offset += length;
  }

  return segments;
}

export function findTextRanges(root: HTMLElement, query: string): Range[] {
  if (!query) return [];
  const segments = searchableTextNodes(root);
  const text = segments.map((segment) => segment.node.data).join('');
  const haystack = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const ranges: Range[] = [];
  let offset = 0;

  while (offset <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, offset);
    if (start < 0) break;
    const end = start + needle.length;
    const first = segments.find((segment) => start >= segment.start && start < segment.end);
    const last = segments.find((segment) => end > segment.start && end <= segment.end);

    if (first && last) {
      const range = root.ownerDocument.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      ranges.push(range);
    }
    offset = end;
  }

  return ranges;
}

function clearSelection(): void {
  window.getSelection()?.removeAllRanges();
}

export function useDocumentFind({
  mode,
  documentKey,
  renderKey,
}: {
  mode: DesktopMode;
  documentKey: string | null;
  renderKey: string;
}): {
  find: DocumentFindBarProps;
  openFind: () => void;
  closeFind: () => void;
} {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Range[]>([]);
  const [active, setActive] = useState(0);
  const previousFocus = useRef<HTMLElement | null>(null);

  const closeFind = useCallback(() => {
    const restore = previousFocus.current;
    clearSelection();
    setOpen(false);
    setMatches([]);
    previousFocus.current = null;
    requestAnimationFrame(() => {
      if (restore?.isConnected) {
        restore.focus();
      } else {
        document
          .querySelector<HTMLElement>('[data-lmd-find-trigger]')
          ?.focus();
      }
    });
  }, []);

  const openFind = useCallback(() => {
    if (open) {
      const input = document.querySelector<HTMLInputElement>('.lmd-desktop-find input');
      input?.focus();
      input?.select();
      return;
    }
    previousFocus.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, [open]);

  useEffect(() => {
    if (open && mode === 'edit') closeFind();
  }, [closeFind, mode, open]);

  useEffect(() => {
    if (!open || mode === 'edit') return;
    const root = document.querySelector<HTMLElement>(
      '.lmd-desktop-reader-pane .lmd-document',
    );
    if (!root) return;

    const refresh = () => {
      const next = findTextRanges(root, query);
      setMatches(next);
      setActive((current) => (next.length > 0 ? Math.min(current, next.length - 1) : 0));
    };
    refresh();

    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [documentKey, mode, open, query, renderKey]);

  useEffect(() => {
    clearSelection();
    const range = matches[active];
    if (!open || !range) return;
    const selection = window.getSelection();
    selection?.addRange(range);
    range.startContainer.parentElement?.scrollIntoView({ block: 'center' });
  }, [active, matches, open]);

  useEffect(() => {
    if (!documentKey && open) closeFind();
  }, [closeFind, documentKey, open]);

  const find = useMemo<DocumentFindBarProps>(
    () => ({
      open,
      query,
      current: matches.length > 0 ? active + 1 : 0,
      total: matches.length,
      onQueryChange: (next) => {
        setQuery(next);
        setActive(0);
      },
      onNext: () => setActive((current) => (matches.length ? (current + 1) % matches.length : 0)),
      onPrevious: () =>
        setActive((current) => (matches.length ? (current - 1 + matches.length) % matches.length : 0)),
      onClose: closeFind,
    }),
    [active, closeFind, matches.length, open, query],
  );

  return { find, openFind, closeFind };
}
