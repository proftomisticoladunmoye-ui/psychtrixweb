import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './components/AuthProvider';
import App from './App.tsx';
import './index.css';
import { registerServiceWorker, initBackgroundSync } from './registerSW';
import { flushOutbox, pendingWriteCount } from './lib/supabase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);

registerServiceWorker();
initBackgroundSync(flushOutbox, pendingWriteCount);
