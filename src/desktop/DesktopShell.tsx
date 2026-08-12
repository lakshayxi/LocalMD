import type { ReactNode } from 'react';
import { Button, IconButton, SegmentedControl, SidebarItem } from '@/design';
import {
  DocumentIcon,
  FolderIcon,
  LoadingIcon,
  MoonIcon,
  MoreIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  SidebarIcon,
  SunIcon,
  WarningIcon,
} from './icons';
import { DocumentFindBar, type DocumentFindBarProps } from './DocumentFindBar';
import './desktop.css';

export type DesktopMode = 'read' | 'edit' | 'split';

export interface DesktopRecentFile {
  id: string;
  name: string;
  detail?: string;
  selected?: boolean;
  dirty?: boolean;
  missing?: boolean;
}

export interface DesktopDocument {
  name: string;
  readContent?: ReactNode;
  editContent?: ReactNode;
}

export interface DesktopShellProps {
  document?: DesktopDocument;
  status?: 'empty' | 'loading' | 'error';
  errorMessage?: string;
  mode?: DesktopMode;
  dirty?: boolean;
  externalChange?: boolean;
  dragActive?: boolean;
  appearance?: 'light' | 'dark';
  splitAvailable?: boolean;
  sidebarCollapsed?: boolean;
  recents?: readonly DesktopRecentFile[];
  onModeChange?: (mode: DesktopMode) => void;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  onSelectRecent?: (id: string) => void;
  onOpen?: () => void;
  openDisabled?: boolean;
  onNew?: () => void;
  newDisabled?: boolean;
  onSave?: () => void;
  saveDisabled?: boolean;
  onShowCommands?: () => void;
  onFind?: () => void;
  find?: DocumentFindBarProps;
  onAppearanceToggle?: () => void;
  onResolveExternalChange?: () => void;
}

const MODES = [
  { value: 'read', label: 'Read' },
  { value: 'edit', label: 'Edit' },
  { value: 'split', label: 'Split' },
] as const;

function EmptyDocument({
  status = 'empty',
  errorMessage,
  onOpen,
  openDisabled = false,
  onNew,
}: {
  status?: 'empty' | 'loading' | 'error';
  errorMessage?: string;
  onOpen: (() => void) | undefined;
  openDisabled?: boolean;
  onNew: (() => void) | undefined;
}) {
  const isLoading = status === 'loading';
  const isError = status === 'error';

  return (
    <div
      className="lmd-desktop-empty"
      {...(isError ? { role: 'alert' } : isLoading ? { role: 'status', 'aria-live': 'polite' } : {})}
    >
      <div className="lmd-desktop-empty-icon" aria-hidden="true">
        {isLoading ? <LoadingIcon /> : isError ? <WarningIcon /> : <DocumentIcon />}
      </div>
      <h1 className="lmd-desktop-display-type">
        {isLoading ? 'Opening document' : isError ? 'Could not open document' : 'No document open'}
      </h1>
      <p>
        {isLoading
          ? 'Reading the file and preparing the editor.'
          : isError
            ? (errorMessage ?? 'The file could not be read.')
            : 'Open a Markdown file or create a new document.'}
      </p>
      {!isLoading && (
        <div className="lmd-desktop-empty-actions">
          <Button
            className="lmd-desktop-empty-command"
            aria-label={isError ? 'Choose another file' : 'Open document'}
            disabled={openDisabled}
            onClick={onOpen}
          >
            <FolderIcon />
            <span>{isError ? 'Choose another file' : 'Open document'}</span>
            <kbd aria-hidden="true">⌘O</kbd>
          </Button>
          <Button className="lmd-desktop-empty-command" aria-label="New document" onClick={onNew}>
            <PlusIcon />
            <span>New document</span>
            <kbd aria-hidden="true">⌘N</kbd>
          </Button>
        </div>
      )}
    </div>
  );
}

function FallbackReadContent({ name }: { name: string }) {
  return (
    <article className="lmd-desktop-document-type lmd-desktop-prose">
      <h1>{name.replace(/\.(md|markdown)$/i, '')}</h1>
      <p>LocalMD keeps the document at the center of the window.</p>
      <h2>Start reading</h2>
      <p>Use the sidebar to move between recent documents. Press Command-K for every action.</p>
    </article>
  );
}

function FallbackEditContent({ name }: { name: string }) {
  return (
    <textarea
      className="lmd-desktop-source-type lmd-desktop-source"
      aria-label={`Markdown source of ${name}`}
      defaultValue={`# ${name.replace(/\.(md|markdown)$/i, '')}\n\nLocalMD keeps the document at the center of the window.\n`}
      spellCheck={false}
    />
  );
}

function DocumentCanvas({ document, mode }: { document: DesktopDocument; mode: DesktopMode }) {
  const read = document.readContent ?? <FallbackReadContent name={document.name} />;
  const edit = document.editContent ?? <FallbackEditContent name={document.name} />;

  if (mode === 'split') {
    return (
      <div className="lmd-desktop-split">
        <section aria-label="Markdown editor" className="lmd-desktop-editor-pane">
          {edit}
        </section>
        <section aria-label="Document preview" className="lmd-desktop-reader-pane">
          <div className="lmd-desktop-reading-column">{read}</div>
        </section>
      </div>
    );
  }

  return mode === 'edit' ? (
    <section aria-label="Markdown editor" className="lmd-desktop-editor-pane is-single">
      <div className="lmd-desktop-editor-column">{edit}</div>
    </section>
  ) : (
    <section aria-label="Document preview" className="lmd-desktop-reader-pane">
      <div className="lmd-desktop-reading-column">{read}</div>
    </section>
  );
}

export function DesktopShell({
  document,
  status = 'empty',
  errorMessage,
  mode = 'read',
  dirty = false,
  externalChange = false,
  dragActive = false,
  appearance = 'light',
  splitAvailable = true,
  sidebarCollapsed = false,
  recents = [],
  onModeChange,
  onSidebarCollapsedChange,
  onSelectRecent,
  onOpen,
  openDisabled = false,
  onNew,
  newDisabled = false,
  onSave,
  saveDisabled = false,
  onShowCommands,
  onFind,
  find,
  onAppearanceToggle,
  onResolveExternalChange,
}: DesktopShellProps) {
  return (
    <div
      className="lmd-desktop-shell"
      data-lmd-shell="desktop"
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'visible'}
      data-mode={document ? mode : status}
      data-dirty={dirty || undefined}
      data-external-change={externalChange || undefined}
      data-drag-active={dragActive || undefined}
    >
      <header className="lmd-desktop-titlebar" data-tauri-drag-region>
        <div className="lmd-desktop-titlebar-left" data-tauri-drag-region>
          <strong className="lmd-desktop-workspace-name" data-tauri-drag-region>
            LocalMD
          </strong>
          <IconButton
            label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            icon={<SidebarIcon />}
            onClick={() => onSidebarCollapsedChange?.(!sidebarCollapsed)}
          />
        </div>
        <div className="lmd-desktop-document-chrome" data-tauri-drag-region>
          {find?.open ? (
            <DocumentFindBar {...find} />
          ) : (
            <>
              <div className="lmd-desktop-title" aria-live="polite" data-tauri-drag-region>
                <span>{document?.name ?? ''}</span>
                {dirty && <span className="lmd-desktop-title-dirty">Edited</span>}
              </div>
              <div className="lmd-desktop-titlebar-actions">
                {document && (
                  <>
                    <IconButton
                      label="Find in document"
                      icon={<SearchIcon />}
                      onClick={onFind}
                      data-lmd-find-trigger
                    />
                    <SegmentedControl
                      ariaLabel="Display mode"
                      value={mode}
                      options={MODES.filter((option) => option.value !== 'split' || splitAvailable)}
                      onChange={(nextMode) => onModeChange?.(nextMode)}
                    />
                  </>
                )}
                {sidebarCollapsed && (
                  <IconButton
                    label={appearance === 'dark' ? 'Use light appearance' : 'Use dark appearance'}
                    icon={appearance === 'dark' ? <SunIcon /> : <MoonIcon />}
                    onClick={onAppearanceToggle}
                  />
                )}
                <IconButton
                  label="Save"
                  icon={<SaveIcon />}
                  disabled={!document || saveDisabled}
                  onClick={onSave}
                />
                <IconButton label="Show commands" icon={<MoreIcon />} onClick={onShowCommands} />
              </div>
            </>
          )}
        </div>
      </header>

      <div className="lmd-desktop-body">
        {!sidebarCollapsed && (
          <aside className="lmd-desktop-sidebar" aria-label="Documents">
            <div className="lmd-desktop-sidebar-actions">
              <Button
                className="lmd-desktop-sidebar-command"
                aria-label="Search commands"
                aria-keyshortcuts="Meta+K Control+K"
                onClick={onShowCommands}
              >
                <SearchIcon />
                <span>Search</span>
                <kbd aria-hidden="true">⌘K</kbd>
              </Button>
              <Button
                className="lmd-desktop-sidebar-command"
                aria-label="New document"
                disabled={newDisabled}
                onClick={onNew}
              >
                <PlusIcon />
                <span>New document</span>
                <kbd aria-hidden="true">⌘N</kbd>
              </Button>
              <Button
                className="lmd-desktop-sidebar-command"
                aria-label="Open document"
                disabled={openDisabled}
                onClick={onOpen}
              >
                <FolderIcon />
                <span>Open document</span>
                <kbd aria-hidden="true">⌘O</kbd>
              </Button>
            </div>
            <div className="lmd-desktop-sidebar-documents">
              <div className="lmd-desktop-sidebar-heading">
                <span>Recent</span>
                <IconButton
                  label="New document"
                  icon={<PlusIcon />}
                  disabled={newDisabled}
                  onClick={onNew}
                />
              </div>
              <nav aria-label="Documents">
                {recents.length > 0 ? (
                  <ul>
                    {recents.map((recent) => (
                      <li key={recent.id}>
                        <SidebarItem
                          label={recent.name}
                          icon={<DocumentIcon />}
                          {...(recent.detail ? { meta: recent.detail } : {})}
                          {...(recent.selected ? { selected: true } : {})}
                          {...(recent.dirty ? { dirty: true } : {})}
                          {...(recent.missing ? { missing: true } : {})}
                          onActivate={() => {
                            onSelectRecent?.(recent.id);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="lmd-desktop-sidebar-empty">No documents yet</p>
                )}
              </nav>
            </div>
            <div className="lmd-desktop-sidebar-footer">
              <Button
                className="lmd-desktop-appearance-button"
                aria-label={appearance === 'dark' ? 'Use light appearance' : 'Use dark appearance'}
                onClick={onAppearanceToggle}
              >
                {appearance === 'dark' ? <SunIcon /> : <MoonIcon />}
                <span>{appearance === 'dark' ? 'Light appearance' : 'Dark appearance'}</span>
              </Button>
            </div>
          </aside>
        )}

        <main className="lmd-desktop-main" aria-busy={status === 'loading' || undefined}>
          {externalChange && document && (
            <div className="lmd-desktop-conflict" role="alert">
              <WarningIcon />
              <span>{document.name} changed outside LocalMD.</span>
              <Button variant="bordered" onClick={onResolveExternalChange}>
                Review changes
              </Button>
            </div>
          )}
          {document ? (
            <DocumentCanvas document={document} mode={mode} />
          ) : (
            <EmptyDocument
              status={status}
              {...(errorMessage ? { errorMessage } : {})}
              onOpen={onOpen}
              onNew={onNew}
              openDisabled={openDisabled || status === 'loading'}
            />
          )}
        </main>
      </div>

      {dragActive && (
        <div className="lmd-desktop-drop-overlay" aria-hidden="true">
          <DocumentIcon />
          <strong>Drop to open</strong>
        </div>
      )}
    </div>
  );
}
