import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DesignGraph } from './DesignGraph';
import './design-graph.css';

const root = document.getElementById('design-graph-root');

if (!root) {
  throw new Error('Design graph root was not found.');
}

createRoot(root).render(
  <StrictMode>
    <DesignGraph />
  </StrictMode>,
);
