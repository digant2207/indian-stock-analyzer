from PIL import Image, ImageDraw
import os

def create_breakout_icon(size=512):
    # Dark Navy iOS App Icon Background
    img = Image.new('RGBA', (size, size), (15, 23, 42, 255)) # #0f172a
    draw = ImageDraw.Draw(img)

    # 1. Subtle Radial Glow in center
    for r in range(size // 2, 0, -5):
        alpha = int(35 * (1 - r / (size // 2)))
        draw.ellipse([size//2 - r, size//2 - r, size//2 + r, size//2 + r], fill=(14, 165, 233, alpha))

    # 2. Resistance Line (Dashed / Solid Breakout Line)
    y_res = int(size * 0.42)
    draw.line([(int(size * 0.1), y_res), (int(size * 0.9), y_res)], fill=(148, 163, 184, 180), width=int(size * 0.015))

    # 3. Bullish Green Candlesticks
    # Candle 1 (Consolidation)
    c1_x = int(size * 0.22)
    draw.line([(c1_x, int(size * 0.58)), (c1_x, int(size * 0.78))], fill=(16, 185, 129, 255), width=int(size * 0.012))
    draw.rectangle([c1_x - int(size * 0.04), int(size * 0.62), c1_x + int(size * 0.04), int(size * 0.74)], fill=(16, 185, 129, 255))

    # Candle 2 (Consolidation 2)
    c2_x = int(size * 0.38)
    draw.line([(c2_x, int(size * 0.48)), (c2_x, int(size * 0.68))], fill=(16, 185, 129, 255), width=int(size * 0.012))
    draw.rectangle([c2_x - int(size * 0.04), int(size * 0.52), c2_x + int(size * 0.04), int(size * 0.64)], fill=(16, 185, 129, 255))

    # Candle 3 (MASSIVE BREAKOUT CANDLE - Piercing Resistance Line)
    c3_x = int(size * 0.58)
    draw.line([(c3_x, int(size * 0.22)), (c3_x, int(size * 0.56))], fill=(52, 211, 153, 255), width=int(size * 0.015))
    draw.rectangle([c3_x - int(size * 0.05), int(size * 0.26), c3_x + int(size * 0.05), int(size * 0.50)], fill=(52, 211, 153, 255))

    # 4. Breakout Arrow / Rocket Surge Line (Cyan)
    surge_points = [
        (int(size * 0.15), int(size * 0.72)),
        (int(size * 0.32), int(size * 0.58)),
        (int(size * 0.52), int(size * 0.44)),
        (int(size * 0.78), int(size * 0.18))
    ]
    draw.line(surge_points, fill=(56, 189, 248, 255), width=int(size * 0.025))

    # 5. Breakout Arrow Head (Pointing Top Right)
    arrow_head = [
        (int(size * 0.78), int(size * 0.18)),
        (int(size * 0.66), int(size * 0.20)),
        (int(size * 0.76), int(size * 0.30))
    ]
    draw.polygon(arrow_head, fill=(56, 189, 248, 255))

    # 6. Glowing Star / Spark Badge at top-right breakout point
    star_x = int(size * 0.78)
    star_y = int(size * 0.18)
    draw.ellipse([star_x - 12, star_y - 12, star_x + 12, star_y + 12], fill=(255, 255, 255, 255))

    return img

if __name__ == "__main__":
    # Generate 512x512 Main Icon
    icon_512 = create_breakout_icon(512)
    icon_512.save("icon-512.png", "PNG")

    # Generate 180x180 iPhone Apple Touch Icon
    icon_180 = icon_512.resize((180, 180), Image.Resampling.LANCZOS)
    icon_180.save("apple-touch-icon.png", "PNG")

    # Generate 64x64 Favicon
    icon_64 = icon_512.resize((64, 64), Image.Resampling.LANCZOS)
    icon_64.save("favicon.png", "PNG")

    print("Created apple-touch-icon.png (180x180), icon-512.png, and favicon.png successfully!")
