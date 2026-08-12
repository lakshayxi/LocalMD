import { useEffect, useRef } from 'react';
import { IconButton } from '@/design';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from './icons';

export interface DocumentFindBarProps {
  open: boolean;
  query: string;
  current: number;
  total: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export function DocumentFindBar({
  open,
  query,
  current,
  total,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: DocumentFindBarProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) return null;

  const result = query
    ? total > 0
      ? `${current} of ${total}`
      : 'No results'
    : 'Type to find';

  return (
    <form
      className="lmd-desktop-find"
      role="search"
      aria-label="Find in document"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <SearchIcon aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label="Find text"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault();
            onPrevious();
          }
        }}
      />
      <output className="lmd-desktop-find-result" aria-live="polite">
        {result}
      </output>
      <IconButton
        label="Previous match"
        icon={<ChevronUpIcon />}
        disabled={total === 0}
        onClick={onPrevious}
      />
      <IconButton
        label="Next match"
        icon={<ChevronDownIcon />}
        disabled={total === 0}
        onClick={onNext}
      />
      <IconButton label="Close find" icon={<CloseIcon />} onClick={onClose} />
    </form>
  );
}
