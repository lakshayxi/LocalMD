import { useState, type ReactNode } from 'react';

import {
  Button,
  IconButton,
  SegmentedControl,
  SidebarItem,
} from '../design/primitives';
import {
  ContextualToolbar,
  DesktopCommandPalette,
  DesktopShell,
  DocumentIcon,
  PlusIcon,
  type DesktopCommand,
  type DesktopMode,
} from '../desktop';

export interface DesignFixture {
  id: string;
  group: 'Foundations' | 'Components' | 'Screens';
  title: string;
  description: string;
  render: () => ReactNode;
}

function ControlStates() {
  const [selected, setSelected] = useState(false);
  const [mode, setMode] = useState<'read' | 'edit' | 'split'>('read');

  return (
    <section className="design-fixture-stack" aria-label="Control states">
      <div className="design-state-row">
        <span className="design-state-label">Actions</span>
        <Button>Quiet</Button>
        <Button variant="bordered">Bordered</Button>
        <Button variant="primary">Primary</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="design-state-row">
        <span className="design-state-label">Toggle</span>
        <Button selected={selected} onClick={() => setSelected((value) => !value)}>
          {selected ? 'Selected' : 'Default'}
        </Button>
        <IconButton label="Open document" icon={<PlusIcon />} />
      </div>
      <div className="design-state-row">
        <span className="design-state-label">Mode</span>
        <SegmentedControl
          ariaLabel="Document mode"
          value={mode}
          options={[
            { value: 'read', label: 'Read' },
            { value: 'edit', label: 'Edit' },
            { value: 'split', label: 'Split' },
          ]}
          onChange={setMode}
        />
      </div>
    </section>
  );
}

function SidebarStates() {
  const [selected, setSelected] = useState('readme');

  return (
    <section className="design-sidebar-sample" aria-label="Recent document item states">
      <SidebarItem
        label="README.md"
        icon={<DocumentIcon />}
        selected={selected === 'readme'}
        onActivate={() => setSelected('readme')}
      />
      <SidebarItem
        label="notes.md"
        icon={<DocumentIcon />}
        dirty
        selected={selected === 'notes'}
        onActivate={() => setSelected('notes')}
      />
      <SidebarItem
        label="AGENTS.md"
        icon={<DocumentIcon />}
        missing
      />
      <SidebarItem
        label="a-document-name-that-is-long-enough-to-require-truncation.markdown"
        icon={<DocumentIcon />}
        title="a-document-name-that-is-long-enough-to-require-truncation.markdown"
        selected={selected === 'long'}
        onActivate={() => setSelected('long')}
      />
    </section>
  );
}

function TypographyScale() {
  return (
    <article className="design-type-sample">
      <span className="design-type-caption">Document typography</span>
      <h1>Clear structure, quiet chrome</h1>
      <p>
        Titles establish the document hierarchy. Body text keeps a measured line length and a
        consistent 26-pixel rhythm.
      </p>
      <pre>
        <code># Source remains visible</code>
      </pre>
    </article>
  );
}

const recents = [
  { id: 'readme', name: 'README.md', selected: true },
  { id: 'notes', name: 'field-notes.md', dirty: true },
  { id: 'agents', name: 'AGENTS.md' },
  { id: 'missing', name: 'moved-document.markdown', missing: true },
] as const;

function SampleDocument() {
  return (
    <article className="lmd-desktop-document-type lmd-desktop-prose">
      <h1>LocalMD for macOS</h1>
      <p>
        Read and edit ordinary Markdown files in a focused desktop workspace.
      </p>
      <h2>Document workflow</h2>
      <p>
        The sidebar keeps recent files close while the page remains the primary surface.
      </p>
      <h3>Useful details</h3>
      <ul>
        <li>Open files from the Mac</li>
        <li>Switch between Read, Edit, and Split</li>
      </ul>
      <blockquote>Markdown remains portable and readable outside LocalMD.</blockquote>
      <pre>
        <code>open README.md</code>
      </pre>
    </article>
  );
}

function ShellFixture({
  state,
}: {
  state: 'empty' | 'loading' | 'error' | 'read' | 'edit-dirty' | 'split' | 'external' | 'drag' | 'collapsed';
}) {
  const initialMode: DesktopMode = state === 'split' ? 'split' : state === 'edit-dirty' ? 'edit' : 'read';
  const [mode, setMode] = useState<DesktopMode>(initialMode);
  const [collapsed, setCollapsed] = useState(state === 'collapsed');
  const document = ['empty', 'loading', 'error'].includes(state)
    ? undefined
    : { name: 'README.md', readContent: <SampleDocument /> };

  return (
    <DesktopShell
      {...(document ? { document } : {})}
      status={state === 'loading' || state === 'error' ? state : 'empty'}
      {...(state === 'error' ? { errorMessage: 'The file is unavailable or cannot be read.' } : {})}
      mode={mode}
      dirty={state === 'edit-dirty'}
      externalChange={state === 'external'}
      dragActive={state === 'drag'}
      sidebarCollapsed={collapsed}
      recents={recents}
      openDisabled={state === 'loading'}
      newDisabled={state === 'loading'}
      onModeChange={setMode}
      onSidebarCollapsedChange={setCollapsed}
    />
  );
}

function ToolbarFixture({
  state,
}: {
  state: 'selection' | 'active' | 'link-creation' | 'existing-link' | 'disabled';
}) {
  const [linkValue, setLinkValue] = useState(
    state === 'existing-link' ? 'https://v2.tauri.app/security/capabilities/' : '',
  );
  const [formats, setFormats] = useState<ReadonlySet<'bold' | 'italic' | 'code'>>(
    new Set(state === 'active' ? ['bold', 'code'] : []),
  );
  const context =
    state === 'link-creation'
      ? 'link-creation'
      : state === 'existing-link'
        ? 'existing-link'
        : 'selection';

  return (
    <div className="design-contextual-sample">
      <p>Select text in the document to reveal relevant editing actions.</p>
      <ContextualToolbar
        context={context}
        activeFormats={formats}
        disabledFormats={state === 'disabled' ? new Set(['italic']) : new Set()}
        linkValue={linkValue}
        linkActionDisabled={state === 'disabled'}
        onLinkValueChange={setLinkValue}
        onFormat={(format) => {
          const next = new Set(formats);
          if (next.has(format)) next.delete(format);
          else next.add(format);
          setFormats(next);
        }}
      />
    </div>
  );
}

const paletteCommands: DesktopCommand[] = [
  { id: 'open', label: 'Open document', group: 'File', hint: '⌘O', onRun: () => undefined },
  { id: 'save', label: 'Save', group: 'File', hint: '⌘S', onRun: () => undefined },
  {
    id: 'save-as',
    label: 'Save As',
    group: 'File',
    hint: '⇧⌘S',
    disabled: true,
    onRun: () => undefined,
  },
  { id: 'read', label: 'Switch to Read mode', group: 'View', onRun: () => undefined },
  { id: 'split', label: 'Switch to Split mode', group: 'View', onRun: () => undefined },
];

function PaletteFixture({ state }: { state: 'open' | 'query' | 'no-results' }) {
  const [open, setOpen] = useState(true);
  const initialQuery = state === 'query' ? 'split' : state === 'no-results' ? 'publish' : '';

  return (
    <div className="design-palette-sample">
      <DesktopShell document={{ name: 'README.md', readContent: <SampleDocument /> }} recents={recents} />
      <DesktopCommandPalette
        open={open}
        commands={paletteCommands}
        initialQuery={initialQuery}
        onClose={() => setOpen(false)}
      />
      {!open && (
        <Button className="design-reopen-palette" variant="bordered" onClick={() => setOpen(true)}>
          Reopen palette
        </Button>
      )}
    </div>
  );
}

function FindFixture() {
  const [query, setQuery] = useState('document');
  const [current, setCurrent] = useState(2);
  const total = query ? 3 : 0;

  return (
    <DesktopShell
      document={{ name: 'README.md', readContent: <SampleDocument /> }}
      recents={recents}
      find={{
        open: true,
        query,
        current: total ? current : 0,
        total,
        onQueryChange: (next) => {
          setQuery(next);
          setCurrent(next ? 1 : 0);
        },
        onNext: () => setCurrent((value) => (total ? (value % total) + 1 : 0)),
        onPrevious: () =>
          setCurrent((value) => (total ? ((value - 2 + total) % total) + 1 : 0)),
        onClose: () => undefined,
      }}
    />
  );
}

export const foundationFixtures: DesignFixture[] = [
  {
    id: 'typography',
    group: 'Foundations',
    title: 'Typography',
    description: 'Editorial document hierarchy with compact system chrome and a monospaced source layer.',
    render: () => <TypographyScale />,
  },
  {
    id: 'controls',
    group: 'Components',
    title: 'Controls',
    description: 'Production controls with real hover, pressed, selected, disabled, focus, and keyboard states.',
    render: () => <ControlStates />,
  },
  {
    id: 'sidebar-items',
    group: 'Components',
    title: 'Sidebar items',
    description: 'Normal, selected, dirty, unavailable, long, and keyboard-focused document rows.',
    render: () => <SidebarStates />,
  },
  {
    id: 'toolbar-selection',
    group: 'Components',
    title: 'Contextual toolbar',
    description: 'Real selection controls with inactive formatting actions.',
    render: () => <ToolbarFixture state="selection" />,
  },
  {
    id: 'toolbar-active',
    group: 'Components',
    title: 'Active formatting',
    description: 'Bold and inline code are active. Arrow keys move between toolbar actions.',
    render: () => <ToolbarFixture state="active" />,
  },
  {
    id: 'toolbar-link',
    group: 'Components',
    title: 'Link creation',
    description: 'A focused link editor replaces irrelevant formatting actions.',
    render: () => <ToolbarFixture state="link-creation" />,
  },
  {
    id: 'toolbar-existing-link',
    group: 'Components',
    title: 'Existing link',
    description: 'Open, copy, and remove actions for the selected link.',
    render: () => <ToolbarFixture state="existing-link" />,
  },
  {
    id: 'toolbar-disabled',
    group: 'Components',
    title: 'Disabled formatting',
    description: 'Unavailable inline actions remain legible and are removed from keyboard movement.',
    render: () => <ToolbarFixture state="disabled" />,
  },
  {
    id: 'palette-open',
    group: 'Components',
    title: 'Command palette',
    description: 'Empty query with grouped results, a disabled command, and a keyboard-selected result.',
    render: () => <PaletteFixture state="open" />,
  },
  {
    id: 'palette-query',
    group: 'Components',
    title: 'Command query',
    description: 'A deterministic query with a focused matching result.',
    render: () => <PaletteFixture state="query" />,
  },
  {
    id: 'palette-empty',
    group: 'Components',
    title: 'No command results',
    description: 'The empty result remains direct and quiet.',
    render: () => <PaletteFixture state="no-results" />,
  },
  {
    id: 'document-find',
    group: 'Components',
    title: 'Document find',
    description: 'A nonmodal document search with a live match count and compact navigation.',
    render: () => <FindFixture />,
  },
  ...(
    [
      ['shell-empty', 'No document', 'empty', 'An uncluttered starting point with direct Open and New actions.'],
      ['shell-loading', 'Loading document', 'loading', 'A quiet pending state blocks overlapping document actions.'],
      ['shell-error', 'Open error', 'error', 'A clear local error offers a safe path back to file selection.'],
      ['shell-read', 'Read mode', 'read', 'The document is visually dominant at a deliberate reading width.'],
      ['shell-dirty', 'Dirty edit mode', 'edit-dirty', 'Unsaved state is visible without turning the titlebar into a warning banner.'],
      ['shell-split', 'Split mode', 'split', 'Source and preview share the document surface without extra containers.'],
      ['shell-external', 'External change', 'external', 'A focused conflict notice protects the file before the next save.'],
      ['shell-drag', 'Drag target', 'drag', 'A restrained overlay communicates the native file drop target.'],
      ['shell-collapsed', 'Collapsed sidebar', 'collapsed', 'The reading surface expands while navigation remains one keyboard action away.'],
    ] as const
  ).map(([id, title, state, description]) => ({
    id,
    group: 'Screens' as const,
    title,
    description,
    render: () => <ShellFixture state={state} />,
  })),
];
