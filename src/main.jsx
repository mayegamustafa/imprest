import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import webApi from './lib/web-shim'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'

// ─── Install web shim if not running inside Electron ─────────────────────────
// Electron's preload exposes `window.electronAPI` with native IPC bindings.
// In the browser we install a fetch-based shim that talks to the Express
// server at /api/* — so the rest of the app calls window.electronAPI.* with
// no awareness of the underlying transport.
if (typeof window !== 'undefined') {
  if (!window.electronAPI) {
    window.electronAPI = webApi
    window.__IMPREST_MODE__ = 'web'
  } else {
    window.__IMPREST_MODE__ = 'desktop'
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
