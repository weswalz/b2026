#!/bin/bash

# Convert White Linen Night images to WebP format at 85% quality

echo "Converting White Linen Night images to WebP format..."

# Navigate to the whitelinen directory
cd public/images/whitelinen

# Convert all JPG files to WebP at 85% quality
for file in *.jpg; do
    if [ -f "$file" ]; then
        # Get filename without extension
        filename="${file%.*}"
        
        echo "Converting $file to ${filename}.webp..."
        
        # Convert to WebP at 85% quality
        cwebp -q 85 "$file" -o "${filename}.webp"
        
        if [ $? -eq 0 ]; then
            echo "✓ Successfully converted $file"
        else
            echo "✗ Failed to convert $file"
        fi
    fi
done

echo "Conversion complete!"

# List the converted files
echo ""
echo "WebP files created:"
ls -la *.webp 2>/dev/null | awk '{print $9}'