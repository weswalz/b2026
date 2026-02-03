#!/bin/bash
# Post-deploy script for blvdpark.com
# Run this after deploying to fix 2026 site as root

set -e
WEBROOT="/var/www/blvdpark.com"

echo "Fixing blvdpark.com deployment..."

# Copy 2026 index to root
cp "$WEBROOT/2026/index.html" "$WEBROOT/index.html"

# Fix paths: /2026 -> /, /menu2026 -> /menu, /book2026 -> /book
sed -i 's|/2026|/|g; s|/menu2026|/menu|g; s|/book2026|/book|g' "$WEBROOT/index.html"

# Copy menu2026 and book2026 to proper locations
rm -rf "$WEBROOT/menu" && cp -r "$WEBROOT/menu2026" "$WEBROOT/menu"
rm -rf "$WEBROOT/book" && cp -r "$WEBROOT/book2026" "$WEBROOT/book"

# Fix paths in menu and book
find "$WEBROOT/menu" -name "*.html" -exec sed -i 's|/2026|/|g; s|/menu2026|/menu|g; s|/book2026|/book|g' {} \;
find "$WEBROOT/book" -name "*.html" -exec sed -i 's|/2026|/|g; s|/menu2026|/menu|g; s|/book2026|/book|g' {} \;

# Create GALLERY symlink
ln -sf "$WEBROOT/images/2026GALLERY" "$WEBROOT/images/GALLERY" 2>/dev/null || true

# Remove TikTok links
sed -i 's|<a href="https://tiktok.com/@blvdparkhtx"[^>]*>[^<]*<svg[^>]*>[^<]*<path[^>]*>[^<]*</path>[^<]*</svg>[^<]*</a>||g' "$WEBROOT/index.html"

# Fix broken import statements
perl -i -pe "s/import \{ formatMinutesToTime, parseTimeToMinutes \} from '\.\.\/lib\/time';/function parseTimeToMinutes(t){if(!t)return null;const[h,m]=t.split(\":\").map(Number);return isNaN(h)?null:h*60+(m||0)}function formatMinutesToTime(m,o={}){if(m==null)return\"\";const h=Math.floor(m\/60)%24,mi=m%60,p=h>=12?\"PM\":\"AM\",h12=h%12||12;const t=mi>0?h12+\":\"+String(mi).padStart(2,\"0\")+\" \"+p:h12+\" \"+p;return o.uppercase?t.toUpperCase():t}/g" "$WEBROOT/index.html"

echo "Done! 2026 site is now at root."
