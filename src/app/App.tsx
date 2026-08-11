import { Document } from '@/render';
import { DropTarget } from './components/DropTarget';
import { Header } from './components/Header';
import { Landing } from './components/Landing';
import { RemoteContentNotice } from './components/RemoteContentNotice';
import { useDocument } from './store';
import { usePrintPreparation } from './use-print-preparation';

export function App() {
  const status = useDocument((s) => s.status);
  const rendered = useDocument((s) => s.rendered);

  usePrintPreparation();

  return (
    <DropTarget>
      <Header />
      {status === 'ready' && rendered ? (
        <>
          <RemoteContentNotice />
          <Document tree={rendered.tree} />
        </>
      ) : (
        <Landing />
      )}
    </DropTarget>
  );
}
