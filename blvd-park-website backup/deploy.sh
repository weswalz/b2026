#!/bin/bash

# BLVD Park Deployment Script
# Uploads built website files to production server

echo "Starting BLVD Park deployment process..."

# 1. Make sure we're in the project root
if [ ! -f "package.json" ]; then
  echo "Error: Must run from project root directory"
  exit 1
fi

# 2. Build the production version of the site
echo "Building production version..."
npm run build

if [ ! -d "dist" ]; then
  echo "Error: Build failed or dist directory not found"
  exit 1
fi

# 3. Create a temporary directory for rsync exclusions
echo "Preparing deployment files..."
mkdir -p .deploy_tmp

# 4. Define the target server and directory
SERVER="root@104.219.54.169"
TARGET_DIR="/var/www/blvdpark.com"

# 5. Upload the built files to the server
echo "Uploading files to ${SERVER}:${TARGET_DIR}..."

# First ensure the target directory exists
ssh ${SERVER} "mkdir -p ${TARGET_DIR}"

# Use rsync to upload only the necessary files
# -a: archive mode (preserves permissions, etc.)
# -v: verbose output
# -z: compression for transfer
# --delete: remove files on server that aren't in local build
rsync -avz --delete dist/ ${SERVER}:${TARGET_DIR}/

# 6. Verify the deployment
echo "Verifying deployment..."
if ssh ${SERVER} "[ -f ${TARGET_DIR}/index.html ]"; then
  echo "✅ Deployment completed successfully!"
else
  echo "❌ Deployment verification failed! Check server logs."
  exit 1
fi

# 7. Purge CloudFlare cache to ensure latest version is served
echo "Purging CloudFlare cache..."

# You need to set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID as environment variables
# or uncomment and set them here (not recommended for security)
# CLOUDFLARE_API_TOKEN="your_api_token"
# CLOUDFLARE_ZONE_ID="your_zone_id"

if [ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ZONE_ID" ]; then
  # Purge everything in the zone
  curl -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' \
    --silent | grep -q '"success":true' && echo "CloudFlare cache purged successfully!" || echo "Failed to purge CloudFlare cache"
else
  echo "⚠️ CloudFlare cache purge skipped: Missing API token or Zone ID"
  echo "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID environment variables to enable cache purging"
fi

# 8. Clean up
rm -rf .deploy_tmp

echo "BLVD Park website has been deployed to ${SERVER}:${TARGET_DIR}"
echo "Visit https://blvdpark.com to see your site live" 