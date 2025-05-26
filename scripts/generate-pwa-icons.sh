#!/bin/bash

# Required sizes for PWA icons
sizes=(72 96 128 144 152 192 384 512)

# Source SVG file
svg_file="public/icons/logo.svg"

# Create icons directory if it doesn't exist
mkdir -p public/icons

# Convert SVG to PNG in different sizes
for size in "${sizes[@]}"; do
    magick "$svg_file" -background none -resize ${size}x${size} "public/icons/icon-${size}x${size}.png"
done

echo "PWA icons generated successfully!" 