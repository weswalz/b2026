#!/bin/bash

# Simple script to update Sanity schemas from GitHub repository

echo "Updating schemas from GitHub repository..."

# Set directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
SCHEMA_DIR="$SCRIPT_DIR/studio/schemaTypes"
TEMP_DIR="$SCRIPT_DIR/temp_schemas"

# Create temporary directory
mkdir -p "$TEMP_DIR"

# Clone the repository
git clone https://github.com/weswalz/sanity-schemas.git "$TEMP_DIR"

# Find schema directory in the cloned repo
if [ -d "$TEMP_DIR/schemas" ]; then
    SOURCE_DIR="$TEMP_DIR/schemas"
elif [ -d "$TEMP_DIR/schema" ]; then
    SOURCE_DIR="$TEMP_DIR/schema"
elif [ -d "$TEMP_DIR/schemaTypes" ]; then
    SOURCE_DIR="$TEMP_DIR/schemaTypes"
else
    SOURCE_DIR="$TEMP_DIR"
fi

# Remove all existing schema files
echo "Removing existing schema files..."
rm -rf "$SCHEMA_DIR"
mkdir -p "$SCHEMA_DIR"

# Copy schema files to studio
echo "Copying new schema files..."
cp -r "$SOURCE_DIR"/* "$SCHEMA_DIR/"

# Clean up
rm -rf "$TEMP_DIR"

echo "Schema synchronization complete!"
echo "Try running Sanity Studio now with: cd studio && npm run dev" 