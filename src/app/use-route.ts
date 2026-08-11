import { useEffect, useState } from 'react';

/**
 * The smallest possible router.
 *
 * A real router would be several kilobytes to distinguish two screens. What is
 * needed is that the privacy page has a shareable URL and that the back button
 * works.
 *
 * Routes are prefixed `#/` rather than using a bare `#privacy`, because heading
 * anchors occupy the same namespace — a document with a "## Privacy" heading
 * gets the id `privacy`, and linking to it would otherwise navigate away from
 * the document. Slugs never begin with a slash, so the prefix keeps the two
 * kinds of fragment from colliding.
 */

export type Route = 'document' | 'privacy';

function readRoute(): Route {
  return window.location.hash === '#/privacy' ? 'privacy' : 'document';
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRouteState] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRouteState(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (next: Route) => {
    // Assigning the hash pushes a history entry, so the back button returns to
    // the document rather than leaving the app.
    window.location.hash = next === 'privacy' ? '#/privacy' : '';
    setRouteState(next);
  };

  return [route, navigate];
}
