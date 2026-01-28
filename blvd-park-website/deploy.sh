#!/bin/bash

# BLVD Park Deployment Script
# Uploads built Astro site to production server

echo "🚀 Starting BLVD Park deployment..."

# 1. Make sure we're in the project root
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from project root directory"
  exit 1
fi

# 2. Build the production version of the site
echo "🔨 Building Astro project..."
npm run build

if [ ! -d "dist" ]; then
  echo "❌ Error: Build failed — 'dist' directory not found"
  exit 1
fi

# 3. Define the target server and directory
SERVER="root@104.219.54.169"
TARGET_DIR="/var/www/blvdpark.com"

# 4. Upload the built files to the server
echo "📦 Uploading files to ${SERVER}:${TARGET_DIR}..."
ssh ${SERVER} "mkdir -p ${TARGET_DIR}"

rsync -avz --delete dist/ ${SERVER}:${TARGET_DIR}/

# 5. Verify deployment
echo "🔍 Verifying remote index.html exists..."
if ssh ${SERVER} "[ -f ${TARGET_DIR}/index.html ]"; then
  echo "✅ Deployment completed successfully!"
else
  echo "❌ Deployment failed — index.html not found on server"
  exit 1
fi

echo "🌐 Site deployed at https://blvdpark.com"
