import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Safe logging for promise rejections without leaking credentials or escalating unhandled errors
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  const reason = event.reason;
  const message = typeof reason === 'object' && reason !== null ? reason.message : String(reason ?? '');
  const safeMessage = (message || '').replace(
    /(?:api_?key|private_?key|secret|token|authorization)[":=\s]+([a-zA-Z0-9_\-\.\/]{8,})/gi,
    '***REDACTED***'
  );
  if (safeMessage) {
    console.warn('[POLYESTER TITAN AI] Intercepted Promise Rejection:', safeMessage);
  }
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
