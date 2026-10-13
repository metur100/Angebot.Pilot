import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import './styles/index.css';

async function enableMocks() {
  // Dev-only: the MSW worker is never part of a production build (import.meta.env.DEV is false there).
  // The condition is inlined so the bundler removes the mock code (and MSW) from production builds.
  if (!(import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true')) return;
  const { startMockWorker } = await import('./mocks/browser');
  await startMockWorker();
}

void enableMocks().then(() => {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root fehlt');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
