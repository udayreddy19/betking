import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/appleFoundations.css'
import App from './App.jsx'
import { bindAppViewport } from './utils/browserCompat.js'

bindAppViewport()

// Automatically reload if a dynamic import fails due to a new deployment release
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event?.preventDefault?.();
    const key = 'oddsyra_last_preload_reload';
    const last = Number(sessionStorage.getItem(key) || '0');
    const now = Date.now();
    // Guard against reload loops; reload at most once every 10 seconds
    if (now - last > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
