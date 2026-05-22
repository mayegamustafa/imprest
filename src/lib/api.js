// Safe wrapper — works in browser dev mode too (fallback stubs)
const api = typeof window !== 'undefined' && window.electronAPI
  ? window.electronAPI
  : {}

export default api
