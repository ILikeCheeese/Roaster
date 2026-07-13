#!/usr/bin/env python3
"""Generate the Roaster app icon and in-app logo.

Motif: a camera aperture (iris) with a pinwheel of blades in a warm
amber->orange gradient on a deep charcoal background. Run from repo root:
    python3 scripts/make_icon.py
"""
import math
from PIL import Image, ImageDraw

SS = 4  # supersampling factor for smooth edges


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def radial_background(size, inner, outer):
    """Radial gradient from `inner` (center) to `outer` (corners)."""
    img = Image.new("RGB", (size, size), outer)
    px = img.load()
    c = size / 2
    maxd = math.hypot(c, c)
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / maxd
            px[x, y] = lerp(inner, outer, min(d, 1.0))
    return img


def draw_aperture(draw, cx, cy, radius, blades=6,
                  c_bright=(255, 206, 92), c_deep=(249, 115, 22)):
    """Draw a camera iris: blades tile the disc, leaving a hexagonal opening.

    Each blade shares its straight inner edge with the neighbour, so the
    edges read as clean aperture lines with no gaps to the background.
    """
    step = 2 * math.pi / blades
    twist = step * 0.5          # rotates the opening for the classic swirl
    opening = radius * 0.36     # distance of the inner (opening) vertices
    for k in range(blades):
        a0 = k * step
        a1 = (k + 1) * step
        # Outer arc, sampled for smoothness.
        pts = []
        segs = 12
        for s in range(segs + 1):
            a = a0 + (a1 - a0) * s / segs
            pts.append((cx + radius * math.cos(a), cy + radius * math.sin(a)))
        # Two inner vertices so consecutive blades share an edge (full tiling).
        pts.append((cx + opening * math.cos(a1 + twist),
                    cy + opening * math.sin(a1 + twist)))
        pts.append((cx + opening * math.cos(a0 + twist),
                    cy + opening * math.sin(a0 + twist)))
        t = k / max(blades - 1, 1)
        draw.polygon(pts, fill=lerp(c_bright, c_deep, t))
    # Thin dark opening + bright core for depth.
    hole = []
    for k in range(blades):
        a = k * step + twist
        hole.append((cx + opening * math.cos(a), cy + opening * math.sin(a)))
    draw.polygon(hole, fill=(20, 17, 15))
    draw.ellipse([cx - opening * 0.42, cy - opening * 0.42,
                  cx + opening * 0.42, cy + opening * 0.42],
                 fill=(255, 244, 224))


def make_app_icon(path, size=1024):
    S = size * SS
    img = radial_background(S, inner=(46, 40, 34), outer=(12, 10, 9))
    draw = ImageDraw.Draw(img)
    draw_aperture(draw, S / 2, S / 2, radius=S * 0.36)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
    print("wrote", path, img.size)


def make_logo(path, size=512):
    """Transparent-background aperture mark for in-app use."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_aperture(draw, S / 2, S / 2, radius=S * 0.46)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
    print("wrote", path, img.size)


if __name__ == "__main__":
    import os
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icon_dir = os.path.join(base, "Roaster.swiftpm", "Assets.xcassets",
                            "AppIcon.appiconset")
    make_app_icon(os.path.join(icon_dir, "AppIcon.png"))
    make_logo(os.path.join(base, "scripts", "logo-preview.png"))
