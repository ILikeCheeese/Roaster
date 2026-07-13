#!/usr/bin/env python3
"""Generate the app icon: a realistic 8-planet solar system (shaded spheres,
Saturn's rings, Jupiter's bands, starfield). Run from repo root:
    python3 scripts/make_icon.py
The planet palette here is mirrored by SolarSystem.swift in the app."""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter

SS = 2
OUT = 1024
N = OUT * SS
random.seed(7)

BG_TOP = (10, 12, 22)
BG_EDGE = (3, 4, 9)

# (name, orbit fraction, display radius fraction, base color, detail key)
PLANETS = [
    ("mercury", 0.128, 0.011, (150, 141, 130), None),
    ("venus",   0.170, 0.019, (222, 190, 128), None),
    ("earth",   0.213, 0.021, (56, 110, 200), "earth"),
    ("mars",    0.256, 0.016, (188, 78, 42), None),
    ("jupiter", 0.312, 0.038, (201, 165, 120), "jupiter"),
    ("saturn",  0.372, 0.031, (223, 201, 158), "saturn"),
    ("uranus",  0.420, 0.024, (168, 220, 224), None),
    ("neptune", 0.462, 0.024, (58, 92, 205), "neptune"),
]
# starting angles (degrees) for the orbital arrangement
ANGLES = [-50, 150, 25, -120, 68, -20, 200, 110]


def clamp(v): return max(0, min(255, int(v)))


def shade(col, b):
    return (clamp(col[0]*b), clamp(col[1]*b), clamp(col[2]*b))


def earth_detail(dx, dy, base):
    if abs(dy) > 0.72:
        return (225, 232, 240)          # polar caps
    # a couple of "continents"
    for (cx, cy, r) in [(-0.25, -0.05, 0.33), (0.30, 0.25, 0.30), (0.1, -0.4, 0.2)]:
        if (dx-cx)**2 + (dy-cy)**2 < r*r:
            return (76, 150, 92)
    return base


def jupiter_detail(dx, dy, base):
    band = math.sin(dy * 9.0)
    if band > 0.35:
        return (168, 120, 82)
    if band < -0.35:
        return (216, 182, 138)
    # great red spot
    if (dx-0.28)**2 + (dy-0.15)**2 < 0.02:
        return (188, 96, 70)
    return base


def neptune_detail(dx, dy, base):
    if math.sin(dy*6 + 1) > 0.6:
        return (40, 70, 180)
    return base


def saturn_detail(dx, dy, base):
    if math.sin(dy*7) > 0.4:
        return (203, 181, 138)
    return base


DETAIL = {"earth": earth_detail, "jupiter": jupiter_detail,
          "neptune": neptune_detail, "saturn": saturn_detail}


def make_sphere(radius, base, light2d, detail=None):
    """Lambert-shaded sphere. light2d = unit (x,y) pointing toward the sun."""
    r = int(radius)
    size = r*2
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    lx, ly, lz = light2d[0], light2d[1], 0.7
    ln = math.sqrt(lx*lx+ly*ly+lz*lz)
    lx, ly, lz = lx/ln, ly/ln, lz/ln
    dfn = DETAIL.get(detail)
    for y in range(size):
        for x in range(size):
            dx = (x - r + 0.5)/r
            dy = (y - r + 0.5)/r
            rr = dx*dx + dy*dy
            if rr > 1.0:
                continue
            nz = math.sqrt(1-rr)
            lam = max(0.0, dx*lx + dy*ly + nz*lz)
            b = 0.18 + 0.95*lam
            spec = 0
            if lam > 0.96:
                spec = 40
            col = dfn(dx, dy, base) if dfn else base
            c = shade(col, b)
            c = (clamp(c[0]+spec), clamp(c[1]+spec), clamp(c[2]+spec))
            a = 255 if rr < 0.90 else int(255*(1-(rr-0.90)/0.10))
            px[x, y] = (c[0], c[1], c[2], max(0, a))
    return img


def background():
    img = Image.new("RGB", (N, N), BG_EDGE)
    d = ImageDraw.Draw(img)
    c = N/2
    maxd = math.hypot(c, c)
    px = img.load()
    for y in range(N):
        for x in range(N):
            t = math.hypot(x-c, y-c)/maxd
            px[x, y] = (clamp(BG_TOP[0]+(BG_EDGE[0]-BG_TOP[0])*t),
                        clamp(BG_TOP[1]+(BG_EDGE[1]-BG_TOP[1])*t),
                        clamp(BG_TOP[2]+(BG_EDGE[2]-BG_TOP[2])*t))
    # stars
    for _ in range(220):
        x, y = random.randint(0, N-1), random.randint(0, N-1)
        b = random.randint(60, 200)
        s = random.choice([1, 1, 1, 2])*SS
        d.ellipse([x, y, x+s, y+s], fill=(b, b, b))
    return img


def draw_sun(img, cx, cy, r):
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx-r*3, cy-r*3, cx+r*3, cy+r*3], fill=(255, 150, 40, 90))
    gd.ellipse([cx-r*1.8, cy-r*1.8, cx+r*1.8, cy+r*1.8], fill=(255, 180, 70, 130))
    glow = glow.filter(ImageFilter.GaussianBlur(r*0.5))
    img.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(img)
    d.ellipse([cx-r*1.12, cy-r*1.12, cx+r*1.12, cy+r*1.12], fill=(255, 176, 60))
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255, 246, 224))


def place_planet(img, cx, cy, px, py, radius, base, detail):
    ux, uy = cx-px, cy-py
    n = math.hypot(ux, uy) or 1
    sphere = make_sphere(radius, base, (ux/n, uy/n), detail)
    # glow
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([px-radius*1.5, py-radius*1.5, px+radius*1.5, py+radius*1.5],
               fill=(base[0], base[1], base[2], 70))
    glow = glow.filter(ImageFilter.GaussianBlur(radius*0.6))
    img.paste(glow, (0, 0), glow)
    img.paste(sphere, (int(px-radius), int(py-radius)), sphere)


def saturn_rings(img, px, py, radius, back):
    """Draw Saturn's ring (call with back=True before planet, False after)."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rx, ry = radius*2.1, radius*0.72
    for rr, col in [(1.0, (220, 205, 170, 200)), (0.86, (150, 140, 120, 160)),
                    (0.72, (210, 198, 168, 180))]:
        d.ellipse([px-rx*rr, py-ry*rr, px+rx*rr, py+ry*rr],
                  outline=col, width=max(2, int(radius*0.10)))
    # keep only top or bottom half
    mask = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(mask)
    if back:
        md.rectangle([0, 0, N, int(py)], fill=255)
    else:
        md.rectangle([0, int(py), N, N], fill=255)
    img.paste(layer, (0, 0), Image.composite(layer.split()[3], Image.new("L", img.size, 0), mask))


def render(aligned=False):
    img = background()
    cx = cy = N/2
    if aligned:
        cx = N*0.5
    sun_r = N*0.072
    # planets behind sun drawn first is fine; draw sun, then planets
    draw_sun(img, cx, cy, sun_r)
    for i, (name, orb, pr, base, det) in enumerate(PLANETS):
        R = orb*N
        if aligned:
            ang = -18  # all in a line, slightly tilted
        else:
            ang = ANGLES[i]
        px = cx + R*math.cos(math.radians(ang))
        py = cy + R*math.sin(math.radians(ang))
        radius = pr*N
        if not aligned:
            # faint orbit ring
            d = ImageDraw.Draw(img)
            d.ellipse([cx-R, cy-R, cx+R, cy+R], outline=(48, 54, 70), width=max(1, SS))
        if name == "saturn":
            saturn_rings(img, px, py, radius, back=True)
            place_planet(img, cx, cy, px, py, radius, base, det)
            saturn_rings(img, px, py, radius, back=False)
        else:
            place_planet(img, cx, cy, px, py, radius, base, det)
    return img.resize((OUT, OUT), Image.LANCZOS)


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icon = os.path.join(base, "Roaster.swiftpm", "Assets.xcassets",
                        "AppIcon.appiconset", "AppIcon.png")
    render(aligned=False).save(icon)
    print("wrote", icon)


if __name__ == "__main__":
    main()
