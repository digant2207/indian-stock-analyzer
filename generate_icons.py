import math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

def draw_3d_box(draw, x, y, width, height, depth, top_color, side_color, front_color):
    """Draws a 3D volumetric cuboid with top, right-side, and front facets."""
    # Front face
    front = [
        (x, y),
        (x + width, y),
        (x + width, y + height),
        (x, y + height)
    ]
    # Top face
    top = [
        (x, y),
        (x + depth, y - depth * 0.7),
        (x + width + depth, y - depth * 0.7),
        (x + width, y)
    ]
    # Right side face
    side = [
        (x + width, y),
        (x + width + depth, y - depth * 0.7),
        (x + width + depth, y + height - depth * 0.7),
        (x + width, y + height)
    ]
    
    draw.polygon(top, fill=top_color)
    draw.polygon(side, fill=side_color)
    draw.polygon(front, fill=front_color)

def draw_3d_arrow(draw, start_x, start_y, end_x, end_y, thickness, depth, color_light, color_mid, color_dark):
    """Draws a 3D extrusion breakout arrow with bevel highlights."""
    dx = end_x - start_x
    dy = end_y - start_y
    angle = math.atan2(dy, dx)
    perp = angle + math.pi / 2

    px = math.cos(perp) * thickness / 2
    py = math.sin(perp) * thickness / 2

    # Main Shaft Front Face
    p1 = (start_x - px, start_y - py)
    p2 = (start_x + px, start_y + py)
    p3 = (end_x + px, end_y + py)
    p4 = (end_x - px, end_y - py)

    # 3D Depth Shift
    shift_x = depth
    shift_y = -depth * 0.7

    # 3D Back Shaft
    p1_b = (p1[0] + shift_x, p1[1] + shift_y)
    p2_b = (p2[0] + shift_x, p2[1] + shift_y)
    p3_b = (p3[0] + shift_x, p3[1] + shift_y)
    p4_b = (p4[0] + shift_x, p4[1] + shift_y)

    # Top/Right Extrusion Facet
    draw.polygon([p2, p2_b, p3_b, p3], fill=color_dark)
    # Shaft Top Bevel
    draw.polygon([p1, p1_b, p2_b, p2], fill=color_light)
    # Shaft Front
    draw.polygon([p1, p2, p3, p4], fill=color_mid)

    # 3D Arrowhead Head
    head_len = thickness * 2.2
    head_w = thickness * 1.8

    hx1 = end_x - math.cos(angle) * head_len + math.cos(perp) * head_w
    hy1 = end_y - math.sin(angle) * head_len + math.sin(perp) * head_w
    hx2 = end_x - math.cos(angle) * head_len - math.cos(perp) * head_w
    hy2 = end_y - math.sin(angle) * head_len - math.sin(perp) * head_w

    p_head1 = (hx1, hy1)
    p_head2 = (hx2, hy2)
    tip = (end_x + math.cos(angle) * thickness, end_y + math.sin(angle) * thickness)

    tip_b = (tip[0] + shift_x, tip[1] + shift_y)
    p_head1_b = (p_head1[0] + shift_x, p_head1[1] + shift_y)
    p_head2_b = (p_head2[0] + shift_x, p_head2[1] + shift_y)

    # Arrowhead 3D Facets
    draw.polygon([p_head1, p_head1_b, tip_b, tip], fill=color_light)
    draw.polygon([p_head2, p_head2_b, tip_b, tip], fill=color_dark)
    draw.polygon([p_head1, p_head2, tip], fill=color_mid)

def create_3d_breakout_icon(size=512):
    # 1. Premium 3D Dark Obsidian Background with Inner Lighting
    base = Image.new('RGBA', (size, size), (11, 15, 25, 255))
    draw = ImageDraw.Draw(base)

    # 3D Corner Lighting / Sphere Highlight
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    g_draw.ellipse([size*0.1, size*0.05, size*0.9, size*0.85], fill=(30, 41, 69, 160))
    g_draw.ellipse([size*0.25, size*0.1, size*0.75, size*0.6], fill=(56, 189, 248, 45))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.08))
    base = Image.alpha_composite(base, glow)
    draw = ImageDraw.Draw(base)

    # 2. 3D Glass Grid Surface Platform (Isometric Perspective)
    y_grid = int(size * 0.45)
    grid_glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gr_draw = ImageDraw.Draw(grid_glow)
    
    # 3D Glass Breakout Plane
    plane_pts = [
        (int(size * 0.08), y_grid + 30),
        (int(size * 0.35), y_grid - 40),
        (int(size * 0.92), y_grid - 40),
        (int(size * 0.65), y_grid + 30)
    ]
    gr_draw.polygon(plane_pts, fill=(148, 163, 184, 25), outline=(148, 163, 184, 120))

    # Dashed Breakout Resistance Line across 3D Plane
    res_y = y_grid - 5
    gr_draw.line([(int(size * 0.12), res_y), (int(size * 0.88), res_y - 20)], fill=(244, 63, 94, 220), width=5)
    base = Image.alpha_composite(base, grid_glow)
    draw = ImageDraw.Draw(base)

    # 3. 3D Green Emerald Bullish Candlesticks (3D Cuboids with Shading)
    # Candle 1 (Low)
    x1, y1, w1, h1, d1 = int(size * 0.20), int(size * 0.58), int(size * 0.09), int(size * 0.16), 14
    # Wick 1
    draw.line([(x1 + w1//2, y1 - 20), (x1 + w1//2, y1 + h1 + 20)], fill=(16, 185, 129, 255), width=4)
    draw_3d_box(draw, x1, y1, w1, h1, d1, top_color=(52, 211, 153, 255), side_color=(5, 150, 105, 255), front_color=(16, 185, 129, 255))

    # Candle 2 (Medium Momentum)
    x2, y2, w2, h2, d2 = int(size * 0.37), int(size * 0.48), int(size * 0.09), int(size * 0.20), 16
    # Wick 2
    draw.line([(x2 + w2//2, y2 - 25), (x2 + w2//2, y2 + h2 + 25)], fill=(16, 185, 129, 255), width=4)
    draw_3d_box(draw, x2, y2, w2, h2, d2, top_color=(52, 211, 153, 255), side_color=(5, 150, 105, 255), front_color=(16, 185, 129, 255))

    # Candle 3 (MASSIVE 3D BREAKOUT CRYSTAL CANDLE)
    x3, y3, w3, h3, d3 = int(size * 0.55), int(size * 0.22), int(size * 0.11), int(size * 0.38), 20
    # Wick 3
    draw.line([(x3 + w3//2, y3 - 35), (x3 + w3//2, y3 + h3 + 30)], fill=(52, 211, 153, 255), width=6)
    draw_3d_box(draw, x3, y3, w3, h3, d3, top_color=(167, 243, 208, 255), side_color=(16, 185, 129, 255), front_color=(52, 211, 153, 255))

    # 4. 3D Metallic Cyan & Gold Rocket Breakout Arrow
    draw_3d_arrow(
        draw,
        start_x=int(size * 0.15), start_y=int(size * 0.74),
        end_x=int(size * 0.78), end_y=int(size * 0.18),
        thickness=int(size * 0.06),
        depth=18,
        color_light=(186, 230, 253, 255),  # Specular Cyan Highlight
        color_mid=(56, 189, 248, 255),    # Vibrant Metallic Cyan
        color_dark=(2, 132, 199, 255)     # Deep Shadow Side
    )

    # 5. Glowing 3D Starburst Lens Flare at the Breakout Peak
    star_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(star_img)
    sx, sy = int(size * 0.81), int(size * 0.15)
    
    # Outer Flare Glow
    s_draw.ellipse([sx - 40, sy - 40, sx + 40, sy + 40], fill=(255, 255, 255, 180))
    s_draw.ellipse([sx - 70, sy - 70, sx + 70, sy + 70], fill=(56, 189, 248, 90))
    star_img = star_img.filter(ImageFilter.GaussianBlur(12))
    base = Image.alpha_composite(base, star_img)
    draw = ImageDraw.Draw(base)

    # Bright Center Diamond Flare
    flare_poly = [(sx, sy - 28), (sx + 8, sy - 8), (sx + 28, sy), (sx + 8, sy + 8), (sx, sy + 28), (sx - 8, sy + 8), (sx - 28, sy), (sx - 8, sy - 8)]
    draw.polygon(flare_poly, fill=(255, 255, 255, 255))
    draw.ellipse([sx - 7, sy - 7, sx + 7, sy + 7], fill=(255, 255, 255, 255))

    return base

if __name__ == "__main__":
    # Generate 512x512 High-Res 3D Icon
    icon_512 = create_3d_breakout_icon(512)
    icon_512.save("icon-512.png", "PNG")

    # Generate 180x180 3D iPhone Apple Touch Icon
    icon_180 = icon_512.resize((180, 180), Image.Resampling.LANCZOS)
    icon_180.save("apple-touch-icon.png", "PNG")

    # Generate 64x64 Favicon
    icon_64 = icon_512.resize((64, 64), Image.Resampling.LANCZOS)
    icon_64.save("favicon.png", "PNG")

    print("Created 3D Breakout iPhone app icon (180x180), icon-512.png, and favicon.png successfully!")
