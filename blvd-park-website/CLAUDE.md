# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Operator Mode

- If identity is unknown, ask: `Are you Wes or Valarie?`
- **Wes**: direct implementation, minimal explanation.
- **Valarie** (or `/valariedev`): hand-holding mode — explain what each thing is, why it matters, and what can break. Define jargon on first use. Before any risky/destructive action, pause and include: `ARE YOU SURE? HAVE YOU TALKED TO WES?`

---

## Commands

```bash
# Frontend (Astro SSG)
npm run dev            # astro dev --port 3000
npm run build          # astro build  (sets PUBLIC_API_URL=https://blvdpark.com in deploy)
npm run preview        # serve dist/

# Backend (Express API)
npm run backend        # node backend/server.js  (separate terminal, port 3001)
npm run backend:init   # node backend/init-db.js  (first-time DB setup)

# Quality
npm run lint           # eslint .
npm run lint:fix       # eslint . --fix
npm run test:e2e       # playwright test
```

Backend has its own `package.json` in `backend/` — run `npm install` there separately.

---

## Architecture Overview

Two independent services, deployed as Docker containers behind nginx:

```
blvdpark-frontend  (nginx static)   ← Astro SSG dist/
blvdpark-api       (Express + SQLite, port 3006 internal)
nginx-clegroup     (0.0.0.0:80/443) ← reverse proxy: /api/* → blvdpark-api
```

**Frontend** (`src/`) is a **static Astro 5 site**. All pages are pre-rendered at build time. Interactive admin sections use React (client-side only). No Astro SSR — all dynamic data fetches happen in the browser.

**Backend** (`backend/server.js`) is a **Node.js/Express API** with a SQLite database via `better-sqlite3`. It exposes `/api/*` endpoints consumed by both the public site and the admin panel.

---

## Backend API Surface

All routes are in `backend/server.js` (inline) plus `backend/routes/sso.js`:

| Prefix | Auth? | Purpose |
|---|---|---|
| `GET /api/health` | No | Health check |
| `GET/POST /api/events` | POST requires auth | Events CRUD |
| `GET/POST /api/gallery` | POST requires auth | Gallery images; `type=home\|main` filter |
| `PUT /api/gallery/reorder` | Yes | Drag-and-drop reorder |
| `GET/POST /api/menu` | POST requires auth | Menu items; `isLunchOnly` flag |
| `GET/PATCH/DELETE /api/reservations/:id` | Yes | Reservation management |
| `POST /api/reservations` | No | Public reservation form |
| `GET/POST/DELETE /api/contact` | POST: No, GET: Yes | Contact form submissions |
| `GET/PUT /api/hours` | PUT requires auth | Business hours (7 rows, one per day) |
| `GET /api/content` | No | CMS key/value content |
| `PUT /api/content` | Yes | Batch update CMS content |
| `GET /api/content/schema` | Yes | CMS field schema |
| `GET /api/stream` | No | SSE realtime updates (broadcast on content change) |
| `POST /api/auth/login` | — | Email + password → session token |
| `POST /api/auth/logout` | Yes | Invalidate session |
| `GET /api/auth/verify` | Yes | Check token validity |
| `POST /api/auth/reset-password-request` | — | Email password reset link |
| `POST /api/auth/reset-password` | — | Consume reset token |
| `GET /api/sso` | — | SSO entry from CLE Admin Hub (JWT → session) |
| `GET /api/stats` | Yes | Dashboard counts |
| `POST /api/users` | super_admin | Create admin user |

**Auth middleware** (`requireAuth`): accepts `x-auth-key` header OR `Authorization: Bearer <token>`. Raw `ADMIN_API_KEY` grants `super_admin`; otherwise looks up session token in SQLite.

---

## Frontend Data Flow

- **`src/lib/api.ts`** — single typed API client. All fetch calls go through here. Token is read from `localStorage` key `blvd-auth-token`.
- **`src/lib/authStore.ts`** — Zustand + persist store. Manages auth state; `setToken()` writes to both store and localStorage.
- **`src/components/Providers.tsx`** — wraps React admin components with `QueryClientProvider` (TanStack Query).
- Admin components in `src/components/admin/` use TanStack Query hooks against `api.*` methods.

---

## Admin Panel Architecture

All admin pages are under `src/pages/admin/` and use `src/layouts/AdminLayout.astro`. The heavy lifting is done by React components in `src/components/admin/`:

- `AdminPage.tsx` — root shell, reads auth token from URL hash (SSO flow) or localStorage
- `AdminDashboard.tsx` — stats overview
- `AdminEvents.tsx` / `AdminGallery.tsx` / `AdminMenu.tsx` — full CRUD with image upload
- `AdminReservations.tsx` / `AdminContactForms.tsx` — inbox-style management
- `AdminHours.tsx` — day-of-week hours table
- `AdminContent.tsx` — CMS editor (TinyMCE for rich fields, plain inputs for others)
- `AdminSidebar.tsx` — navigation

**Gallery reorder** uses `@dnd-kit/sortable` with optimistic updates.

---

## CMS System

`site_content` SQLite table: `key TEXT PK | value TEXT | type TEXT | updatedAt`. Schema is defined in `backend/content-schema.js` and seeded on every server start (INSERT OR IGNORE). Frontend components read CMS values via `GET /api/content`; realtime updates push via SSE (`GET /api/stream` → `event: update`).

Layout components accept `metaTitleKey`, `metaDescriptionKey`, `metaImageKey` props — these map to `data-cms-key` / `data-cms-attr` attributes for client-side CMS hydration.

---

## SSO Flow

CLE Group Admin Hub issues a short-lived JWT signed with `SSO_SECRET`. The hub redirects to `GET /api/sso?token=<jwt>`. The backend verifies the JWT via `backend/lib/sso-verify.js`, finds-or-creates the local user, creates a session, and redirects to `/admin#token=<session-token>`. `AdminPage.tsx` reads the hash, persists it, and clears the URL.

---

## Deployment

**Single production environment** — no staging.

**Frontend (SSR, since 2026-07-22):** the frontend is an SSR Node container (`blvdpark-ssr`) built from `/opt/clegroup/sources/blvdpark-frontend` (canonical git repo). Deploy frontend changes:

```bash
rsync -az --checksum -e ssh --exclude node_modules/ --exclude dist/ --exclude .astro/ --exclude backups/ --exclude test-results/ --exclude backend/node_modules/ --exclude backend/database/ --exclude .env --exclude backend/.env --exclude public/uploads/ ./ weswalz@69.28.91.132:/opt/clegroup/sources/blvdpark-frontend/
ssh weswalz@69.28.91.132 'cd /opt/clegroup/sources/blvdpark-frontend && git add -A && git commit -m "deploy: <what changed>"'
ssh weswalz@69.28.91.132 'cd /opt/clegroup && docker compose up -d --build blvdpark-ssr'
```

The old static-nginx `blvdpark-frontend` container is retained for rollback (nginx upstream revert). `deploy.sh` remains the **backend** path only:

```bash
./deploy.sh                    # standard — builds, backs up, rsync, docker compose up --build
./deploy.sh --backend-only     # skip frontend build
./deploy.sh --frontend-only    # skip backend rsync
./deploy.sh --skip-build       # use existing dist/
./deploy.sh --dry-run          # preview changes only
./deploy.sh --rollback         # restore from latest backups/ tarball
./deploy.sh --force-overwrite  # override server-newer detection (diff first!)
./deploy.sh --yes              # skip confirmation prompts
```

The script detects if server files are **newer than local** (hotfix applied directly on server) and aborts — resolve by pulling the server file, diffing, then redeploying. See `.claude/skills/deploy/skill.md` for full runbook.

Server: `weswalz@69.28.91.132`, Docker Compose at `/opt/clegroup/`. SQLite DB and uploads live in named Docker volumes — **never copy local DB to production**.

---

## Environment Variables

Frontend (`.env`, prefix `PUBLIC_` for browser exposure):
- `PUBLIC_API_URL` — backend base URL (default `https://blvdpark.com`)
- `PUBLIC_TINYMCE_API_KEY` — TinyMCE cloud key for content editor
- `PUBLIC_ADMIN_HUB_URL` — CLE Admin Hub URL for SSO link

Backend (`backend/.env`):
- `ADMIN_API_KEY` — super_admin bypass key
- `DB_PATH` — SQLite file path (default `backend/database/blvdpark.db`)
- `UPLOADS_DIR` — image upload directory (default `public/uploads/`)
- `PORT` — Express port (default 3001)
- `FRONTEND_URL` / `FRONTEND_URLS` — comma-separated CORS origins
- `SSO_SECRET` — JWT signing secret shared with CLE Admin Hub
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` — email for password reset
- `RESET_DB` — set `true` to wipe and reinitialize DB on startup

---

## Key Conventions

- All public-facing components are suffixed `2026` (e.g., `Hero2026.astro`, `Footer2026.astro`). The 2026 redesign replaced all prior components.
- `Layout2026.astro` is the base layout for public pages; `AdminLayout.astro` is for admin pages.
- Image uploads are stored in `public/uploads/` locally and served as `/uploads/<filename>`. In production this maps to the Docker volume.
- The backend uses **CommonJS** (`require`/`module.exports`); the frontend uses **ESM** (`import`/`export`).
- Re-scan env var usage: `rg "process\.env|import\.meta\.env"`

---

## Docs Freshness Checklist

- Verify routes against `src/pages/` directory.
- Verify API endpoints against `backend/server.js` and `backend/routes/`.
- Verify env vars via `rg "process\.env|import\.meta\.env"`.
- Verify commands against `package.json` and `backend/package.json`.

Last verified: 2026-03-26
