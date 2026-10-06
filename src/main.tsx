import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './core/strings';
import App from './ui/App';

const Sandbox = lazy(() => import('./dev/Sandbox'));
const isSandbox = typeof location !== 'undefined' && location.hash.startsWith('#sandbox');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSandbox ? (
      <Suspense fallback={null}><Sandbox /></Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
