/** Standalone sandbox entry (src/dev/sandbox.html) that avoids loading the full app graph. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../core/strings';
import Sandbox from './Sandbox';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sandbox />
  </StrictMode>,
);
