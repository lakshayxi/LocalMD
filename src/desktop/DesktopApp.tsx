import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createEmptyDocument,
  type DocumentContents,
  type DocumentSource,
} from '@/platform/files';
import { DocumentEditorSurface, DocumentPreviewSurface } from '@/app/components/Workspace';
import { Toast } from '@/app/components/Toast';
import { useDocument, type Mode } from '@/app/store';
import { useMediaQuery, useSplitAvailable } from '@/app/use-media-query';
import { useExternalChange } from '@/app/use-external-change';
import { useNavigationGuard } from '@/app/use-navigation-guard';
import { DesktopCommandPalette, type DesktopCommand } from './DesktopCommandPalette';
import { DesktopShell, type DesktopMode } from './DesktopShell';
import { useDocumentFind } from './use-document-find';

export interface DesktopActions {
  openAvailable: boolean;
  saveAvailable: boolean;
  openDocument: () => Promise<DocumentSource | null>;
  createDocument?: (name?: string, contents?: DocumentContents) => DocumentSource;
}

const bootstrapActions: DesktopActions = {
  openAvailable: false,
  saveAvailable: false,
  async openDocument() {
    return null;
  },
};

function toDesktopMode(mode: Mode): DesktopMode {
  return mode === 'view' ? 'read' : mode;
}

function toStoreMode(mode: DesktopMode): Mode {
  return mode === 'read' ? 'view' : mode;
}

export function DesktopApp({ actions = bootstrapActions }: { actions?: DesktopActions }) {
  const status = useDocument((state) => state.status);
  const error = useDocument((state) => state.error);
  const source = useDocument((state) => state.source);
  const rendered = useDocument((state) => state.rendered);
  const mode = useDocument((state) => state.mode);
  const dirty = useDocument((state) => state.dirty);
  const externalChange = useDocument((state) => state.externalChange);
  const saving = useDocument((state) => state.saving);
  const theme = useDocument((state) => state.theme);
  const recents = useDocument((state) => state.recents);
  const drafts = useDocument((state) => state.drafts);
  const hydrate = useDocument((state) => state.hydrate);
  const open = useDocument((state) => state.open);
  const openRecent = useDocument((state) => state.openRecent);
  const restoreDraft = useDocument((state) => state.restoreDraft);
  const setMode = useDocument((state) => state.setMode);
  const setTheme = useDocument((state) => state.setTheme);
  const save = useDocument((state) => state.save);
  const saveAs = useDocument((state) => state.saveAs);
  const overwrite = useDocument((state) => state.overwrite);
  const reloadFromDisk = useDocument((state) => state.reloadFromDisk);
  const close = useDocument((state) => state.close);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [renderVersion, setRenderVersion] = useState(0);
  const onRendered = useCallback(() => setRenderVersion((version) => version + 1), []);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const splitAvailable = useSplitAvailable();
  const appearance = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const renderKey = rendered
    ? `${rendered.slices.length}:${rendered.slices.at(-1)?.hash ?? ''}:${renderVersion}`
    : `${renderVersion}`;
  const { find, openFind } = useDocumentFind({
    mode: toDesktopMode(mode),
    documentKey: source?.id ?? null,
    renderKey,
  });

  const handleFind = useCallback(() => {
    if (!useDocument.getState().source) return;
    if (useDocument.getState().mode === 'edit') {
      window.dispatchEvent(new Event('localmd:find-editor'));
      return;
    }
    openFind();
  }, [openFind]);

  useNavigationGuard();
  useExternalChange();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!splitAvailable && mode === 'split') void setMode('edit');
  }, [mode, setMode, splitAvailable]);

  const handleOpen = useCallback(async () => {
    const next = await actions.openDocument();
    if (next) await open(next);
  }, [actions, open]);

  const handleNew = useCallback(() => {
    void open(actions.createDocument?.() ?? createEmptyDocument());
  }, [actions, open]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();

      if (key === 'k') {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      } else if (key === 'f' && useDocument.getState().source) {
        const editorFocused =
          event.target instanceof Element && event.target.closest('.cm-editor') !== null;
        if (useDocument.getState().mode === 'split' && editorFocused) return;
        event.preventDefault();
        handleFind();
      } else if (key === 'n' && useDocument.getState().status !== 'loading') {
        event.preventDefault();
        handleNew();
      } else if (key === 'o' && actions.openAvailable) {
        event.preventDefault();
        void handleOpen();
      } else if (key === 's') {
        event.preventDefault();
        if (!actions.saveAvailable || !useDocument.getState().source) return;
        if (event.shiftKey) void saveAs();
        else void save();
      } else if (key === 'e' && useDocument.getState().source) {
        event.preventDefault();
        void setMode(useDocument.getState().mode === 'view' ? 'edit' : 'view');
      } else if (key === '\\' && splitAvailable && useDocument.getState().source) {
        event.preventDefault();
        void setMode(useDocument.getState().mode === 'split' ? 'edit' : 'split');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions.openAvailable, actions.saveAvailable, handleFind, handleNew, handleOpen, save, saveAs, setMode, splitAvailable]);

  const commands = useMemo<DesktopCommand[]>(() => {
    const result: DesktopCommand[] = [
      {
        id: 'find',
        label: 'Find in document',
        group: 'View',
        hint: '⌘F',
        disabled: !source,
        onRun: handleFind,
      },
      {
        id: 'open',
        label: 'Open document',
        group: 'File',
        hint: '⌘O',
        disabled: !actions.openAvailable || status === 'loading',
        onRun: () => void handleOpen(),
      },
      {
        id: 'new',
        label: 'New document',
        group: 'File',
        hint: '⌘N',
        disabled: status === 'loading',
        onRun: handleNew,
      },
      {
        id: 'save',
        label: 'Save',
        group: 'File',
        hint: '⌘S',
        disabled: !actions.saveAvailable || !source || saving,
        onRun: () => void save(),
      },
      {
        id: 'save-as',
        label: 'Save As',
        group: 'File',
        hint: '⇧⌘S',
        disabled: !actions.saveAvailable || !source || saving,
        onRun: () => void saveAs(),
      },
      {
        id: 'read',
        label: 'Read mode',
        group: 'View',
        disabled: !source,
        onRun: () => void setMode('view'),
      },
      {
        id: 'edit',
        label: 'Edit mode',
        group: 'View',
        disabled: !source,
        onRun: () => void setMode('edit'),
      },
      {
        id: 'split',
        label: 'Split mode',
        group: 'View',
        disabled: !source || !splitAvailable,
        onRun: () => void setMode('split'),
      },
      {
        id: 'appearance-light',
        label: 'Use light appearance',
        group: 'Appearance',
        disabled: theme === 'light',
        onRun: () => setTheme('light'),
      },
      {
        id: 'appearance-dark',
        label: 'Use dark appearance',
        group: 'Appearance',
        disabled: theme === 'dark',
        onRun: () => setTheme('dark'),
      },
      {
        id: 'appearance-system',
        label: 'Follow system appearance',
        group: 'Appearance',
        disabled: theme === 'system',
        onRun: () => setTheme('system'),
      },
      {
        id: 'close',
        label: 'Close document',
        group: 'File',
        disabled: !source,
        onRun: close,
      },
    ];

    if (externalChange) {
      if (dirty) {
        result.push(
          { id: 'conflict-copy', label: 'Save a copy', group: 'Changed on disk', onRun: () => void saveAs() },
          { id: 'conflict-mine', label: 'Keep mine', group: 'Changed on disk', onRun: () => void overwrite() },
        );
      }
      result.push({
        id: 'conflict-theirs',
        label: dirty ? 'Discard mine and load theirs' : 'Load the new version',
        group: 'Changed on disk',
        onRun: () => void reloadFromDisk(),
      });
    }

    return result;
  }, [actions.openAvailable, actions.saveAvailable, close, dirty, externalChange, handleFind, handleNew, handleOpen, overwrite, reloadFromDisk, save, saveAs, saving, setMode, setTheme, source, splitAvailable, status, theme]);

  const activeDocument =
    source && !recents.some((recent) => recent.id === source.id)
      ? [{ id: `active:${source.id}`, name: source.name, selected: true }]
      : [];

  const desktopRecents = [
    ...drafts.map((draft) => ({
      id: `draft:${draft.id}`,
      name: draft.name,
      dirty: true,
    })),
    ...activeDocument,
    ...recents.map((recent) => ({
      id: `recent:${recent.id}`,
      name: recent.name,
      ...(recent.id === source?.id ? { selected: true } : {}),
    })),
  ];

  const desktopDocument =
    status === 'ready' && source && rendered
      ? {
          name: source.name,
          readContent: (
            <DocumentPreviewSurface onRendered={onRendered} canLoadRemoteContent={false} />
          ),
          editContent: <DocumentEditorSurface />,
        }
      : undefined;

  return (
    <div
      className="lmd-desktop-app"
      data-lmd-desktop-root
      data-lmd-shell="desktop"
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'visible'}
    >
      <DesktopShell
        {...(desktopDocument ? { document: desktopDocument } : {})}
        status={status === 'ready' ? 'empty' : status}
        {...(error ? { errorMessage: error } : {})}
        mode={toDesktopMode(mode)}
        dirty={dirty}
        externalChange={externalChange}
        appearance={appearance}
        splitAvailable={splitAvailable}
        sidebarCollapsed={sidebarCollapsed}
        recents={desktopRecents}
        saveDisabled={!actions.saveAvailable || saving}
        openDisabled={!actions.openAvailable || status === 'loading'}
        newDisabled={status === 'loading'}
        onModeChange={(next) => void setMode(toStoreMode(next))}
        onSidebarCollapsedChange={setSidebarCollapsed}
        onSelectRecent={(id) => {
          if (id.startsWith('active:')) return;

          if (id.startsWith('draft:')) {
            const draft = drafts.find((candidate) => candidate.id === id.slice(6));
            if (draft) {
              const detachedSource = actions.createDocument?.(draft.name, {
                text: draft.text,
                shape: draft.shape,
              });
              void restoreDraft(draft, detachedSource);
            }
            return;
          }

          const recent = recents.find((candidate) => candidate.id === id.slice(7));
          if (recent) void openRecent(recent);
        }}
        onOpen={() => void handleOpen()}
        onNew={handleNew}
        onSave={() => void save()}
        onShowCommands={() => setPaletteOpen(true)}
        onFind={handleFind}
        find={find}
        onAppearanceToggle={() => setTheme(appearance === 'dark' ? 'light' : 'dark')}
        onResolveExternalChange={() => setPaletteOpen(true)}
      />
      <DesktopCommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      <Toast />
    </div>
  );
}
