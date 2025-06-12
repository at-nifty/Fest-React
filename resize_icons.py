#!/usr/bin/env python3

import os
from PIL import Image
import argparse

def resize_image(input_path, output_path, size):
    """Resize image to specified size while maintaining aspect ratio."""
    with Image.open(input_path) as img:
        # Convert to RGBA if not already
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Resize image
        resized_img = img.resize((size, size), Image.Resampling.LANCZOS)
        
        # Save with high quality
        resized_img.save(output_path, 'PNG', quality=95, optimize=True)

def create_icons(input_path, output_dir):
    """Create icons of various sizes from input image."""
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Define icon sizes
    sizes = [16, 32, 48, 72, 96, 128, 144, 152, 192, 384, 512]
    
    # Create icons for each size
    for size in sizes:
        output_path = os.path.join(output_dir, f'icon-{size}x{size}.png')
        resize_image(input_path, output_path, size)
        print(f'Created {output_path}')
    
    # Create apple-touch-icon (180x180)
    apple_touch_path = os.path.join(os.path.dirname(output_dir), 'apple-touch-icon.png')
    resize_image(input_path, apple_touch_path, 180)
    print(f'Created {apple_touch_path}')
    
    # Create mask-icon (SVG)
    # Note: This is a placeholder. You'll need to create a proper SVG file manually
    mask_icon_path = os.path.join(os.path.dirname(output_dir), 'mask-icon.svg')
    with open(mask_icon_path, 'w') as f:
        f.write('''<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <image href="cast.png" width="512" height="512"/>
</svg>''')
    print(f'Created {mask_icon_path}')

def main():
    parser = argparse.ArgumentParser(description='Create icons of various sizes from an input image.')
    parser.add_argument('input', help='Path to input image file')
    parser.add_argument('--output-dir', default='public/icons', help='Output directory for icons')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f'Error: Input file {args.input} does not exist')
        return
    
    create_icons(args.input, args.output_dir)
    print('Icon creation completed!')

if __name__ == '__main__':
    main() 