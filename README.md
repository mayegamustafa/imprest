# Imprest FMS — Imprest Financial Management System

Offline-first system for tracking imprest expenditures, generating expenditure abstracts, and exporting reports as PDF and Excel — pixel-faithful to the existing Excel format.

Runs in three modes:
- **Desktop app** (Windows `.exe`, Linux `.AppImage` / `.deb`)
- **Web app** (browser, multi-user, sessioned auth)
- **Hybrid** — desktop and web can use the same database file

---

## Features

- Periods (school terms / months / quarters / custom) with imprest cycles that carry balances forward
- Voucher ledger: date, payee, purpose, amount, running balance
- Multi-category split per voucher (sum of splits must equal voucher amount)
- Auto-generated **Abstract** with category totals
- **PDF export** (Puppeteer) — Ledger, Abstract
- **Excel export** (ExcelJS) — Ledger, Abstract, or Combined (both sheets in one .xlsx)
- **Closed cycles** become read-only (admins can re-open)
- **User accounts** with three roles: Admin, Accountant, Viewer
- **Audit log** of every create / update / delete with the user who did it
- **Backup & restore** (SQLite file)
- 100% offline — no internet required

---

## How to run

> **Important**: `better-sqlite3` is a native module that has to match the runtime
> ABI. The npm scripts below run the appropriate rebuild automatically before
> launch. You only ever need to run `npm install` once.

### Option 1 — Desktop (recommended for one user)

```bash
npm install
npm run dev
```

This auto-rebuilds `better-sqlite3` for Electron, then starts Vite + Electron. The Imprest FMS window opens automatically. **Don't open `http://localhost:5173` in a browser** in this mode — only the Electron window has the database connection.

### Option 2 — Web (recommended for multi-user / remote access)

```bash
npm install
npm run dev:web
```

This auto-rebuilds `better-sqlite3` for Node, then starts Vite + Express. Open **`http://localhost:3001`** in your browser — that's the only URL you need.

Behind the scenes, `dev:web` starts:
- The Express server on `:3001` (handles `/api/*` and proxies the UI)
- The Vite dev server on `:5173` (compiles React with hot reload)

Express proxies all non-API requests to Vite, so you get hot-reload while still using a single URL. Don't open `:5173` directly — `:3001` is the canonical URL.

### Switching between modes

The native binding can only be built for one runtime at a time, so the `dev` and `dev:web` scripts each rebuild it as needed. If you switch between modes, the rebuild takes 10–30 seconds the first time. You can also rebuild manually:

```bash
npm run rebuild:electron    # build native modules for Electron
npm run rebuild:node        # build native modules for Node
```

### Production web deployment

```bash
npm run rebuild:node    # ensure native bindings target Node
npm run build:web       # compile UI to dist/
npm run start:web       # serve UI + API from :3001
```

---

## First-time login

The system seeds a default admin user on first run:

| Username | Password |
|---|---|
| `admin` | `admin` |

You'll be **forced to change the password** on first login.

After that, go to **Settings → Users** to create accountants and viewers.

---

## Build installers

### Linux

```bash
npm run build:linux
```
Produces in `dist-electron/`:
- `Imprest FMS-1.0.0.AppImage` — single portable binary, just `chmod +x` and run
- `imprest-fms_1.0.0_amd64.deb` — install with `sudo dpkg -i <file>`

### Windows

```bash
npm run build:win
```
Produces:
- `Imprest FMS Setup 1.0.0.exe` — NSIS installer with desktop shortcut

> Building for Windows from Linux requires Wine. The simplest path is to copy the project to a Windows machine and run `npm install && npm run build:win` there.

---

## Release process (GitHub Releases + auto-updates)

The app uses **[electron-updater](https://www.electron.build/auto-update)** + **GitHub Releases**. Cutting a new release publishes installers and triggers auto-updates for every existing user — no manual reinstall required.

### One-time setup (already done in this repo)

- Repo: <https://github.com/mayegamustafa/imprest>
- `.github/workflows/release.yml` runs `electron-builder --publish always` on tag push
- `.github/workflows/ci.yml` runs on every push/PR (lint + Vite build + schema smoke test)
- `electron-builder.yml` has `publish: { provider: github, owner: mayegamustafa, repo: imprest }`
- `electron-updater` is initialised in `electron/updater.js` and checks for updates 30 s after launch, then hourly

### Cutting a release

```bash
# 1. Bump the version (creates a commit + a tag like v1.0.1)
npm version patch       # or: minor / major

# 2. Push commits AND the tag
git push --follow-tags
```

GitHub Actions then:
1. Builds the Windows .exe and Linux .AppImage / .deb installers on their respective runners
2. Uploads them to a new GitHub Release named after the tag (e.g. `v1.0.1`)
3. Generates `latest.yml` (Windows) and `latest-linux.yml` (Linux) — these are the manifest files electron-updater reads

Within an hour, every running app installation downloads the update in the background and prompts the user to install on next restart.

### Pushing the initial code to GitHub

```bash
git push -u origin main   # First push — creates the main branch on GitHub
```

You'll need a GitHub personal access token with `repo` scope (or use the `gh` CLI). After that, normal `git push` is enough.

### Required GitHub repo secrets

`GITHUB_TOKEN` is auto-provided to Actions runs — **no manual secret needed** for releases.

If you ever want to publish from your laptop instead of CI:
```bash
export GH_TOKEN=ghp_yourTokenHere
npm run release   # builds for current OS and uploads to GitHub
```

---

## Roles

| Role | Can |
|---|---|
| **Admin** | Everything — manage users, settings, all entries, reopen/delete cycles, backup/restore |
| **Accountant** | Add/edit/delete entries, create cycles, close cycles. Can't manage users or delete cycles |
| **Viewer** | Read-only — cannot create or modify anything |

All write operations are gated at the **HTTP/IPC handler layer** — even a tampered request can't bypass role checks.

---

## Where data lives

### Desktop mode
Per-OS application data folder:
- **Linux**: `~/.config/imprest-fms/imprest.db`
- **Windows**: `%APPDATA%\imprest-fms\imprest.db`
- **macOS**: `~/Library/Application Support/imprest-fms/imprest.db`

### Web mode
- `~/.imprest-fms/imprest.db` (override with `IMPREST_DATA_DIR=/path/to/dir`)

The same database file works in both modes — you can use the desktop app on your laptop and the web mode on a server pointing at the same file (just not at the same time).

---

## Project structure

```
imprest/
├── electron/                  # Electron main process (Node)
│   ├── main.js                # Window + IPC registration
│   ├── preload.js             # Security bridge for renderer
│   ├── lib/
│   │   └── session-context.js # AsyncLocalStorage session — isolates per-request state in web mode
│   ├── db/
│   │   ├── schema.sql         # SQLite DDL
│   │   ├── connection.js      # DB init (works in Electron and standalone)
│   │   └── seed.js            # Default admin, categories, signatories
│   ├── ipc/                   # Handler functions (also used by Express server)
│   │   ├── auth.js            # login/logout/users/roles
│   │   ├── settings.js
│   │   ├── terms.js
│   │   ├── entries.js
│   │   └── reports.js         # PDF / Excel generation
│   ├── pdf/                   # Puppeteer templates
│   └── excel/                 # ExcelJS workbook builders
├── server/
│   └── index.js               # Express HTTP server (web mode)
├── src/                       # React UI
│   ├── App.jsx
│   ├── main.jsx               # Installs web shim if not in Electron
│   ├── components/            # Layout + ui components
│   ├── pages/                 # Login, Dashboard, Terms, Entries, Abstract, Reports, Settings
│   ├── store/                 # Zustand global state
│   └── lib/
│       ├── web-shim.js        # Fetch-based shim that mimics window.electronAPI
│       ├── api.js
│       ├── formatters.js
│       └── validators.js
├── package.json
├── vite.config.js             # Includes /api proxy for web dev mode
└── electron-builder.yml       # Cross-platform packaging
```

---

## Architecture (web mode)

```
   Browser                           Express server (3001)
  ┌────────┐    POST /api/rpc       ┌──────────────────────┐
  │ React  │ ────────────────────▶  │  AsyncLocalStorage   │
  │   +    │                         │  per-request session │
  │webshim │ ◀───────────────────── │                      │
  └────────┘     JSON {result}       │  IPC handlers ──┐   │
                                     │                 ▼   │
                                     │           SQLite DB │
                                     └──────────────────────┘
```

Each HTTP request runs inside its own `AsyncLocalStorage` context, so `requireRole()` reads the correct user even when many requests are in flight at once. The same handler functions power Electron IPC (single global session) and the Express server (per-request session) — no duplication.

---

## Troubleshooting

**"Cannot reach the backend server" / "Backend not connected"**
→ Make sure you ran `npm run dev` (desktop) or `npm run dev:web` (web). Don't open `http://localhost:5173` in a browser when running desktop mode.

**Port already in use (3001 or 5173)**

The `dev` and `dev:web` scripts now auto-clean stale processes before starting. If you ever need to do it manually:

```bash
npm run stop          # kills anything listening on 3001 or 5173
```

That's safe to run any time. It's also what runs automatically as `predev:web` and `predev` hooks before launching.

**better-sqlite3 NODE_MODULE_VERSION mismatch (most common error)**
This means the native binding was compiled for a different runtime than the one trying to load it. Fix:

```bash
# If running desktop (Electron):
npm run rebuild:electron

# If running web (Node):
npm run rebuild:node
```

The `npm run dev` and `npm run dev:web` scripts run the right rebuild automatically, so usually this fixes itself.

**Server exits immediately with code 0**
This was caused by `cross-env v10` detaching child processes. Fixed in current version — make sure you've pulled the latest scripts and your `package.json` has `"dev:server": "node server/index.js dev"` (no `cross-env`).

**Forgot admin password**
Stop the server, delete the `imprest.db` file (after backing up), restart — you'll get fresh `admin / admin` credentials. **Note: this wipes ALL data.**

For password reset without losing data, edit the database directly:
```bash
node -e "const Database=require('better-sqlite3'),bcrypt=require('bcryptjs'); const db=new Database('PATH/TO/imprest.db'); db.prepare('UPDATE users SET password_hash=?, must_change_password=1 WHERE username=?').run(bcrypt.hashSync('admin',10),'admin'); console.log('reset')"
```

---

## Tech stack

| Layer | Tech |
|------|-----|
| Desktop shell | Electron 29 |
| Web server | Express 4 + express-session + multer |
| UI | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Font | Inter |
| State | Zustand |
| Database | SQLite (better-sqlite3) |
| Auth | bcryptjs + cookie sessions |
| PDF | Puppeteer |
| Excel | ExcelJS |
| Packaging | electron-builder |
