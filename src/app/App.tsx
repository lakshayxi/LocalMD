import { useCallback, useEffect, useState } from 'react';
import { Document } from '@/render';
import { createPastedDocument, openFile } from '@/platform/files';
import { DropTarget } from './components/DropTarget';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { Outline } from './components/Outline';
import { Palette } from './components/Palette';
import { PrivacyPage } from './components/PrivacyPage';
import { RemoteContentNotice } from './components/RemoteContentNotice';
import { useDocument } from './store';
import { usePrintPreparation } from './use-print-preparation';
import { useRoute } from './use-route';
import { useShortcuts } from './use-shortcuts';

export function App() {
  const status = useDocument((s) => s.status);
  const rendered = useDocument((s) => s.rendered);
  const open = useDocument((s) => s.open);
  const hydrate = useDocument((s) => s.hydrate);
  const [route, navigate] = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);

  usePrintPreparation();

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
  }, [rendered]);

  const palette = paletteOpen && (
    <Palette onClose={() => setPaletteOpen(false)} onOpenPrivacy={() => navigate('privacy')} />
  );

  if (route === 'privacy') {
    return (
      <>
        <Header onOpenPrivacy={() => navigate('privacy')} />
        <PrivacyPage onClose={() => navigate('document')} />
        {palette}
      </>
    );
  }

  return (
    <DropTarget>
      <Header onOpenPrivacy={() => navigate('privacy')} />
      {status === 'ready' && rendered ? (
        <>
          <RemoteContentNotice />
          <Outline />
          <Document tree={rendered.tree} />
        </>
      ) : (
        <Landing onOpenPrivacy={() => navigate('privacy')} />
      )}
      {palette}
    </DropTarget>
  );
}
