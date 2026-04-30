import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// One-shot cleanup for users who got stuck on a stale precache from an
// earlier deploy (symptoms: login spinner that never resolves, buttons
// requiring multiple clicks, skeletons that don't lift). We mark the
// browser as "purged" via localStorage so this runs exactly once per
// browser, not on every load. Wrapped in best-effort try/catch — none
// of this is allowed to block app boot.
const PWA_RESET_KEY = 'vanlavino:pwa-reset:v1';
if (typeof window !== 'undefined' && !localStorage.getItem(PWA_RESET_KEY)) {
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
    }
    if (typeof caches !== 'undefined') {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
  } catch {
    /* noop */
  }
  localStorage.setItem(PWA_RESET_KEY, '1');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
