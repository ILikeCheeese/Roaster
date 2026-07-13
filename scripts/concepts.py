#!/usr/bin/env python3
"""Generate a contact sheet of ORIGINAL monochrome camera-mark concepts.

Deliberately avoids the classic aperture-blades-in-a-ring so the mark reads
as unique. Produces scratch/concepts.png (2x2 with labels).
"""
import math, os
from PIL import Image, ImageDraw, ImageFont

SS = 3
CELL = 512
W = WHITE = (245, 245, 247)
BLACK = (0, 0, 0)


def font(sz):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


# ---- Concept A: Focus reticle (viewfinder corners + AF dot) ----
def concept_reticle(d, cx, cy, s):
    half = s * 0.34
    arm = s * 0.14
    w = int(s * 0.032)
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for sx, sy in corners:
        x = cx + sx * half
        y = cy + sy * half
        d.line([(x, y), (x - sx * arm, y)], fill=W, width=w)
        d.line([(x, y), (x, y - sy * arm)], fill=W, width=w)
    r = s * 0.05
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=W)


# ---- Concept B: Minimalist lens (offset rings + specular highlight) ----
def concept_lens(d, cx, cy, s):
    d.ellipse([cx - s*0.40, cy - s*0.40, cx + s*0.40, cy + s*0.40],
              outline=W, width=int(s*0.03))
    d.ellipse([cx - s*0.27, cy - s*0.27, cx + s*0.27, cy + s*0.27],
              outline=W, width=int(s*0.022))
    d.ellipse([cx - s*0.13, cy - s*0.13, cx + s*0.13, cy + s*0.13], fill=W)
    # specular crescent, top-left
    hx, hy, hr = cx - s*0.20, cy - s*0.20, s*0.075
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=W)


# ---- Concept C: Spiral iris (single continuous coil) ----
def concept_spiral(d, cx, cy, s):
    pts = []
    turns = 2.4
    steps = 240
    r0, r1 = s * 0.05, s * 0.42
    for i in range(steps + 1):
        t = i / steps
        ang = t * turns * 2 * math.pi
        r = r0 + (r1 - r0) * t
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.line(pts, fill=W, width=int(s * 0.045), joint="curve")


# ---- Concept D: Minimal camera body (silhouette) ----
def concept_body(d, cx, cy, s):
    bw, bh = s * 0.80, s * 0.58
    x0, y0 = cx - bw/2, cy - bh/2 + s*0.04
    d.rounded_rectangle([x0, y0, x0+bw, y0+bh], radius=s*0.10,
                        outline=W, width=int(s*0.032))
    # viewfinder hump
    d.rounded_rectangle([cx - s*0.14, y0 - s*0.10, cx + s*0.14, y0 + s*0.02],
                        radius=s*0.03, fill=W)
    # lens
    lr = s * 0.17
    d.ellipse([cx - lr, cy - lr + s*0.04, cx + lr, cy + lr + s*0.04],
              outline=W, width=int(s*0.032))
    d.ellipse([cx - lr*0.4, cy - lr*0.4 + s*0.04, cx + lr*0.4, cy + lr*0.4 + s*0.04],
              fill=W)
    # shutter dot
    d.ellipse([cx + s*0.24, y0 - s*0.05, cx + s*0.30, y0 + s*0.01], fill=W)


CONCEPTS = [
    ("A  Focus reticle", concept_reticle),
    ("B  Lens", concept_lens),
    ("C  Spiral iris", concept_spiral),
    ("D  Camera body", concept_body),
]


def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(base, "scratch")
    os.makedirs(out, exist_ok=True)
    sheet = Image.new("RGB", (CELL*2*SS, CELL*2*SS), BLACK)
    d = ImageDraw.Draw(sheet)
    f = font(int(28*SS))
    for idx, (label, fn) in enumerate(CONCEPTS):
        col, row = idx % 2, idx // 2
        cx = (col + 0.5) * CELL * SS
        cy = (row + 0.5) * CELL * SS - 18*SS
        fn(d, cx, cy, CELL*SS*0.62)
        d.text((cx, (row+1)*CELL*SS - 46*SS), label, fill=(150,150,150),
               font=f, anchor="mm")
        # cell divider
    for i in (1,):
        d.line([(CELL*SS, 0), (CELL*SS, 2*CELL*SS)], fill=(40,40,40), width=SS)
        d.line([(0, CELL*SS), (2*CELL*SS, CELL*SS)], fill=(40,40,40), width=SS)
    sheet = sheet.resize((CELL*2, CELL*2), Image.LANCZOS)
    path = os.path.join(out, "concepts.png")
    sheet.save(path)
    print("wrote", path)


if __name__ == "__main__":
    main()
