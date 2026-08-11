import { useCallback, useEffect, useState } from 'react';
import { createPastedDocument, openFile } from '@/platform/files';
import { DropTarget } from './components/DropTarget';
import { ExternalChangeNotice } from './components/ExternalChangeNotice';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { Palette } from './components/Palette';
import { PrivacyPage } from './components/PrivacyPage';
import { Toast } from './components/Toast';
import { Workspace } from './components/Workspace';
import { useDocument } from './store';
import { useNavigationGuard } from './use-navigation-guard';
import { usePrintPreparation } from './use-print-preparation';
import { useExternalChange } from './use-external-change';
import { usePeerTabs } from './use-peer-tabs';
import { useRoute } from './use-route';
import { useShortcuts } from './use-shortcuts';
import { useSplitAvailable } from './use-media-query';

export function App() {
  const status = useDocument((s) => s.status);
  const rendered = useDocument((s) => s.rendered);
  const open = useDocument((s) => s.open);
  const hydrate = useDocument((s) => s.hydrate);
  const setMode = useDocument((s) => s.setMode);
  const save = useDocument((s) => s.save);
  const saveAs = useDocument((s) => s.saveAs);
  const splitAvailable = useSplitAvailable();
  const [route, navigate] = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Bumped when the document has finished mounting every batch. A deep link
  // cannot scroll to a heading that has not been rendered yet, and since M5's
  // batching the last heading arrives a few tasks after the first.
  const [renderPass, setRenderPass] = useState(0);
  const onRendered = useCallback(() => setRenderPass((pass) => pass + 1), []);

  usePrintPreparation();
  useNavigationGuard();
  useExternalChange();
  // Owned here rather than in the Header, which unmounts on a route change: the
  // channel would then post a farewell and rejoin under a new identity every
  // time somebody looked at the privacy page.
  const peerTabs = usePeerTabs();

  // Preferences were already applied to <html> by public/theme-init.js before
  // first paint; this reads them into React state and loads the recents list.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useShortcuts({
    onPalette: useCallback(() => setPaletteOpen((wasOpen) => !wasOpen), []),
    onOpen: useCallback(() => {
      void openFile().then((source) => source && open(source));
    }, [open]),
    onPaste: useCallback((text: string) => void open(createPastedDocument(text)), [open]),
    onToggleMode: useCallback(() => {
      void setMode(useDocument.getState().mode === 'view' ? 'edit' : 'view');
    }, [setMode]),
    onToggleSplit: useCallback(() => {
      // Inert below 1024px, matching the control that disappears there. A
      // shortcut that produces an unusable layout is worse than one that does
      // nothing.
      if (!splitAvailable) return;
      void setMode(useDocument.getState().mode === 'split' ? 'edit' : 'split');
    }, [setMode, splitAvailable]),
    onSave: useCallback(() => void save(), [save]),
    onSaveAs: useCallback(() => void saveAs(), [saveAs]),
  });

  // Moving between screens should start at the top, the way following a link
  // does. Without this the privacy page opens mid-scroll.
  //
  // Block body, not a concise arrow: `useEffect(() => window.scrollTo(0, 0))`
  // returns whatever scrollTo returns straight into React's cleanup slot, and
  // React then tries to call it on the next navigation. That crashed the whole
  // app on route change — and only in the production build, because React's
  // development build tolerates it with a warning.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  // A window narrowed below the split threshold has to leave Split, or the
  // reader is stranded in a layout whose control has just disappeared.
  useEffect(() => {
    if (!splitAvailable && useDocument.getState().mode === 'split') void setMode('edit');
  }, [splitAvailable, setMode]);

  // Deep links. The browser scrolls to a fragment on its own only when the hash
  // *changes*, so a hash that was already in the URL when the document arrived
  // — reopening a recent from a shared link, say — needs doing by hand.
  useEffect(() => {
    if (!rendered) return;

    const id = decodeURIComponent(window.location.hash.slice(1));
    // Application routes share the fragment namespace and are prefixed to stay
    // out of the way of heading slugs. See use-route.ts.
    if (!id || id.startsWith('/')) return;

    document.getElementById(id)?.scrollIntoView();
  }, [rendered, renderPass]);

  const palette = paletteOpen && (
    <Palette onClose={() => setPaletteOpen(false)} onOpenPrivacy={() => navigate('privacy')} />
  );

  if (route === 'privacy') {
    return (
      <>
        <Header onOpenPrivacy={() => navigate('privacy')} peerTabs={peerTabs} />
        <PrivacyPage onClose={() => navigate('document')} />
        {palette}
        <Toast />
      </>
    );
  }

  return (
    <DropTarget>
      <Header onOpenPrivacy={() => navigate('privacy')} peerTabs={peerTabs} />
      {/* Above the workspace rather than inside it, so it is present in Read,
          Edit and Split alike. A conflict is a fact about the document, not
          about the mode someone happens to be looking at it in. */}
      <ExternalChangeNotice />
      {status === 'ready' && rendered ? (
        <Workspace onRendered={onRendered} />
      ) : (
        <Landing onOpenPrivacy={() => navigate('privacy')} />
      )}
      {palette}
      <Toast />
    </DropTarget>
  );
}
