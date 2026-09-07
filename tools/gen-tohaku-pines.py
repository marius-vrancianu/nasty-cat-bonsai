#!/usr/bin/env python3
"""Generate src/assets/img/tohaku-pines.svg: an ink-wash style vector after
Hasegawa Tohaku's "Pine Trees" (Shorin-zu byobu, right screen, c. 1595).

    python3 tools/gen-tohaku-pines.py src/assets/img/tohaku-pines.svg [seed]

Not a trace: the composition is laid out by hand (coordinates below follow
the painting) and the brushwork is emulated - foliage as dense bands of thin
strokes combed upward from a wavy branch line (Tohaku's straw brush), trunks
as bundles of soft longitudinal streaks, distance as lower opacity plus a
Gaussian blur. Coordinate space is 2000 x 880 (~2.27:1, like the 356 x 156.8
cm screen). All ink is #222 with per-stroke opacity, so the site can reuse
the file as an alpha mask in dark mode. Output is deterministic per seed.
Needs only the Python standard library.
"""
import math
import random
import sys
from collections import defaultdict

W, H = 2000, 880
INK = "#222"
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 7)

# ---------------------------------------------------------------- helpers
def q(v, step):
    return round(round(v / step) * step, 2)

def fmt(v):
    return str(int(round(v)))

class Layer:
    """Collects strokes, grouped by (width, opacity) to keep the file small."""
    def __init__(self, name, blur=0.0, opacity=1.0):
        self.name, self.blur, self.opacity = name, blur, opacity
        self.lines = defaultdict(list)   # (w, op) -> [path fragments]
        self.fills = []                  # raw svg strings

    def line(self, x1, y1, x2, y2, w, op, curve=0.0):
        w, op = q(w, 0.25), q(op, 0.05)
        if op <= 0 or w <= 0:
            return
        if curve:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            nx, ny = -(y2 - y1), (x2 - x1)
            L = math.hypot(nx, ny) or 1
            cx, cy = mx + nx / L * curve, my + ny / L * curve
            self.lines[(w, op)].append(
                f"M{fmt(x1)} {fmt(y1)}Q{fmt(cx)} {fmt(cy)} {fmt(x2)} {fmt(y2)}")
        else:
            self.lines[(w, op)].append(
                f"M{fmt(x1)} {fmt(y1)}l{fmt(x2 - x1)} {fmt(y2 - y1)}")

    def fill(self, d, op, extra=""):
        self.fills.append(f'<path d="{d}" opacity="{q(op, 0.05)}"{extra}/>')

    def svg(self):
        parts = []
        attrs = f' opacity="{self.opacity}"' if self.opacity != 1 else ""
        flt = f' filter="url(#blur{self.blur})"' if self.blur else ""
        parts.append(f'<g id="{self.name}"{attrs}{flt}>')
        if self.fills:
            parts.append(f'<g fill="{INK}">' + "".join(self.fills) + "</g>")
        if self.lines:
            parts.append(f'<g fill="none" stroke="{INK}" stroke-linecap="round">')
            for (w, op), frags in sorted(self.lines.items()):
                parts.append(
                    f'<path stroke-width="{fmt(w)}" opacity="{op}" d="{"".join(frags)}"/>')
            parts.append("</g>")
        parts.append("</g>")
        return "".join(parts)

def bezier(p0, p1, p2, p3, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
                    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts

def resample(pts, n):
    """Piecewise-linear resample of a polyline to n+1 evenly spaced points."""
    segs = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
            for i in range(len(pts) - 1)]
    total = sum(segs)
    out, acc, j = [], 0.0, 0
    for i in range(n + 1):
        d = total * i / n
        while j < len(segs) - 1 and acc + segs[j] < d:
            acc += segs[j]
            j += 1
        t = (d - acc) / segs[j] if segs[j] else 0
        out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t,
                    pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t))
    return out

def tapered(pts, w0, w1, wobble=0.0):
    """Closed outline around polyline pts, width w0 at start -> w1 at end."""
    n = len(pts)
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == n - 1:
            dx, dy = x - pts[i - 1][0], y - pts[i - 1][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        w = (w0 + (w1 - w0) * i / (n - 1)) / 2
        wl = w * (1 + random.uniform(-wobble, wobble))
        wr = w * (1 + random.uniform(-wobble, wobble))
        left.append((x + nx * wl, y + ny * wl))
        right.append((x - nx * wr, y - ny * wr))
    ring = left + right[::-1]
    return "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in ring) + "Z"

# ---------------------------------------------------------------- brushes
def trunk(layer, pts, w0, w1, tone, streaks=None, fade=None):
    """Dry-brush trunk built from many overlapping longitudinal streaks that
    wander across the width, so edges stay soft and the tone mottled.
    pts runs BASE -> TOP. fade=(y_full, y_zero) thins the ink toward the
    ground like Tohaku's distant trunks."""
    pts = resample(pts, 40)
    n = len(pts)
    streaks = streaks or int(18 + w0 * 1.4)
    def normal(i):
        x, y = pts[i]
        if i < n - 1:
            dx, dy = pts[i + 1][0] - x, pts[i + 1][1] - y
        else:
            dx, dy = x - pts[i - 1][0], y - pts[i - 1][1]
        L = math.hypot(dx, dy) or 1
        return -dy / L, dx / L
    def fade_at(y):
        if not fade:
            return 1.0
        return max(0.0, min(1.0, (fade[1] - y) / (fade[1] - fade[0])))
    def width_at(i):
        t = i / (n - 1)
        flare = 1 + 0.5 * max(0.0, 1 - t / 0.08) ** 2   # widen at the very base
        return (w0 + (w1 - w0) * t) * flare
    for s in range(streaks):
        edge = s < 6                       # the first streaks hug the edges
        if edge:
            off = (-1 if s % 2 else 1) * random.uniform(0.36, 0.5)
            w, op = random.uniform(1.0, 2.6), tone * random.uniform(0.22, 0.42)
        else:
            off = random.uniform(-0.42, 0.42)
            w, op = random.uniform(2.0, 6.5), tone * random.uniform(0.05, 0.16)
        i0 = random.randint(0, n // 3) if random.random() < 0.6 else random.randint(0, n - 8)
        i1 = min(n - 1, i0 + random.randint(8, n))
        drift, ph = random.uniform(0.03, 0.1), random.uniform(0, 6.3)
        ph2, f2 = random.uniform(0, 6.3), random.uniform(0.15, 0.4)
        prev = None
        for i in range(i0, i1 + 1):
            nx, ny = normal(i)
            wt = width_at(i)
            o = off + drift * math.sin(i * 0.35 + ph)
            p = (pts[i][0] + nx * o * wt, pts[i][1] + ny * o * wt)
            if prev:
                layer.line(prev[0], prev[1], p[0], p[1], w,
                           op * fade_at(p[1]) * (0.75 + 0.25 * math.sin(i * f2 + ph2)))
            prev = p

def branch(layer, p0, p1, p2, p3, w0, w1, tone):
    pts = bezier(p0, p1, p2, p3, 18)
    for k in range(3):
        off = random.uniform(-0.35, 0.35)
        prev = None
        for i, p in enumerate(pts):
            wt = w0 + (w1 - w0) * i / (len(pts) - 1)
            if i < len(pts) - 1:
                dx, dy = pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]
            else:
                dx, dy = p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]
            L = math.hypot(dx, dy) or 1
            pp = (p[0] - dy / L * off * wt, p[1] + dx / L * off * wt)
            if prev:
                layer.line(prev[0], prev[1], pp[0], pp[1], max(0.8, wt * 0.6),
                           tone * random.uniform(0.12, 0.3))
            prev = pp
    return pts

def band(layer, x0, x1, y, tone, curve=0.0, length=(28, 56), width=(0.7, 1.6),
         density=1.0, fan=22, hang=0.35, lean=0.0, wave=5.0):
    """One tier of pine foliage: a row of thin, near-vertical strokes combed
    upward from a wavy branch line (ink densest along the base, tips ragged),
    with strands hanging below. `curve` sags the branch line down in the
    middle (negative arches it); `lean` tilts the strokes (degrees, positive
    = leaning right); `fan` spreads the outer strokes; `wave` is the
    amplitude of the baseline's wobble."""
    span = x1 - x0
    step = 1.7 / density
    ph1, ph2 = random.uniform(0, 6.3), random.uniform(0, 6.3)
    f1, f2 = random.uniform(0.03, 0.06), random.uniform(0.09, 0.16)
    peak = random.uniform(0.3, 0.7)          # where the tier's strokes are longest
    x = x0 + random.uniform(0, step)
    while x < x1:
        t = (x - x0) / span
        tp = t / (2 * peak) if t < peak else 0.5 + (t - peak) / (2 * (1 - peak))
        by = (y + curve * 4 * t * (1 - t) + wave * math.sin(x * f1 + ph1)
              + wave * 0.5 * math.sin(x * f2 + ph2) + random.uniform(-2, 2))
        profile = 0.6 + 0.4 * math.sin(math.pi * tp) ** 0.6   # longer near the peak
        L = random.uniform(*length) * profile * random.uniform(0.7, 1.1)
        a = math.radians(-90 + lean + (t - 0.5) * fan + random.gauss(0, 8))
        w = random.uniform(*width)
        op = tone * random.uniform(0.4, 1.0)
        if random.random() < 0.25:            # occasional long, pale strand
            L *= 1.45
            op *= 0.55
        layer.line(x, by, x + L * math.cos(a), by + L * math.sin(a), w, op,
                   curve=random.uniform(-2, 2))
        if random.random() < 0.5:             # short dark hair thickens the base
            L2 = L * random.uniform(0.2, 0.45)
            layer.line(x + random.uniform(-1, 1), by + 1, x + L2 * math.cos(a),
                       by + L2 * math.sin(a), w * 1.3, min(1, op * 1.25))
        clump = 0.5 + 0.5 * math.sin(x * 0.08 + ph2)
        if random.random() < hang * 0.45 * clump:      # hanging strands, in clumps
            a2 = math.radians(90 + lean * 0.5 + random.gauss(0, 14))
            L3 = random.uniform(*length) * random.uniform(0.4, 1.0)
            layer.line(x, by + 1, x + L3 * math.cos(a2), by + L3 * math.sin(a2),
                       w * 0.9, op * random.uniform(0.3, 0.65),
                       curve=random.uniform(-4, 4))
        x += step * random.uniform(0.6, 1.4)

def mass(layer, cx, cy, w, h, tone, tiers=None, **kw):
    """A horizontal foliage mass: `tiers` bands stacked between cy-h/2 and
    cy+h/2, each with a jittered extent, so the silhouette is flat-topped,
    ragged underneath and never symmetric."""
    tiers = tiers or max(1, round(h / 26))
    for k in range(tiers):
        y = cy - h / 2 + (h * (k + 0.5) / tiers if tiers > 1 else h / 2) + random.uniform(-4, 4)
        wk = w * random.uniform(0.8, 1.0) * (0.85 + 0.15 * (k + 1) / tiers)
        off = random.uniform(-0.12, 0.12) * w
        band(layer, cx + off - wk / 2, cx + off + wk / 2, y, tone,
             curve=random.uniform(2, 8) * (wk / 100), **kw)

def crown(layer, masses, tone, **kw):
    """masses: list of (cx, cy, w, h[, tone_mult])."""
    for m in masses:
        cx, cy, w, h = m[:4]
        tm = m[4] if len(m) > 4 else 1.0
        mass(layer, cx, cy, w, h, tone * tm, **kw)

def root(layer, x, y, direction, length, tone, w=6):
    """A claw-like root: a tapered, curved stroke from the trunk base."""
    ex = x + direction * length
    ey = y + random.uniform(6, 16)
    pts = bezier((x, y), (x + direction * length * 0.3, y - random.uniform(2, 10)),
                 (x + direction * length * 0.7, ey - random.uniform(-4, 6)), (ex, ey), 10)
    layer.fill(tapered(pts, w, 1.5, wobble=0.2), tone * random.uniform(0.6, 0.85))

# ---------------------------------------------------------------- composition
far = Layer("far", blur=3, opacity=0.38)      # misty pines, panels 1-2
mid = Layer("mid", blur=2, opacity=0.55)       # second rank
near = Layer("near", blur=0.6)                          # the dark group + right pine

SOFT = dict(length=(26, 52), width=(1.6, 3.2), density=0.8, hang=0.3, wave=6)  # diluted ink
DARK = dict(length=(30, 58), width=(0.7, 1.6), density=1.6)

# ---- far left: three misty pines merging into one pale wall
trunk(far, [(268, 560), (266, 420), (262, 290)], 11, 5, 0.42, fade=(360, 540))
crown(far, [(262, 185, 100, 40), (250, 245, 135, 50), (272, 305, 115, 44, 0.8), (265, 352, 80, 30, 0.6)],
      0.6, **SOFT)
trunk(far, [(338, 580), (340, 440), (346, 270)], 12, 5, 0.5, fade=(400, 570))
crown(far, [(345, 160, 80, 36), (356, 216, 135, 52), (335, 272, 135, 52, 0.9), (360, 326, 100, 40, 0.7),
            (350, 372, 70, 28, 0.5)], 0.7, **SOFT)
trunk(far, [(474, 560), (470, 430), (474, 300)], 11, 5, 0.42, fade=(380, 540))
crown(far, [(472, 224, 95, 40), (458, 278, 145, 52), (482, 332, 115, 44, 0.8), (476, 382, 80, 30, 0.6)],
      0.6, **SOFT)

# ---- second rank: the tall pine peeking above the dark group, and one
# between the far group and the cluster
trunk(mid, [(586, 570), (588, 380), (582, 150)], 12, 5, 0.45, fade=(300, 560))
crown(mid, [(580, 92, 70, 34), (566, 140, 110, 46), (592, 190, 90, 40, 0.8), (585, 235, 60, 26, 0.6)],
      0.55, **SOFT)
trunk(mid, [(508, 540), (505, 430), (503, 280)], 10, 4, 0.35, fade=(340, 520))
crown(mid, [(502, 240, 90, 40), (516, 292, 120, 46), (505, 338, 80, 32, 0.8)], 0.45, **SOFT)

# ---- the dark group (panels 2-3): four trunks, base -> top
trunk(near, [(640, 800), (650, 700), (644, 560), (652, 440)], 17, 8, 0.7)
trunk(near, [(704, 812), (700, 700), (712, 520), (710, 350)], 21, 9, 0.85)
trunk(near, [(774, 816), (766, 680), (774, 500), (768, 330)], 26, 10, 0.95)
trunk(near, [(858, 806), (862, 680), (850, 540), (848, 410)], 15, 7, 0.6)
# the main crown: a small tuft on top, then broad masses stepping right
crown(near, [(766, 148, 90, 42, 0.85), (770, 224, 190, 84), (796, 322, 240, 92), (700, 306, 90, 40, 0.85),
             (742, 402, 115, 44, 0.9), (880, 372, 70, 30, 0.75)], 0.95, **DARK)
# lower foliage on the branches
branch(near, (770, 470), (720, 482), (660, 502), (596, 534), 7, 2.5, 0.8)
crown(near, [(636, 522, 150, 60), (600, 572, 80, 30, 0.65), (646, 626, 70, 30, 0.5), (720, 470, 60, 28, 0.55)],
      0.9, **DARK)
branch(near, (772, 562), (820, 578), (880, 602), (936, 642), 7, 2.5, 0.75)
crown(near, [(880, 618, 130, 60), (862, 456, 80, 30, 0.65)], 0.8, **DARK)
# roots and ground
for x, y, tone in [(640, 800, 0.7), (704, 812, 0.85), (774, 816, 0.95), (858, 806, 0.6)]:
    for d in (-1, 1):
        for k in range(2):
            root(near, x + d * random.uniform(2, 8), y - random.uniform(0, 10), d,
                 random.uniform(30, 75), tone, w=random.uniform(4, 8))
for _ in range(10):
    x = random.uniform(560, 900)
    gy = random.uniform(806, 826)
    near.line(x, gy, x + random.uniform(15, 45), gy + random.uniform(-2, 3),
              random.uniform(2, 4), random.uniform(0.2, 0.5), curve=random.uniform(-3, 3))

# ---- second rank behind the group (panels 3-4)
trunk(mid, [(960, 540), (953, 420), (946, 290)], 13, 5, 0.45, fade=(370, 530))
crown(mid, [(940, 140, 80, 36), (960, 200, 130, 52), (930, 262, 130, 50, 0.9), (905, 322, 90, 40, 0.8),
            (930, 362, 60, 26, 0.6)], 0.55, **SOFT)
trunk(mid, [(1052, 500), (1050, 400), (1048, 262)], 10, 4, 0.35, fade=(330, 500))
crown(mid, [(1058, 226, 100, 44), (1040, 280, 110, 40, 0.8)], 0.35, **SOFT)

# ---- right group (panels 5-6)
# tall faint pine behind, crown poking above the main one
trunk(mid, [(1772, 560), (1758, 400), (1745, 170)], 12, 5, 0.38, fade=(300, 540))
crown(mid, [(1742, 128, 80, 36), (1735, 182, 115, 46), (1760, 232, 70, 30, 0.7)], 0.45, **SOFT)
# pine at the far right edge
trunk(mid, [(1990, 560), (1980, 420), (1968, 260)], 12, 5, 0.36, fade=(330, 540))
crown(mid, [(1962, 200, 80, 36), (1975, 256, 100, 44), (1980, 310, 70, 30, 0.7)], 0.42, **SOFT)
# faint one to the left of the group
trunk(far, [(1670, 480), (1662, 360), (1656, 230)], 10, 4, 0.4, fade=(300, 480))
crown(far, [(1652, 208, 90, 40), (1666, 262, 110, 44, 0.8)], 0.4, **SOFT)
# faint trunk standing behind-left of the main pine
trunk(mid, [(1672, 816), (1682, 640), (1692, 470)], 14, 7, 0.42)
crown(mid, [(1672, 478, 80, 36)], 0.42, **SOFT)

# the main right pine: dark crown, leaning trunk, long branch sweeping down-left
trunk(near, [(1892, 816), (1876, 700), (1862, 560), (1842, 390)], 22, 9, 0.9)
crown(near, [(1818, 268, 70, 36, 0.85), (1824, 334, 150, 80), (1838, 410, 120, 50), (1762, 362, 70, 40, 0.7)],
      0.92, **DARK)
branch(near, (1860, 520), (1800, 545), (1720, 585), (1632, 616), 8, 2.5, 0.8)
crown(near, [(1640, 622, 80, 34, 0.55), (1682, 606, 90, 40, 0.7), (1724, 596, 90, 40, 0.75),
             (1760, 648, 100, 46, 0.8), (1800, 632, 80, 36, 0.7), (1728, 690, 80, 30, 0.55),
             (1830, 700, 90, 36, 0.6), (1852, 636, 60, 28, 0.5)], 0.9, **DARK)
branch(near, (1864, 480), (1900, 500), (1935, 540), (1962, 598), 6, 2, 0.7)
crown(near, [(1922, 596, 90, 40, 0.6), (1943, 640, 80, 30, 0.5), (1905, 742, 70, 30, 0.45)], 0.85, **DARK)
for d in (-1, 1):
    for k in range(2):
        root(near, 1892 + d * random.uniform(2, 8), 816 - random.uniform(0, 10), d,
             random.uniform(30, 70), 0.85, w=random.uniform(4, 8))
trunk(near, [(1846, 812), (1838, 700), (1830, 560)], 12, 6, 0.5)   # a thinner companion trunk

# ---------------------------------------------------------------- output
defs = ('<defs>'
        '<filter id="blur3" x="-10%" y="-10%" width="120%" height="120%">'
        '<feGaussianBlur stdDeviation="3"/></filter>'
        '<filter id="blur2" x="-10%" y="-10%" width="120%" height="120%">'
        '<feGaussianBlur stdDeviation="2"/></filter>'
        '<filter id="blur0.6" x="-5%" y="-5%" width="110%" height="110%">'
        '<feGaussianBlur stdDeviation="0.6"/></filter>'
        '</defs>')
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
       '<!-- After Hasegawa Tohaku, Pine Trees (Shorin-zu byobu, right screen), '
       'c. 1595. Generated by tools/gen-tohaku-pines.py - edit and re-run that '
       'script rather than this file. -->'
       f'{defs}{far.svg()}{mid.svg()}{near.svg()}</svg>')
out = sys.argv[1] if len(sys.argv) > 1 else "tohaku-pines.svg"
with open(out, "w") as f:
    f.write(svg)
n_lines = sum(len(v) for L in (far, mid, near) for v in L.lines.values())
print(f"wrote {out}: {len(svg)/1024:.0f} KB, {n_lines} strokes")
