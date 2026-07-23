---
name: blvd-park-deploy
description: Production deployment pipeline for BLVD Park (Astro 5.x + Express backend). 9-phase backup-first workflow with server-newer detection, health checks, and instant rollback. Single-environment deployment — production only, no staging.
---

# BLVD Park Production Deployment System

## CRITICAL: BACKUP-FIRST WORKFLOW (MANDATORY)

**NEVER deploy without a verified backup. ALWAYS follow this sequence:**

### Step 1: Run Deployment Script
```bash
./deploy.sh
```

### Step 2: Review the Output
The script will show:
- Files to upload (frontend + backend)
- Files to be deleted
- Backup status
- Server-newer detection warnings

### Step 3: Confirm Deployment
Type `y` to proceed when prompted, or run with `--yes` flag.

### Step 4: Verify Health Check
Script automatically runs health checks and reports status.

---

## 9-Phase Deployment Pipeline

### PHASE 1: Pre-Flight
- Verifies project root (package.json exists)
- Tests SSH connectivity to `weswalz@69.28.91.132`
- Creates remote source directories if missing

### PHASE 2: Server Backup
- Creates tarball of `/opt/clegroup/sources/blvdpark.com` + `/opt/clegroup/sources/blvdpark-api`
- Excludes: `node_modules`, `.env`
- Downloads to `backups/blvd-backup-YYYYMMDD-HHMMSS.tar.gz`
- Prunes old backups (keeps last 5)

### PHASE 3: Database Backup
- DB lives in Docker volume — uses `docker cp blvdpark-api:/app/database/blvdpark.db`
- Downloads to `backups/db/blvdpark-YYYYMMDD-HHMMSS.db`
- Prunes old DB backups (keeps last 5)

### PHASE 4: Server-Newer Detection
- Compares file timestamps between server and local (backend + frontend)
- Detects hotfixes applied directly on server
- **ABORTS if server files are newer** — diff the file first, sync it locally, then redeploy
- Use `--force-overwrite` only after reviewing what's different

### PHASE 5: File Comparison
- Builds Astro frontend (`PUBLIC_API_URL=https://blvdpark.com npm run build`)
- Runs rsync dry-run to show files to upload/delete
- Prompts for confirmation if deletions pending

### PHASE 6: Schema Check
- No-op for this project (no SQL migrations)

### PHASE 7: Deploy
- rsyncs frontend (`dist/`) → `/opt/clegroup/sources/blvdpark.com/`
- rsyncs backend (`backend/`) → `/opt/clegroup/sources/blvdpark-api/`
  - Excludes: `node_modules/`, `.env`, `database/`, `Dockerfile`, `.dockerignore`
- `docker compose up -d --build` rebuilds and restarts containers

### PHASE 8: Post-Deploy
- Health check via `https://blvdpark.com/api/health` (3 retries, 5s delay)
  - Note: port 3006 is NOT bound to host — health check must go through nginx
- Optional Cloudflare cache purge (reads `CF_API_TOKEN` + `CF_ZONE_ID` from `.env`)
- Reports deployment summary

---

## Server Architecture

```
weswalz@69.28.91.132
/opt/clegroup/
├── docker-compose.yml
├── sources/
│   ├── blvdpark.com/          # Astro static frontend build (dist/)
│   └── blvdpark-api/          # Express API source
└── nginx-conf.d/
    └── blvdpark.conf          # Proxies /api/ and /uploads/ to container

Docker containers:
  blvdpark-frontend  (port 80, internal)   — nginx serves static files
  blvdpark-api       (port 3006, internal) — Express + SQLite
  nginx-clegroup     (0.0.0.0:80/443)      — reverse proxy with SSL

Docker volumes:
  clegroup_blvdpark-api-db      → /app/database  (SQLite)
  clegroup_blvdpark-uploads     → /app/uploads   (uploaded images)
```

---

## NEVER DO THESE THINGS

1. **NEVER deploy without running `./deploy.sh` first**
2. **NEVER skip the pre-flight checks**
3. **NEVER use `--force-overwrite` without diffing the server-newer file first**
4. **NEVER modify files directly on the server** (breaks server-newer detection)
5. **NEVER run deployment during high-traffic hours** (unless critical fix)
6. **NEVER copy local database to production** — production data is authoritative
7. **NEVER deploy with a stale package-lock.json** — if package.json changed server-side, pull the lock file, run `npm install --package-lock-only` locally, then deploy

---

## Deployment Commands

### Standard Deployment
```bash
./deploy.sh
```

### Backend Only (no frontend build)
```bash
./deploy.sh --backend-only --yes
```

### Frontend Only
```bash
./deploy.sh --frontend-only --yes
```

### Skip Build (use existing dist/)
```bash
./deploy.sh --skip-build
```

### Skip Confirmation Prompts
```bash
./deploy.sh --yes
```

### Force Overwrite (ignore server-newer warnings)
```bash
./deploy.sh --force-overwrite
```

### Dry Run (preview changes only)
```bash
./deploy.sh --dry-run
```

### Instant Rollback
```bash
./deploy.sh --rollback
```

---

## Server-Newer Detection Triggered

When the deploy aborts with "server files are newer":

```bash
# 1. Pull and inspect the server file
scp weswalz@69.28.91.132:/opt/clegroup/sources/blvdpark-api/FILENAME ./tmp-server-file

# 2. Diff it against local
diff backend/FILENAME ./tmp-server-file

# 3a. If server changes should be kept — sync them locally first, then deploy normally
# 3b. If local changes should win — deploy with --force-overwrite
./deploy.sh --backend-only --force-overwrite --yes
```

---

## Rollback Procedure

### Automatic Rollback
```bash
./deploy.sh --rollback
```
- Restores from latest `backups/blvd-backup-*.tar.gz`
- Stops containers, extracts backup, rebuilds and restarts via docker compose
- Runs health check

### Manual Rollback
```bash
ssh weswalz@69.28.91.132

cd /opt/clegroup
sudo docker compose stop blvdpark-api blvdpark-frontend

# Restore source dirs from backup
sudo tar -xzf /path/to/backup.tar.gz -C /

# Rebuild and restart
sudo docker compose up -d --build blvdpark-api blvdpark-frontend
```

---

## Smoke Tests After Deploy

```bash
# Health endpoint
curl -s https://blvdpark.com/api/health

# Homepage
curl -s -o /dev/null -w "%{http_code}" https://blvdpark.com/

# Check container status
ssh weswalz@69.28.91.132 "sudo docker ps --format 'table {{.Names}}\t{{.Status}}'"

# Check container logs
ssh weswalz@69.28.91.132 "sudo docker logs blvdpark-api --tail 30"
```

---

## Troubleshooting

### Deploy Failed — Container Won't Start
```bash
ssh weswalz@69.28.91.132 "sudo docker logs blvdpark-api --tail 50"
ssh weswalz@69.28.91.132 "sudo docker inspect blvdpark-api --format '{{json .State.Health}}'"
```

### package-lock.json Out of Sync (npm ci fails in Docker)
```bash
# Pull server's package.json, merge changes locally, regenerate lock
scp weswalz@69.28.91.132:/opt/clegroup/sources/blvdpark-api/package.json /tmp/server-pkg.json
diff backend/package.json /tmp/server-pkg.json
# Manually merge any server-side changes into backend/package.json
cd backend && npm install --package-lock-only
# Force push updated lock file
scp backend/package-lock.json weswalz@69.28.91.132:/opt/clegroup/sources/blvdpark-api/package-lock.json
# Rebuild container
ssh weswalz@69.28.91.132 "cd /opt/clegroup && sudo docker compose up -d --build blvdpark-api"
```

### Rollback Required
```bash
./deploy.sh --rollback
```

### 502/503 Errors
```bash
ssh weswalz@69.28.91.132 "sudo docker ps"
ssh weswalz@69.28.91.132 "cd /opt/clegroup && sudo docker compose restart blvdpark-api"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `deploy.sh` | Main deployment script (9 phases) |
| `backups/` | Local backup storage |
| `dist/` | Built Astro frontend |
| `backend/` | Express API source |
| `.env` | Environment variables (not deployed) |

---

## Environment Variables

Required in `.env` for Cloudflare cache purge:

```bash
CF_API_TOKEN=your-cloudflare-api-token
CF_ZONE_ID=your-cloudflare-zone-id
```
