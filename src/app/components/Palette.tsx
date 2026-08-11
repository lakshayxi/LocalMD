import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createEmptyDocument, openFile } from '@/platform/files';
import { MOD_KEY } from '../format';
import { useDocument } from '../store';

/**
 * The ⌘K palette.
 *
 * This is the navigation model, not an accessory to it. A permanent sidebar
 * would contradict "the document dominates" at every width, and a menu bar
 * would need somewhere to live in a 40px header — so everything that is not
 * reading lives behind one key. It carries three kinds of thing:
 *
 *  - **Go to** — headings in the open document.
 *  - **Recent** — documents that can be reopened.
 *  - **Commands** — everything else the app can do.
 *
 * Ordering is intent-based rather than fixed. With a document open, ⌘K is
 * almost always "jump to a section", so headings lead. On the landing page
 * there is nothing to jump to and the reader is trying to open something, so
 * recents lead.
 */

interface Item {
  id: string;
  label: string;
  /** Quiet right-hand text: a shortcut, a timestamp, or the current value. */
  hint?: string | undefined;
  run: () => void;
}

interface Group {
  name: string;
  items: Item[];
}

export function Palette({
  onClose,
  onOpenPrivacy,
}: {
  onClose: () => void;
  onOpenPrivacy: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const groups = usePaletteGroups({ onClose, onOpenPrivacy });

  const filtered = useMemo(() => filterGroups(groups, query), [groups, query]);
  const flat = useMemo(() => filtered.flatMap((group) => group.items), [filtered]);

  // A filtered list whose selection stayed put would leave the highlight on
  // whatever now occupies that row, and Enter would run something the reader
  // never looked at.
  useEffect(() => setActiveIndex(0), [query]);

  const active = flat[activeIndex];
  const activeId = active ? `${baseId}-${active.id}` : undefined;

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, query]);

  // Focus returns where it came from on close. Without this, dismissing the
  // palette drops keyboard focus onto <body> and the next Tab restarts from the
  // top of the page.
  //
  // Captured in a state initializer rather than in the effect, because the
  // effect runs *after* commit — by which point React has already applied
  // `autoFocus` to the input below, and the element we would "restore" is the
  // palette's own field, which is about to be unmounted. The initializer runs
  // during render, while the previously focused element is still focused.
  const [returnFocusTo] = useState(() => document.activeElement);

  useEffect(
    () => () => {
      if (returnFocusTo instanceof HTMLElement) returnFocusTo.focus();
    },
    [returnFocusTo],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      active?.run();
      return;
    }

    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0 && flat.length > 0) {
      event.preventDefault();
      // Wraps, because a list that stops dead at either end makes reaching the
      // last item from the top a matter of holding a key down.
      setActiveIndex((index) => (index + step + flat.length) % flat.length);
      return;
    }

    // Focus never leaves the input — options are selected virtually through
    // aria-activedescendant — so Tab has nowhere useful to go and would only
    // move focus behind the dialog.
    if (event.key === 'Tab') event.preventDefault();
  }

  return (
    <div className="lmd-palette-backdrop" onMouseDown={onClose}>
      <div
        className="lmd-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          className="lmd-palette-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to a heading, open a recent file, or run a command…"
          aria-label="Search headings, recent documents, and commands"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${baseId}-list`}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoFocus
          spellCheck={false}
        />

        <div className="lmd-palette-results" ref={listRef}>
          {flat.length === 0 ? (
            <p className="lmd-palette-empty" role="status">
              Nothing matches “{query}”.
            </p>
          ) : (
            <ul className="lmd-palette-list" role="listbox" id={`${baseId}-list`} aria-label="Results">
              {filtered.map((group) => {
                // Group names carry spaces; aria-labelledby is a space-separated
                // token list, so the id has to be one token.
                const groupId = `${baseId}-group-${group.name.replace(/\s+/g, '-')}`;

                return (
                <li key={group.name} role="presentation">
                  <div className="lmd-palette-group" id={groupId}>
                    {group.name}
                  </div>
                  <ul role="group" aria-labelledby={groupId}>
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        id={`${baseId}-${item.id}`}
                        role="option"
                        aria-selected={item === active}
                        className="lmd-palette-option"
                        // mousedown default would blur the input, which drops
                        // aria-activedescendant before the click resolves.
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => setActiveIndex(flat.indexOf(item))}
                        onClick={item.run}
                      >
                        <span className="lmd-palette-label">{item.label}</span>
                        {item.hint && <span className="lmd-palette-hint">{item.hint}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Case-insensitive substring match on the label.
 *
 * Not fuzzy matching. Fuzzy scoring earns its keep over hundreds of commands;
 * over a few dozen items plus a document's headings it mostly produces
 * confident-looking wrong answers, and "why is that the top result" is a worse
 * failure than "type one more letter".
 */
function filterGroups(groups: Group[], query: string): Group[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups.filter((group) => group.items.length > 0);

  return groups
    .map((group) => ({
      name: group.name,
      items: group.items.filter((item) => item.label.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.items.length > 0);
}

function usePaletteGroups({
  onClose,
  onOpenPrivacy,
}: {
  onClose: () => void;
  onOpenPrivacy: () => void;
}): Group[] {
  const store = useDocument();

  return useMemo(() => {
    /** Every item dismisses the palette; none should leave it hanging open. */
    const act = (run: () => void) => () => {
      onClose();
      run();
    };

    const headings: Group = {
      name: 'Go to',
      items: (store.rendered?.headings ?? []).map((heading) => ({
        id: `heading-${heading.id}`,
        label: heading.text,
        hint: heading.depth > 1 ? `H${heading.depth}` : undefined,
        run: act(() => {
          // Assigning the hash lets the browser do the scrolling, which honors
          // the scroll-margin-top the headings already carry and leaves a real
          // history entry behind.
          window.location.hash = heading.id;
        }),
      })),
    };

    const recents: Group = {
      name: 'Recent',
      items: store.recents
        // The open document is not somewhere to go.
        .filter((recent) => recent.id !== store.source?.id)
        .map((recent) => ({
          id: `recent-${recent.id}`,
          label: recent.name,
          run: act(() => void store.openRecent(recent)),
        })),
    };

    const commands: Group = {
      name: 'Commands',
      items: [
        {
          id: 'open',
          label: 'Open a Markdown file…',
          hint: `${MOD_KEY}O`,
          run: act(() => {
            void openFile().then((source) => source && store.open(source));
          }),
        },
        {
          id: 'new',
          label: 'New document',
          run: act(() => void store.open(createEmptyDocument())),
        },
        ...(store.source
          ? [
              {
                // Labelled from the source's own capability, so the word matches
                // what will actually happen on this browser. Safari and Firefox
                // read "Download" and are not told they are missing anything.
                id: 'save',
                label: store.source.canSaveInPlace ? 'Save' : 'Download',
                hint: `${MOD_KEY}S`,
                run: act(() => void store.save()),
              },
              {
                id: 'save-as',
                label: 'Save as…',
                hint: `${MOD_KEY}⇧S`,
                run: act(() => void store.saveAs()),
              },
              {
                id: 'close',
                label: 'Close document',
                run: act(store.close),
              },
            ]
          : []),
        // Only while the file and the document actually disagree. These are the
        // two answers ⌘S cannot give on its own once it starts refusing, and a
        // reader who works from the keyboard should not have to reach for the
        // banner's buttons to get at them.
        ...(store.externalChange && store.source
          ? [
              {
                id: 'overwrite',
                label: `Overwrite ${store.source.name} with my version`,
                hint: 'Changed on disk',
                run: act(() => void store.overwrite()),
              },
              {
                id: 'reload',
                label: `Discard my changes and reload ${store.source.name}`,
                hint: 'Changed on disk',
                run: act(() => void store.reloadFromDisk()),
              },
            ]
          : []),
        {
          id: 'outline',
          label: store.outlinePinned ? 'Hide the outline' : 'Show the outline',
          hint: 'Wide screens',
          run: act(() => store.setOutlinePinned(!store.outlinePinned)),
        },
        {
          id: 'typeface',
          label: store.typeface === 'serif' ? 'Read in sans-serif' : 'Read in serif',
          run: act(() => store.setTypeface(store.typeface === 'serif' ? 'sans' : 'serif')),
        },
        {
          id: 'theme-light',
          label: 'Theme: Light',
          hint: store.theme === 'light' ? 'Current' : undefined,
          run: act(() => store.setTheme('light')),
        },
        {
          id: 'theme-dark',
          label: 'Theme: Dark',
          hint: store.theme === 'dark' ? 'Current' : undefined,
          run: act(() => store.setTheme('dark')),
        },
        {
          id: 'theme-system',
          label: 'Theme: Match the system',
          hint: store.theme === 'system' ? 'Current' : undefined,
          run: act(() => store.setTheme('system')),
        },
        {
          id: 'print',
          label: 'Print or save as PDF',
          hint: `${MOD_KEY}P`,
          run: act(() => window.print()),
        },
        {
          id: 'privacy',
          label: 'How LocalMD handles your file',
          run: act(onOpenPrivacy),
        },
        {
          // Findable from here, but performed on the privacy page, which is
          // where the explanation of what is stored already lives. Confirming a
          // destructive action next to the paragraph describing it beats
          // confirming it in a dialog that has to restate the same thing.
          id: 'clear',
          label: 'Clear local data…',
          hint: 'Recents and preferences',
          run: act(onOpenPrivacy),
        },
      ],
    };

    return store.source ? [headings, recents, commands] : [recents, commands];
  }, [store, onClose, onOpenPrivacy]);
}
