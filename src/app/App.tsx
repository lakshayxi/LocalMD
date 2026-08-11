import { useEffect } from 'react';
import { Document } from '@/render';
import { DropTarget } from './components/DropTarget';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { PrivacyPage } from './components/PrivacyPage';
import { RemoteContentNotice } from './components/RemoteContentNotice';
import { useDocument } from './store';
import { usePrintPreparation } from './use-print-preparation';
import { useRoute } from './use-route';

export function App() {
  const status = useDocument((s) => s.status);
  const rendered = useDocument((s) => s.rendered);
  const [route, navigate] = useRoute();

  usePrintPreparation();

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

  if (route === 'privacy') {
    return (
      <>
        <Header onOpenPrivacy={() => navigate('privacy')} />
        <PrivacyPage onClose={() => navigate('document')} />
      </>
    );
  }

  return (
    <DropTarget>
      <Header onOpenPrivacy={() => navigate('privacy')} />
      {status === 'ready' && rendered ? (
        <>
          <RemoteContentNotice />
          <Document tree={rendered.tree} />
        </>
      ) : (
        <Landing onOpenPrivacy={() => navigate('privacy')} />
      )}
    </DropTarget>
  );
}
