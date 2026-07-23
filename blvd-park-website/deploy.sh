#!/bin/bash

# BLVD Park — Docker Production Deployment Script
# 9-phase pipeline: preflight, backup, db backup, server-newer, compare, schema, deploy, post-deploy, rollback
# Astro SSG frontend + Express backend (Docker Compose)

set -euo pipefail

# ============================================
# CONFIGURATION
# ============================================
SERVER="weswalz@69.28.91.132"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10"
DOCKER_DIR="/opt/clegroup"
FRONTEND_REMOTE="${DOCKER_DIR}/sources/blvdpark.com"
BACKEND_REMOTE="${DOCKER_DIR}/sources/blvdpark-api"
CONTAINER_API="blvdpark-api"
CONTAINER_FRONTEND="blvdpark-frontend"
HEALTH_URL="https://blvdpark.com/api/health"
SITE_URL="https://blvdpark.com"
LOCAL_BACKUP_DIR="backups"
LOCAL_DB_BACKUP_DIR="backups/db"
MAX_BACKUPS=5
HEALTH_RETRIES=3
HEALTH_DELAY=5
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# ============================================
# FLAGS
# ============================================
FLAG_ROLLBACK=false
FLAG_SKIP_BUILD=false
FLAG_SKIP_SCHEMA=false
FLAG_INIT_DB=false
FLAG_DRY_RUN=false
FLAG_YES=false
FLAG_FORCE_OVERWRITE=false
FLAG_FRONTEND_ONLY=false
FLAG_BACKEND_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --rollback)         FLAG_ROLLBACK=true ;;
    --skip-build)       FLAG_SKIP_BUILD=true ;;
    --skip-schema)      FLAG_SKIP_SCHEMA=true ;;
    --init-db)          FLAG_INIT_DB=true ;;
    --dry-run)          FLAG_DRY_RUN=true ;;
    --yes)              FLAG_YES=true ;;
    --force-overwrite)  FLAG_FORCE_OVERWRITE=true ;;
    --frontend-only)    FLAG_FRONTEND_ONLY=true ;;
    --backend-only)     FLAG_BACKEND_ONLY=true ;;
    --help)
      echo "Usage: ./deploy.sh [flags]"
      echo ""
      echo "Flags:"
      echo "  --rollback          Restore from most recent backup"
      echo "  --skip-build        Skip npm run build (use existing dist/)"
      echo "  --skip-schema       Skip schema check phase"
      echo "  --init-db           Initialize database on server via init-db.js"
      echo "  --dry-run           Show file changes without deploying"
      echo "  --yes               Skip confirmation prompts"
      echo "  --force-overwrite   Overwrite server files even if server copy is newer"
      echo "  --frontend-only     Deploy only the frontend (dist/)"
      echo "  --backend-only      Deploy only the backend (backend/)"
      echo "  --help              Show this help"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (use --help for usage)"
      exit 1
      ;;
  esac
done

if [ "$FLAG_FRONTEND_ONLY" = true ] && [ "$FLAG_BACKEND_ONLY" = true ]; then
  err "Cannot use --frontend-only and --backend-only together"
fi

# ============================================
# UTILITY FUNCTIONS
# ============================================
log() { echo "[deploy] $1"; }
warn() { echo "[deploy] WARNING: $1"; }
err() { echo "[deploy] ERROR: $1" >&2; exit 1; }

confirm() {
  if [ "$FLAG_YES" = true ]; then return 0; fi
  read -r -p "[deploy] $1 [y/N]: " response
  case "$response" in
    [yY][eE][sS]|[yY]) return 0 ;;
    *) return 1 ;;
  esac
}

ssh_cmd() {
  ssh $SSH_OPTS "$SERVER" "$@"
}

prune_backups() {
  local dir="$1"
  local pattern="$2"
  local keep="$3"
  local count
  count=$(find "$dir" -maxdepth 1 -name "$pattern" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -gt "$keep" ]; then
    local to_remove=$((count - keep))
    log "Pruning $to_remove old backup(s) from $dir"
    find "$dir" -maxdepth 1 -name "$pattern" -print0 | \
      xargs -0 ls -t | tail -n "$to_remove" | xargs rm -f
  fi
}

# ============================================
# PHASE 9: ROLLBACK (early exit)
# ============================================
if [ "$FLAG_ROLLBACK" = true ]; then
  log "=== ROLLBACK MODE ==="

  if [ ! -d "$LOCAL_BACKUP_DIR" ]; then
    err "No backups/ directory found"
  fi

  LATEST_BACKUP=$(find "$LOCAL_BACKUP_DIR" -maxdepth 1 -name "blvd-backup-*.tar.gz" -print0 | \
    xargs -0 ls -t 2>/dev/null | head -n 1)

  if [ -z "$LATEST_BACKUP" ]; then
    err "No backup tarballs found in $LOCAL_BACKUP_DIR/"
  fi

  log "Found backup: $LATEST_BACKUP"
  confirm "Restore this backup to production? This will overwrite current server state." || exit 0

  # Upload backup to server
  log "Uploading backup to server..."
  scp $SSH_OPTS "$LATEST_BACKUP" "${SERVER}:/tmp/blvd-rollback.tar.gz"

  # Stop containers, extract, rebuild
  log "Restoring on server..."
  ssh_cmd bash -s << 'ENDSSH'
    set -e

    # Stop containers
    cd /opt/clegroup
    sudo docker compose stop blvdpark-api blvdpark-frontend

    # Extract backup (restores frontend and backend source)
    sudo tar -xzf /tmp/blvd-rollback.tar.gz -C /

    # Clean up tarball
    sudo rm -f /tmp/blvd-rollback.tar.gz || rm -f /tmp/blvd-rollback.tar.gz || true

    # Rebuild and restart containers
    sudo docker compose up -d --build blvdpark-api blvdpark-frontend
ENDSSH

  # Health check
  log "Running health check..."
  sleep "$HEALTH_DELAY"
  HTTP_CODE=$(ssh_cmd "curl -s -o /dev/null -w '%{http_code}' $HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log "Health check passed -- rollback complete"
  else
    warn "Health check returned $HTTP_CODE after rollback -- check server manually"
  fi

  exit 0
fi

# ============================================
# PHASE 1: PRE-FLIGHT
# ============================================
log "=== PHASE 1: Pre-flight checks ==="

# Verify project root
if [ ! -f "package.json" ]; then
  err "Must run from project root (package.json not found)"
fi

# Test SSH connectivity
log "Testing SSH connection..."
if ! ssh_cmd "echo ok" > /dev/null 2>&1; then
  err "Cannot connect to $SERVER -- check SSH config"
fi

# Verify server directories
log "Verifying server directories..."
ssh_cmd "sudo mkdir -p $FRONTEND_REMOTE $BACKEND_REMOTE"

# Create local backup directories
mkdir -p "$LOCAL_BACKUP_DIR" "$LOCAL_DB_BACKUP_DIR"

log "Pre-flight passed"

# ============================================
# PHASE 2: SERVER BACKUP
# ============================================
log "=== PHASE 2: Server backup ==="

BACKUP_NAME="blvd-backup-${TIMESTAMP}.tar.gz"
REMOTE_BACKUP="/tmp/${BACKUP_NAME}"

log "Creating server backup tarball..."
ssh_cmd "sudo tar -czf $REMOTE_BACKUP \
  -C / \
  opt/clegroup/sources/blvdpark.com \
  opt/clegroup/sources/blvdpark-api 2>/dev/null" || {
  warn "Server backup failed (first deploy or empty dirs) -- continuing"
  REMOTE_BACKUP=""
}

if [ -n "$REMOTE_BACKUP" ]; then
  log "Downloading backup to $LOCAL_BACKUP_DIR/$BACKUP_NAME..."
  scp $SSH_OPTS "${SERVER}:${REMOTE_BACKUP}" "$LOCAL_BACKUP_DIR/$BACKUP_NAME"
  # Backup tarball is created with sudo (root-owned), so cleanup must use sudo too.
  # Don't fail the deploy if cleanup fails for any reason.
  ssh_cmd "sudo rm -f $REMOTE_BACKUP || rm -f $REMOTE_BACKUP || true"
  prune_backups "$LOCAL_BACKUP_DIR" "blvd-backup-*.tar.gz" "$MAX_BACKUPS"
  log "Server backup saved"
else
  log "Skipped backup (nothing to back up)"
fi

# ============================================
# PHASE 3: DATABASE BACKUP
# ============================================
log "=== PHASE 3: Database backup ==="

# Database is in Docker volume, use docker cp
if [ "$FLAG_FRONTEND_ONLY" = true ]; then
  log "Frontend-only deploy -- skipping DB backup"
  DB_EXISTS="no"
else
DB_EXISTS=$(ssh_cmd "docker exec $CONTAINER_API test -f /app/database/blvdpark.db && echo yes || echo no")
fi

if [ "$DB_EXISTS" = "yes" ]; then
  DB_BACKUP_NAME="blvdpark-${TIMESTAMP}.db"
  log "Downloading database to $LOCAL_DB_BACKUP_DIR/$DB_BACKUP_NAME..."
  ssh_cmd "docker cp ${CONTAINER_API}:/app/database/blvdpark.db /tmp/blvdpark.db"
  scp $SSH_OPTS "${SERVER}:/tmp/blvdpark.db" "$LOCAL_DB_BACKUP_DIR/$DB_BACKUP_NAME"
  ssh_cmd "rm -f /tmp/blvdpark.db"
  prune_backups "$LOCAL_DB_BACKUP_DIR" "blvdpark-*.db" "$MAX_BACKUPS"
  log "Database backup saved"
else
  log "No database on server yet -- skipping DB backup"
fi

# ============================================
# PHASE 4: SERVER-NEWER DETECTION
# ============================================
log "=== PHASE 4: Server-newer detection ==="

# Get remote file timestamps from backend (excluding protected paths)
REMOTE_TIMES=""
if [ "$FLAG_FRONTEND_ONLY" = false ]; then
  REMOTE_TIMES=$(ssh_cmd "find $BACKEND_REMOTE \
    -not -path '*/node_modules/*' \
    -not -path '*/database/*' \
    -not -name '.env' \
    -not -name 'Dockerfile' \
    -type f -printf '%T@ %P\n' 2>/dev/null" || echo "")
fi

SERVER_NEWER=""
if [ -n "$REMOTE_TIMES" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    REMOTE_EPOCH=$(echo "$line" | awk '{print $1}' | cut -d. -f1)
    REMOTE_FILE=$(echo "$line" | awk '{$1=""; print substr($0,2)}')

    LOCAL_FILE="backend/$REMOTE_FILE"
    if [ -f "$LOCAL_FILE" ]; then
      LOCAL_EPOCH=$(stat -f '%m' "$LOCAL_FILE" 2>/dev/null || echo "0")
      if [ "$REMOTE_EPOCH" -gt "$LOCAL_EPOCH" ]; then
        SERVER_NEWER="${SERVER_NEWER}  ${REMOTE_FILE}\n"
      fi
    fi
  done <<< "$REMOTE_TIMES"
fi

# Also check frontend files
REMOTE_FRONT_TIMES=""
if [ "$FLAG_BACKEND_ONLY" = false ]; then
  REMOTE_FRONT_TIMES=$(ssh_cmd "find $FRONTEND_REMOTE \
    -not -name 'Dockerfile' \
    -type f -printf '%T@ %P\n' 2>/dev/null" || echo "")
fi

if [ -n "$REMOTE_FRONT_TIMES" ] && [ -d "dist" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    REMOTE_EPOCH=$(echo "$line" | awk '{print $1}' | cut -d. -f1)
    REMOTE_FILE=$(echo "$line" | awk '{$1=""; print substr($0,2)}')

    LOCAL_FILE="dist/$REMOTE_FILE"
    if [ -f "$LOCAL_FILE" ]; then
      LOCAL_EPOCH=$(stat -f '%m' "$LOCAL_FILE" 2>/dev/null || echo "0")
      if [ "$REMOTE_EPOCH" -gt "$LOCAL_EPOCH" ]; then
        SERVER_NEWER="${SERVER_NEWER}  (frontend) ${REMOTE_FILE}\n"
      fi
    fi
  done <<< "$REMOTE_FRONT_TIMES"
fi

if [ -n "$SERVER_NEWER" ]; then
  echo ""
  warn "The following files are NEWER on the server than your local copy:"
  echo -e "$SERVER_NEWER"
  warn "Someone may have applied a hotfix directly on the server."
  warn "Deploying will OVERWRITE these files."
  echo ""

  if [ "$FLAG_FORCE_OVERWRITE" = true ]; then
    warn "--force-overwrite set -- proceeding anyway"
  elif [ "$FLAG_DRY_RUN" = true ]; then
    warn "Dry-run mode -- no changes will be made"
  else
    err "Aborting to protect server changes. Pull changes first, or re-run with --force-overwrite"
  fi
else
  log "No server-newer files detected"
fi

# ============================================
# PHASE 5: FILE COMPARISON
# ============================================
log "=== PHASE 5: File comparison ==="

# Build frontend unless skipped
if [ "$FLAG_BACKEND_ONLY" = false ]; then
  if [ "$FLAG_SKIP_BUILD" = false ]; then
    log "Building Astro frontend..."
    PUBLIC_API_URL=https://blvdpark.com npm run build
    if [ ! -d "dist" ]; then
      err "Build failed -- dist/ directory not found"
    fi
    log "Build complete"
  else
    log "Skipping build (--skip-build)"
    if [ ! -d "dist" ]; then
      err "No dist/ directory and --skip-build was set"
    fi
  fi
else
  log "Backend-only deploy -- skipping frontend build"
fi

# Frontend dry-run comparison
FRONTEND_RSYNC=""
FRONT_UPLOAD=0
FRONT_DELETE=0
if [ "$FLAG_BACKEND_ONLY" = false ]; then
  log "Comparing frontend (dist/ -> $FRONTEND_REMOTE/)..."
  FRONTEND_RSYNC=$(rsync -avz --checksum --delete --dry-run -i \
    -e "ssh $SSH_OPTS" \
    --exclude '.DS_Store' \
    --exclude 'Dockerfile' \
    --exclude '.dockerignore' \
    dist/ \
    ${SERVER}:${FRONTEND_REMOTE}/ 2>&1 || true)

  FRONT_UPLOAD=$(echo "$FRONTEND_RSYNC" | grep -c '^>f' || true)
  FRONT_DELETE=$(echo "$FRONTEND_RSYNC" | grep -c '^\*deleting' || true)

  log "Frontend -- files to upload: $FRONT_UPLOAD, files to delete: $FRONT_DELETE"
else
  log "Backend-only deploy -- skipping frontend compare"
fi

# Backend dry-run comparison
BACKEND_RSYNC=""
BACK_UPLOAD=0
BACK_DELETE=0
if [ "$FLAG_FRONTEND_ONLY" = false ]; then
  log "Comparing backend (backend/ -> $BACKEND_REMOTE/)..."
  BACKEND_RSYNC=$(rsync -avz --dry-run -i \
    -e "ssh $SSH_OPTS" \
    --exclude 'node_modules/' \
    --exclude '.env' \
    --exclude 'database/' \
    --exclude '.DS_Store' \
    --exclude 'Dockerfile' \
    --exclude '.dockerignore' \
    backend/ \
    ${SERVER}:${BACKEND_REMOTE}/ 2>&1 || true)

  BACK_UPLOAD=$(echo "$BACKEND_RSYNC" | grep -c '^>f' || true)
  BACK_DELETE=$(echo "$BACKEND_RSYNC" | grep -c '^\*deleting' || true)

  log "Backend  -- files to upload: $BACK_UPLOAD, files to delete: $BACK_DELETE"
else
  log "Frontend-only deploy -- skipping backend compare"
fi

# Warn about deletions
TOTAL_DELETE=$((FRONT_DELETE + BACK_DELETE))
if [ "$TOTAL_DELETE" -gt 0 ]; then
  echo ""
  echo "Files that will be DELETED from server:"
  echo "$FRONTEND_RSYNC" | grep '^\*deleting' | sed 's/^\*deleting   /  (frontend) /' || true
  echo "$BACKEND_RSYNC" | grep '^\*deleting' | sed 's/^\*deleting   /  (backend)  /' || true
  echo ""
  if [ "$FLAG_DRY_RUN" = false ]; then
    confirm "Proceed with these deletions?" || err "Aborted by user"
  fi
fi

# Dry-run exit
if [ "$FLAG_DRY_RUN" = true ]; then
  log "=== DRY RUN COMPLETE ==="
  echo ""
  echo "Frontend changes:"
  echo "$FRONTEND_RSYNC" | grep -E '^(>f|<f|\*deleting|cd)' | head -50 || echo "  (none)"
  echo ""
  echo "Backend changes:"
  echo "$BACKEND_RSYNC" | grep -E '^(>f|<f|\*deleting|cd)' | head -50 || echo "  (none)"
  echo ""
  log "No changes were made. Remove --dry-run to deploy."
  exit 0
fi

# ============================================
# PHASE 6: SCHEMA CHECK
# ============================================
log "=== PHASE 6: Schema check ==="
log "No SQL schema management for this project -- skipping"

# ============================================
# PHASE 7: DEPLOY
# ============================================
log "=== PHASE 7: Deploy ==="

# Deploy frontend
if [ "$FLAG_BACKEND_ONLY" = false ]; then
  log "Deploying frontend (dist/ -> $FRONTEND_REMOTE/)..."
  rsync -avz --checksum --delete \
    -e "ssh $SSH_OPTS" \
    --exclude '.DS_Store' \
    --exclude 'Dockerfile' \
    --exclude '.dockerignore' \
    dist/ \
    ${SERVER}:${FRONTEND_REMOTE}/
else
  log "Backend-only deploy -- skipping frontend rsync"
fi

# Deploy backend
if [ "$FLAG_FRONTEND_ONLY" = false ]; then
  log "Deploying backend (backend/ -> $BACKEND_REMOTE/)..."
  rsync -avz \
    -e "ssh $SSH_OPTS" \
    --exclude 'node_modules/' \
    --exclude '.env' \
    --exclude 'database/' \
    --exclude '.DS_Store' \
    --exclude 'Dockerfile' \
    --exclude '.dockerignore' \
    backend/ \
    ${SERVER}:${BACKEND_REMOTE}/
else
  log "Frontend-only deploy -- skipping backend rsync"
fi

# Rebuild and restart Docker containers
log "Rebuilding and restarting Docker containers..."
ssh_cmd bash -s << ENDSSH
  set -e
  cd /opt/clegroup

  # Rebuild and restart containers
  if [ "$FLAG_FRONTEND_ONLY" = "true" ]; then
    sudo docker compose up -d --build blvdpark-frontend
  elif [ "$FLAG_BACKEND_ONLY" = "true" ]; then
    sudo docker compose up -d --build blvdpark-api
  else
    sudo docker compose up -d --build blvdpark-api blvdpark-frontend
  fi

  # Restart nginx so it picks up new container IPs
  sudo docker restart nginx-clegroup
ENDSSH

log "Deploy complete"

# ============================================
# PHASE 8: POST-DEPLOY
# ============================================
log "=== PHASE 8: Post-deploy ==="

# Health check with retries
HEALTH_OK=false
for i in $(seq 1 $HEALTH_RETRIES); do
  sleep "$HEALTH_DELAY"
  HTTP_CODE=$(ssh_cmd "curl -s -o /dev/null -w '%{http_code}' $HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    HEALTH_OK=true
    break
  fi
  warn "Health check attempt $i/$HEALTH_RETRIES returned $HTTP_CODE"
done

if [ "$HEALTH_OK" = true ]; then
  log "Health check passed (HTTP 200)"
else
  warn "Health check FAILED after $HEALTH_RETRIES attempts"
  warn "Run './deploy.sh --rollback' to restore previous version"
fi

# Cloudflare cache purge
if [ -f .env ]; then
  set +u
  export $(grep -v '^#' .env | xargs) 2>/dev/null || true
  set -u
fi

set +u
if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ] && [[ ! "${CF_API_TOKEN}" =~ ^your_ ]]; then
  log "Purging Cloudflare cache..."
  PURGE_RESULT=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}')

  if echo "$PURGE_RESULT" | grep -q '"success":true'; then
    log "Cloudflare cache purged"
  else
    warn "Cloudflare cache purge may have failed"
  fi
else
  log "Cloudflare credentials not found in .env -- skipping cache purge"
fi
set -u

# Deploy summary
echo ""
echo "============================================"
echo "  BLVD PARK DEPLOY SUMMARY"
echo "============================================"
echo "  Timestamp:    $TIMESTAMP"
if [ -n "${BACKUP_NAME:-}" ] && [ -f "$LOCAL_BACKUP_DIR/$BACKUP_NAME" ]; then
  echo "  Backup:       $LOCAL_BACKUP_DIR/$BACKUP_NAME"
fi
if [ -n "${DB_BACKUP_NAME:-}" ] && [ -f "$LOCAL_DB_BACKUP_DIR/$DB_BACKUP_NAME" ]; then
  echo "  DB Backup:    $LOCAL_DB_BACKUP_DIR/$DB_BACKUP_NAME"
fi
echo "  Frontend:     $FRONT_UPLOAD file(s) uploaded, $FRONT_DELETE deleted"
echo "  Backend:      $BACK_UPLOAD file(s) uploaded"
echo "  Health:       $([ "$HEALTH_OK" = true ] && echo "PASSED" || echo "FAILED")"
echo "  Site:         $SITE_URL"
echo "  API:          $SITE_URL/api/health"
echo "============================================"
echo ""

if [ "$HEALTH_OK" = true ]; then
  log "Deployment successful"
else
  warn "Deployment completed but health check failed -- investigate immediately"
  exit 1
fi
