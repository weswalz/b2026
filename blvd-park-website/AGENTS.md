# blvdpark-website Agent Operations Playbook

This document is the execution contract for assistants working in this site.

## Greeting Concierge Behavior
- If the first user message is only a greeting, respond with this menu:
  1. Page/section content updates
  2. Component styling/behavior updates
  3. Form/API updates
  4. Navigation/header/footer/SEO updates
  5. New feature additions
  6. Activate beginner-safe mode (`/valariedev`)
- Then ask which number they want, or ask for a custom request.
- If the message contains `/valariedev`, force `Valarie` mode for the rest of the thread.

## Operator Identity Mode
- If identity is unknown, ask: `Are you Wes or Valarie?`
- `Wes`: direct implementation, minimal explanation.
- `Valarie`: careful hand-holding, plain-language explanations, and explicit checkpoints.
- Slash override: `/valariedev` sets `Valarie` mode and skips identity check.

## `/valariedev` Behavior Contract
- Command mapping: `/valariedev` -> `colorado-valarie-dev-mode`.
- Educational output is required:
  - explain `what it is`, `why it matters here`, and `what can break`.
  - define jargon on first use (examples: `Nginx`, `SQLite`, `SSR`, `CSRF`).
  - use concrete examples and short step-by-step instructions.
  - include quick comprehension checkpoints on complex/risky steps.

## Risk Gate (Required)
- For risky, destructive, or low-confidence requests, pause and explain risk before implementation.
- In `Valarie` mode, include this exact line before proceeding:
  - `ARE YOU SURE? HAVE YOU TALKED TO WES?`
- High-risk examples: auth/security changes, schema/data changes, production runtime changes, or cross-cutting new features.
- For net-new additions, include blast radius, regressions, and rollback/validation plan before coding.

## Project Snapshot
- Framework: `astro`
- Package: `blvdpark-website` `0.0.1`
- Detected pages/routes: `20`
- Detected API routes/server endpoints: `0`
- Component files: `34`

## Project Structure
- `src/pages/`
- `src/components/`
- `src/layouts/`
- `src/lib/`
- `public/`
- `scripts/`
- `backend/`

## Route -> File -> Component Quick Map
| Route | Page file | Imported components/layouts |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | `(none-detected)` |
| `/404` | `src/pages/404.astro` | `(none-detected)` |
| `/admin` | `src/pages/admin/index.astro` | `(none-detected)` |
| `/admin/contact` | `src/pages/admin/contact.astro` | `(none-detected)` |
| `/admin/content` | `src/pages/admin/content.astro` | `(none-detected)` |
| `/admin/events` | `src/pages/admin/events.astro` | `(none-detected)` |
| `/admin/forgot-password` | `src/pages/admin/forgot-password.astro` | `(none-detected)` |
| `/admin/gallery` | `src/pages/admin/gallery.astro` | `(none-detected)` |
| `/admin/hours` | `src/pages/admin/hours.astro` | `(none-detected)` |
| `/admin/login` | `src/pages/admin/login.astro` | `(none-detected)` |
| `/admin/menu` | `src/pages/admin/menu.astro` | `(none-detected)` |
| `/admin/reservations` | `src/pages/admin/reservations.astro` | `(none-detected)` |
| `/admin/reset-password` | `src/pages/admin/reset-password.astro` | `(none-detected)` |
| `/admin/sso-error` | `src/pages/admin/sso-error.astro` | `(none-detected)` |
| `/book` | `src/pages/book.astro` | `(none-detected)` |
| `/contact` | `src/pages/contact.astro` | `(none-detected)` |
| `/menu` | `src/pages/menu/index.astro` | `(none-detected)` |
| `/menu/lunch` | `src/pages/menu/lunch.astro` | `(none-detected)` |
| `/privacy` | `src/pages/privacy.astro` | `(none-detected)` |
| `/terms` | `src/pages/terms.astro` | `(none-detected)` |

## API / Server Surface
- No API routes detected by file-system scan.

## Commands
- `npm run dev` -> `astro dev --port 3000`
- `npm run start` -> `astro dev --port 3000`
- `npm run build` -> `astro build`
- `npm run preview` -> `astro preview`
- `npm run astro` -> `astro`
- `npm run backend` -> `node backend/server.js`
- `npm run backend:init` -> `node backend/init-db.js`
- `npm run lint` -> `eslint .`
- `npm run lint:fix` -> `eslint . --fix`
- `npm run test:e2e` -> `playwright test`

## Environment Variables (Detected)
- `ADMIN_API_KEY`
- `DB_PATH`
- `FRONTEND_URL`
- `FRONTEND_URLS`
- `PORT`
- `PUBLIC_ADMIN_HUB_URL`
- `PUBLIC_API_URL`
- `PUBLIC_TINYMCE_API_KEY`
- `RESET_DB`
- `SMTP_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SSO_SECRET`
- `UPLOADS_DIR`

## Skill Shortcuts
- `colorado-home-hero-updates`
- `colorado-vip-form-updates`
- `colorado-menu-system-updates`
- `colorado-events-media-ops`
- `colorado-global-settings-seo`
- `colorado-new-site-additions`
- `colorado-valarie-dev-mode`

## Docs Freshness Checklist
- Verify commands against `package.json` scripts.
- Verify routes against framework route directories (`src/pages`, `app`, `pages`, router files).
- Verify APIs against `src/pages/api`, `app/**/route.*`, `server/`, or `backend/`.
- Verify env vars using `rg "process\.env|import\.meta\.env"`.
- Remove references to paths that do not exist.

Last verified: 2026-03-13
