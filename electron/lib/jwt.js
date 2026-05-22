/**
 * JWT issuance + verification.
 *
 * Two transport modes coexist:
 *
 *   1. Cookie sessions (Phase 1) — express-session keeps a server-side
 *      session and the cookie carries just an opaque session ID. Used by
 *      the existing web shim. No change needed.
 *
 *   2. Bearer JWT (Phase B, new) — for stateless API clients (the future
 *      cloud sync engine, a mobile app, or curl). The token is signed
 *      with HS256 and validated on every request.
 *
 * The Express layer accepts EITHER a valid session cookie OR a valid
 * `Authorization: Bearer <token>` header — the bearer takes precedence
 * when both are present. See `requireAuthMiddleware` in server/index.js.
 *
 * Secret resolution (in priority order):
 *   1. process.env.JWT_SECRET                — set in prod / CI
 *   2. a stable secret persisted alongside the SQLite DB on first launch
 *
 * Persisting the secret to disk on first launch lets a desktop install
 * sign tokens that survive across restarts without forcing the user to
 * configure anything. The file lives next to imprest.db with permissions
 * 0600.
 */
const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ALG = 'HS256'
const DEFAULT_TTL = '7d'

let _cachedSecret = null

function resolveSecret() {
  if (_cachedSecret) return _cachedSecret
  if (process.env.JWT_SECRET) {
    _cachedSecret = process.env.JWT_SECRET
    return _cachedSecret
  }

  // Fall back to a secret persisted next to the SQLite DB
  let dataDir
  try {
    const electron = require('electron')
    if (electron?.app?.getPath) dataDir = electron.app.getPath('userData')
  } catch { /* not in Electron */ }
  if (!dataDir) {
    dataDir = process.env.IMPREST_DATA_DIR || path.join(require('os').homedir(), '.imprest-fms')
  }
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  const secretPath = path.join(dataDir, 'jwt.secret')
  if (fs.existsSync(secretPath)) {
    _cachedSecret = fs.readFileSync(secretPath, 'utf8').trim()
    return _cachedSecret
  }

  // Generate a fresh secret and write with 0600 permissions
  _cachedSecret = crypto.randomBytes(48).toString('base64url')
  fs.writeFileSync(secretPath, _cachedSecret, { mode: 0o600 })
  return _cachedSecret
}

/**
 * Sign a JWT for the given user. Payload includes only safe public fields.
 *
 * @param {object} user — must have at least { id, username, role }
 * @param {object} opts — { expiresIn?: string, audience?: string }
 * @returns {string} a signed JWT
 */
function signToken(user, opts = {}) {
  if (!user?.id) throw new Error('signToken: user.id required')
  const payload = {
    sub: String(user.id),
    username: user.username,
    role: user.role,
    full_name: user.full_name || null,
  }
  return jwt.sign(payload, resolveSecret(), {
    algorithm: ALG,
    expiresIn: opts.expiresIn || DEFAULT_TTL,
    audience: opts.audience || 'imprest-fms',
    issuer: 'imprest-fms',
  })
}

/**
 * Verify and decode a token. Returns the public claims on success.
 * Throws on invalid / expired / wrong-issuer.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing token')
  }
  const claims = jwt.verify(token, resolveSecret(), {
    algorithms: [ALG],
    audience: 'imprest-fms',
    issuer: 'imprest-fms',
  })
  return {
    id: Number(claims.sub),
    username: claims.username,
    role: claims.role,
    full_name: claims.full_name || null,
    iat: claims.iat,
    exp: claims.exp,
  }
}

/**
 * Express middleware factory. If a valid `Authorization: Bearer <jwt>`
 * is present, populates `req.session.user` so existing handlers see it
 * exactly like a cookie-based session.
 *
 * Place AFTER express-session in the middleware chain so cookie sessions
 * still work for the web UI; this only kicks in when no cookie session
 * exists but a bearer header does.
 */
function bearerAuthMiddleware() {
  return (req, res, next) => {
    if (req.session?.user) return next()  // cookie session present, nothing to do

    const auth = req.headers.authorization || ''
    if (!auth.startsWith('Bearer ')) return next()
    const token = auth.slice(7).trim()
    if (!token) return next()

    try {
      const claims = verifyToken(token)
      // Promote to a session-shaped object so all existing handlers work
      // (auth.js uses currentSession().user without caring about source)
      req.session = req.session || {}
      req.session.user = {
        id: claims.id,
        username: claims.username,
        role: claims.role,
        full_name: claims.full_name,
        // Note: bearer-mode users don't have a password_hash on req.session.
        // requireRole only reads role, so this is fine. Password-change
        // operations re-fetch the user from the DB, also fine.
      }
      req.session._bearer = true  // marker for diagnostics
      next()
    } catch (err) {
      // Invalid token — return 401 explicitly. This is intentional: an
      // attacker passing a bogus bearer should not silently fall through
      // to cookie auth.
      res.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}

module.exports = { signToken, verifyToken, bearerAuthMiddleware }
