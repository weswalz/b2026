#!/bin/bash

# Astro + Sanity Setup Script with schema integration
# Based on official docs: https://docs.astro.build/

set -e

echo "🚀 Creating Astro project with Sanity..."

# Create Astro project with React and Tailwind
echo "📦 Setting up Astro project..."
npm create astro@latest ./astro -- --template=basics --yes --install --no-git

# Add React and Tailwind
cd ./astro
echo "🧩 Adding React and Tailwind..."
npx astro add react tailwind --yes

# Install Sanity client and other dependencies
echo "🔌 Installing Sanity client and dependencies..."
npm install @sanity/client @sanity/image-url groq node-fetch@3.3.2

# Return to root
cd ..

# Create Sanity Studio
echo "🎬 Setting up Sanity Studio..."
mkdir -p studio

# Create package.json
cat > studio/package.json << EOF
{
  "name": "sanity-studio",
  "private": true,
  "version": "1.0.0",
  "main": "package.json",
  "license": "UNLICENSED",
  "scripts": {
    "dev": "sanity dev",
    "start": "sanity start",
    "build": "sanity build",
    "deploy": "sanity deploy"
  }
}
EOF

# Install Sanity dependencies
cd studio
echo "📚 Installing Sanity dependencies..."
npm install sanity@latest @sanity/vision styled-components react react-dom

# Get Sanity Project ID
echo ""
echo "ℹ️  You'll need your Sanity Project ID and dataset name."
echo "   Find these at https://www.sanity.io/manage"
echo ""
read -p "Enter your Sanity Project ID: " SANITY_PROJECT_ID
read -p "Enter your dataset name (default: production): " SANITY_DATASET
SANITY_DATASET=${SANITY_DATASET:-production}

# Create schema directory
mkdir -p schemaTypes

# Clone schemas from GitHub repository
echo "📥 Cloning schemas from GitHub repository..."
TEMP_DIR=$(mktemp -d)
git clone https://github.com/weswalz/sanity-schemas.git "$TEMP_DIR"

# Copy schemas to the studio directory
if [ -d "$TEMP_DIR/schemas" ]; then
  echo "✅ Found schemas in schemas directory"
  cp -r "$TEMP_DIR/schemas"/* schemaTypes/
elif [ -d "$TEMP_DIR/schema" ]; then
  echo "✅ Found schemas in schema directory"
  cp -r "$TEMP_DIR/schema"/* schemaTypes/
elif [ -d "$TEMP_DIR/schemaTypes" ]; then
  echo "✅ Found schemas in schemaTypes directory"
  cp -r "$TEMP_DIR/schemaTypes"/* schemaTypes/
else
  echo "✅ Looking for schema files in repository root"
  find "$TEMP_DIR" -maxdepth 1 -name "*.js" -o -name "*.ts" -exec cp {} schemaTypes/ \;
fi

echo "✅ Schemas copied to studio/schemaTypes directory."

# Check if sitesettings.ts exists and update favicon description to include the generator link
echo "🔄 Checking for sitesettings schema to update favicon generator reference..."
if [ -f "schemaTypes/sitesettings.ts" ]; then
  echo "✅ Found sitesettings.ts, updating favicon description..."
  # Use sed to update the description to include the favicon generator link as plain text
  sed -i '' 's/description: .Upload a complete favicon package for your website.,/description: .Upload a complete favicon package for your website. Generate one at: https:\/\/realfavicongenerator.net.,/g' schemaTypes/sitesettings.ts || true
  echo "✅ Updated favicon description with generator link"
fi

# Create the object type schemas that are referenced by documents
echo "📄 Ensuring required object schemas exist..."

# Create slide.js if it doesn't exist
if [ ! -f "schemaTypes/slide.js" ]; then
  cat > schemaTypes/slide.js << EOF
export default {
  name: 'slide',
  title: 'Slide',
  type: 'object',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text',
    },
    {
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true
      }
    }
  ]
}
EOF
  echo "✅ Created slide.js schema"
fi

# Create menuSection.js if it doesn't exist
if [ ! -f "schemaTypes/menuSection.js" ]; then
  cat > schemaTypes/menuSection.js << EOF
export default {
  name: 'menuSection',
  title: 'Menu Section',
  type: 'object',
  fields: [
    {
      name: 'title',
      title: 'Section Title',
      type: 'string',
    },
    {
      name: 'description',
      title: 'Section Description',
      type: 'text',
    },
    {
      name: 'items',
      title: 'Menu Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'name',
              title: 'Item Name',
              type: 'string',
            },
            {
              name: 'description',
              title: 'Item Description',
              type: 'text',
            },
            {
              name: 'price',
              title: 'Price',
              type: 'string',
            }
          ]
        }
      ]
    }
  ]
}
EOF
  echo "✅ Created menuSection.js schema"
fi

# Clean up temporary directory
rm -rf "$TEMP_DIR"

# Create index.js file with proper ordering of schemas
echo "📑 Generating schema index file..."
cat > schemaTypes/index.js << EOF
// This file imports all schema files from this directory

// Import object schemas first (dependencies)
import slide from './slide'
import menuSection from './menuSection'

// Find and import all other schemas
EOF

# Find all schema files except slide.js, menuSection.js, and index.js
SCHEMA_FILES=$(find schemaTypes -maxdepth 1 -type f -name "*.js" -o -name "*.ts" | grep -v "index.js" | grep -v "index.ts" | grep -v "slide.js" | grep -v "menuSection.js")

# Add imports for all other schemas
for SCHEMA_FILE in $SCHEMA_FILES; do
  FILENAME=$(basename "$SCHEMA_FILE")
  SCHEMA_NAME="${FILENAME%.*}"
  echo "import $SCHEMA_NAME from './$SCHEMA_NAME'" >> schemaTypes/index.js
done

# Generate exports with correct ordering
cat >> schemaTypes/index.js << EOF

// Export all schemas, with object types first
export const schemaTypes = [
  // Object schemas first
  slide,
  menuSection,
  
  // Then document schemas
EOF

# Add all other schemas to the export
for SCHEMA_FILE in $SCHEMA_FILES; do
  FILENAME=$(basename "$SCHEMA_FILE")
  SCHEMA_NAME="${FILENAME%.*}"
  echo "  $SCHEMA_NAME," >> schemaTypes/index.js
done

# Close the export array
echo "]" >> schemaTypes/index.js

# Create custom desk structure to exclude any unwanted document types
echo "🛠️  Creating custom desk structure..."
cat > deskStructure.js << EOF
import {structureTool} from 'sanity/structure'

export default (S) =>
  S.list()
    .title('Content')
    .items([
      // Simply show all document types
      ...S.documentTypeListItems()
    ])
EOF

# Create Sanity config with the custom desk structure
cat > sanity.config.js << EOF
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import deskStructure from './deskStructure'

export default defineConfig({
  name: 'default',
  title: 'Astro Sanity Studio',
  projectId: '${SANITY_PROJECT_ID}',
  dataset: '${SANITY_DATASET}',
  plugins: [
    structureTool({
      structure: deskStructure
    }),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
})
EOF

# Create CLI config
cat > sanity.cli.js << EOF
import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '${SANITY_PROJECT_ID}',
    dataset: '${SANITY_DATASET}',
  },
})
EOF

# Create .env with Sanity credentials
cd ../astro
cat > .env << EOF
PUBLIC_SANITY_PROJECT_ID=${SANITY_PROJECT_ID}
PUBLIC_SANITY_DATASET=${SANITY_DATASET}
EOF

# Create Sanity client file with file URL helper
mkdir -p src/lib/sanity
cat > src/lib/sanity/client.js << EOF
import {createClient} from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'

export const client = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET,
  apiVersion: '$(date +"%Y-%m-%d")',
  useCdn: true,
})

// Helper for images
const builder = imageUrlBuilder(client)
export function urlFor(source) {
  return builder.image(source)
}

// Helper for file assets
export function fileUrlFor(fileRef) {
  if (!fileRef || !fileRef.asset || !fileRef.asset._ref) {
    return null
  }
  
  // Extract parts from the asset reference
  const [_file, id, extension] = fileRef.asset._ref.split('-')
  
  // Construct the file URL
  return \`https://cdn.sanity.io/files/\${client.config().projectId}/\${client.config().dataset}/\${id}.\${extension}\`
}
EOF

# Create favicon fetching script
cat > src/lib/sanity/fetchFavicons.js << EOF
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { client, fileUrlFor } from './client.js';

// Get the directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../../../public');

// Fetch favicon data from Sanity
export async function fetchAndSaveFavicons() {
  try {
    console.log('Fetching favicon package from Sanity...');
    
    // Query for site settings data that contains favicon information
    const siteSettings = await client.fetch(\`*[_type == "siteSettings"][0]{
      favicons {
        faviconIco,
        faviconSvg,
        favicon96,
        appleTouchIcon,
        webAppManifest192,
        webAppManifest512,
        webManifest
      }
    }\`);
    
    if (!siteSettings?.favicons) {
      console.log('No favicon data found in Sanity.');
      return;
    }
    
    // Define the mapping of Sanity field names to output file names
    const faviconMapping = {
      faviconIco: 'favicon.ico',
      faviconSvg: 'favicon.svg',
      favicon96: 'favicon-96x96.png',
      appleTouchIcon: 'apple-touch-icon.png',
      webAppManifest192: 'web-app-manifest-192x192.png',
      webAppManifest512: 'web-app-manifest-512x512.png',
      webManifest: 'site.webmanifest'
    };
    
    // Download each favicon file
    for (const [fieldName, fileName] of Object.entries(faviconMapping)) {
      const fileRef = siteSettings.favicons[fieldName];
      if (!fileRef) continue;
      
      const fileUrl = fileUrlFor(fileRef);
      if (!fileUrl) continue;
      
      const outputPath = path.join(publicDir, fileName);
      
      console.log(\`Downloading \${fileName} from Sanity...\`);
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        console.error(\`Failed to download \${fileName}: \${response.statusText}\`);
        continue;
      }
      
      const fileBuffer = await response.buffer();
      fs.writeFileSync(outputPath, fileBuffer);
      console.log(\`Saved \${fileName} to public directory\`);
    }
    
    console.log('Favicon package successfully downloaded and saved.');
  } catch (error) {
    console.error('Error fetching and saving favicons:', error);
  }
}
EOF

# Create prebuild script
cat > src/lib/sanity/prebuild.js << EOF
import { fetchAndSaveFavicons } from './fetchFavicons.js';

// This file runs before the Astro build process
console.log('🚀 Running pre-build tasks...');

// Run all pre-build tasks concurrently
Promise.all([
  fetchAndSaveFavicons(),
  // Add any other pre-build tasks here
])
  .then(() => {
    console.log('✅ Pre-build tasks completed successfully');
  })
  .catch((error) => {
    console.error('❌ Pre-build tasks failed:', error);
    process.exit(1);
  });
EOF

# Update package.json to include the prebuild script
cat > package.json << EOF
{
  "name": "astro",
  "type": "module",
  "version": "0.0.1",
  "scripts": {
    "dev": "astro dev",
    "build": "node src/lib/sanity/prebuild.js && astro build",
    "preview": "astro preview",
    "astro": "astro"
  },
  "dependencies": {
    "@astrojs/react": "^4.2.1",
    "@sanity/client": "^6.28.3",
    "@sanity/image-url": "^1.1.0",
    "@tailwindcss/vite": "^4.0.11",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "astro": "^5.4.2",
    "groq": "^3.78.1",
    "node-fetch": "^3.3.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.11"
  }
}
EOF

# Update Layout.astro to include all favicon references
mkdir -p src/layouts
cat > src/layouts/Layout.astro << EOF
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width" />
		
		<!-- Standard favicon -->
		<link rel="icon" type="image/x-icon" href="/favicon.ico" />
		<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
		<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
		
		<!-- Apple Touch Icon -->
		<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
		
		<!-- Web App Manifest -->
		<link rel="manifest" href="/site.webmanifest" />
		
		<meta name="generator" content={Astro.generator} />
		<title>Astro Basics</title>
	</head>
	<body>
		<slot />
	</body>
</html>

<style>
	html,
	body {
		margin: 0;
		width: 100%;
		height: 100%;
	}
</style>
EOF

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Your schemas are located in:"
echo "  studio/schemaTypes/"
echo ""
echo "To start development:"
echo "  1. Astro: cd astro && npm run dev"
echo "  2. Sanity: cd studio && npm run dev"
echo ""
echo "🔍 Note: The project is set up to fetch favicon files from Sanity during build."
echo "   Upload your favicon package in the Site Settings section of Sanity Studio."
echo "" 