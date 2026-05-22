/**
 * Session context — maintains per-request session state across async boundaries.
 *
 * In Electron (desktop): all IPC handlers share a single global session
 * (one user-per-app-instance, like any desktop accounting tool).
 *
 * In Express (web): each HTTP request runs inside its own AsyncLocalStorage
 * context, so concurrent requests have isolated session state.
 *
 * Handlers always call `currentSession()` to read the active session, which
 * returns the per-request session in HTTP mode, or the global desktop session
 * otherwise.
 */
const { AsyncLocalStorage } = require('async_hooks')

const storage = new AsyncLocalStorage()

// Single shared session for Electron desktop mode
const desktopSession = { user: null }

function currentSession() {
  return storage.getStore() || desktopSession
}

function runWithSession(session, fn) {
  return storage.run(session, fn)
}

module.exports = { currentSession, runWithSession, desktopSession }
