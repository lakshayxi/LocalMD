import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/base.css';
import { DesktopApp } from './DesktopApp';
import { createNativeDesktopActions } from './native-files';
import './root.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <DesktopApp actions={createNativeDesktopActions()} />
  </StrictMode>,
);
