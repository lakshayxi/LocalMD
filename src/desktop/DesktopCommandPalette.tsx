import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SearchIcon } from './icons';

export interface DesktopCommand {
  id: string;
  label: string;
  group?: string;
  hint?: string;
  disabled?: boolean;
  onRun: () => void;
}

export interface DesktopCommandPaletteProps {
  open: boolean;
  commands: readonly DesktopCommand[];
  onClose: () => void;
  initialQuery?: string;
  title?: string;
}

function nextEnabled(
  commands: readonly DesktopCommand[],
  current: number,
  step: 1 | -1,
): number {
  if (!commands.some((command) => !command.disabled)) return -1;

  let index = current;
  for (let count = 0; count < commands.length; count += 1) {
    index = (index + step + commands.length) % commands.length;
    if (!commands[index]?.disabled) return index;
  }
  return -1;
}

export function DesktopCommandPalette({
  open,
  commands,
  onClose,
  initialQuery = '',
  title = 'Command palette',
}: DesktopCommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const baseId = useId();

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [...commands];
    return commands.filter((command) => command.label.toLocaleLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery(initialQuery);
    queueMicrotask(() => inputRef.current?.focus());

    return () => returnFocusRef.current?.focus();
  }, [initialQuery, open]);

  useEffect(() => {
    setActiveIndex(filtered.findIndex((command) => !command.disabled));
  }, [filtered]);

  if (!open) return null;

  const active = activeIndex >= 0 ? filtered[activeIndex] : undefined;
  const activeId = active ? `${baseId}-${active.id}` : undefined;

  function run(command: DesktopCommand | undefined): void {
    if (!command || command.disabled) return;
    command.onRun();
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) =>
        nextEnabled(filtered, index, event.key === 'ArrowDown' ? 1 : -1),
      );
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const start = event.key === 'Home' ? -1 : 0;
      setActiveIndex(nextEnabled(filtered, start, event.key === 'Home' ? 1 : -1));
      return;
    }

    if (event.key === 'Tab') event.preventDefault();
  }

  const groups = filtered.reduce<Map<string, DesktopCommand[]>>((result, command) => {
    const group = command.group ?? 'Commands';
    result.set(group, [...(result.get(group) ?? []), command]);
    return result;
  }, new Map());

  return (
    <div className="lmd-desktop-palette-backdrop" onMouseDown={onClose}>
      <section
        className="lmd-desktop-palette"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="lmd-desktop-palette-search">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-controls={`${baseId}-results`}
            aria-expanded="true"
            aria-activedescendant={activeId}
            placeholder="Type a command"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>

        <div className="lmd-desktop-palette-results" id={`${baseId}-results`}>
          {filtered.length === 0 ? (
            <p className="lmd-desktop-palette-empty" role="status">
              No commands match “{query}”.
            </p>
          ) : (
            <ul role="listbox" aria-label="Command results">
              {[...groups].map(([group, items]) => (
                <li key={group} role="presentation">
                  <div className="lmd-desktop-palette-group">{group}</div>
                  <ul role="group" aria-label={group}>
                    {items.map((command) => {
                      const index = filtered.indexOf(command);
                      const selected = index === activeIndex;
                      return (
                        <li
                          key={command.id}
                          id={`${baseId}-${command.id}`}
                          role="option"
                          aria-selected={selected}
                          aria-disabled={command.disabled || undefined}
                          data-disabled={command.disabled || undefined}
                          className="lmd-desktop-palette-option"
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseMove={() => {
                            if (!command.disabled) setActiveIndex(index);
                          }}
                          onClick={() => run(command)}
                        >
                          <span>{command.label}</span>
                          {command.hint && <kbd>{command.hint}</kbd>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
