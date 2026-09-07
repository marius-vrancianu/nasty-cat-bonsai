#!/usr/bin/env python3
"""Generate src/assets/img/tohaku-pines.svg: a vector after Hasegawa Tohaku's
"Pine Trees" (Shorin-zu byobu, right screen, c. 1595), drawn in the same
vocabulary as the site's original pine-trees.svg.

    python3 tools/gen-tohaku-pines.py src/assets/img/tohaku-pines.svg [seed]

Vocabulary (borrowed from pine-trees.svg): one <g> per tree at its own
opacity - overlapping trees at different opacities give the mist, no blur
filters; trunks are thick round-capped cubic curves; branches are thinner
curves that leave the trunk, droop and lift; every branch tip carries a fan
of a few hundred straight needles radiating over a 40-60 degree arc from a
small scattered base. Composition coordinates follow the painting in a
2000 x 880 space (~2.27:1, like the 356 x 156.8 cm screen). All ink is #222,
so the file also works as the dark-theme alpha mask. Deterministic per seed;
standard library only.
"""
import math
import random
import sys
from collections import defaultdict

W, H = 2000, 880
INK = "#222"
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 11)

# ---------------------------------------------------------------- helpers
def fmt(v):
    return str(int(round(v)))

def q(v, step):
    return round(round(v / step) * step, 2)

class Tree:
    """One tree = one <g opacity=...>. All the wood (trunk, branches, roots)
    is a single filled path with fill-rule nonzero, so overlapping pieces
    never darken each other; needles are straight strokes grouped by
    (width, opacity) into shared <path>s to keep the file small."""
    def __init__(self, opacity, wood_op=0.6):
        self.opacity, self.wood_op = opacity, wood_op
        self.lines = defaultdict(list)    # (w, op) -> path fragments
        self.wood = []                    # closed outlines

    def line(self, x1, y1, x2, y2, w, op):
        w, op = q(w, 0.2), q(op, 0.05)
        if w <= 0 or op <= 0:
            return
        self.lines[(w, op)].append(
            f"M{fmt(x1)} {fmt(y1)}l{fmt(x2 - x1)} {fmt(y2 - y1)}")

    def shape(self, ring):
        self.wood.append("M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in ring) + "Z")

    def svg(self):
        out = [f'<g opacity="{self.opacity:g}">']
        if self.wood:
            out.append(f'<path fill="{INK}" opacity="{self.wood_op:g}" d="{"".join(self.wood)}"/>')
        if self.lines:
            out.append(f'<g fill="none" stroke="{INK}">')
            for (w, op), frags in sorted(self.lines.items()):
                out.append(f'<path stroke-width="{w:g}" opacity="{op:g}" d="{"".join(frags)}"/>')
            out.append("</g>")
        out.append("</g>")
        return "".join(out)

def cubic(p0, p1, p2, p3, t):
    a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])

def catmull(pts):
    """Smooth cubic segments through pts (Catmull-Rom -> Bezier)."""
    segs = []
    n = len(pts)
    for i in range(n - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < n else pts[i + 1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        segs.append((p1, c1, c2, p2))
    return segs

def sample_chain(segs, per_seg=12):
    pts = []
    for k, (p0, c1, c2, p3) in enumerate(segs):
        for i in range(per_seg + (1 if k == len(segs) - 1 else 0)):
            pts.append(cubic(p0, c1, c2, p3, i / per_seg))
    return pts

def outline(pts, width_at, round_ends=True):
    """Closed ring around polyline pts; width_at(t) gives the full width at
    t in [0, 1]. Ends are rounded. Orientation is always the same relative
    to the direction of travel, so all rings union under fill-rule nonzero."""
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
        w = width_at(i / (n - 1)) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    def cap(i, sign):
        x, y = pts[i]
        j = i + 1 if i == 0 else i - 1
        dx, dy = (pts[i][0] - pts[j][0]), (pts[i][1] - pts[j][1])
        L = math.hypot(dx, dy) or 1
        ux, uy = dx / L, dy / L
        w = width_at(i / (n - 1)) / 2
        arc = []
        for k in range(1, 6):
            a = math.pi * k / 6
            # rotate from -normal through the travel direction to +normal
            cx = ux * math.sin(a) * sign
            cy = uy * math.sin(a) * sign
            nxk, nyk = -uy, ux
            c = math.cos(a)
            arc.append((x + (nxk * -c + cx) * w * sign, y + (nyk * -c + cy) * w * sign))
        return arc
    ring = left + (cap(n - 1, 1) if round_ends else []) + right[::-1] + (cap(0, -1) if round_ends else [])
    return ring

def trunk(tree, pts, w0, w1, fade=None):
    """Trunk: one tapered shape along a smooth chain through pts (BASE ->
    TOP). fade=(y_full, y_zero): the shape narrows to nothing between those
    heights, so distant trunks dissolve into the mist."""
    chain = sample_chain(catmull(pts), 14)
    def width_at(t):
        w = w0 + (w1 - w0) * t
        w *= 1 + 0.45 * max(0.0, 1 - t / 0.07) ** 2          # flare at the base
        if fade:
            y = chain[min(len(chain) - 1, int(t * (len(chain) - 1)))][1]
            w *= max(0.0, min(1.0, (fade[1] - y) / (fade[1] - fade[0]))) ** 0.7
        return w
    tree.shape(outline(chain, width_at))
    if fade:
        # a few pale streaks continue below the fade, hinting at the trunk
        for _ in range(3):
            i0 = random.randint(0, len(chain) // 4)
            i1 = i0 + random.randint(3, 8)
            for i in range(i0, min(i1, len(chain) - 1)):
                (x0, y0), (x1, y1) = chain[i], chain[i + 1]
                o = random.uniform(-0.3, 0.3) * w0
                tree.line(x0 + o, y0, x1 + o, y1, random.uniform(1.5, 3), 0.3)

def trunk_x(pts, y):
    """x of the trunk polyline (base -> top) at height y."""
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        lo, hi = min(y0, y1), max(y0, y1)
        if lo <= y <= hi:
            return x0 + (x1 - x0) * ((y - y0) / (y1 - y0) if y1 != y0 else 0)
    return pts[0][0] if y > pts[0][1] else pts[-1][0]

def branch(tree, start, end, rise, w0, w1, droop=0.06):
    """A pine branch: leaves `start` climbing (by `rise` over the first
    third), levels out and droops slightly into `end`. Returns a function
    t -> point along it."""
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    L = math.hypot(dx, dy)
    c1 = (sx + dx * 0.28, sy + dy * 0.1 - rise)
    c2 = (sx + dx * 0.7, sy + dy * 0.75 + L * droop)
    pts = [cubic(start, c1, c2, end, i / 16) for i in range(17)]
    tree.shape(outline(pts, lambda t: w0 + (w1 - w0) * t))
    return lambda t: cubic(start, c1, c2, end, t)

def twig(tree, start, length, direction, w):
    """Short curved twig from a branch; returns its tip."""
    a = math.radians(direction)
    end = (start[0] + length * math.cos(a), start[1] + length * math.sin(a))
    c1 = (start[0] + length * 0.3 * math.cos(a) + random.uniform(-5, 5),
          start[1] + length * 0.3 * math.sin(a) + 3)
    c2 = (start[0] + length * 0.7 * math.cos(a), start[1] + length * 0.7 * math.sin(a) - 2)
    pts = [cubic(start, c1, c2, end, i / 8) for i in range(9)]
    tree.shape(outline(pts, lambda t: w * (1 - 0.5 * t)))
    return end

def fan(tree, x, y, direction, L, n=None, arc=54, width=(1.4, 4.0),
        spread=(16, 8), op=(0.6, 1.0), along=0.0):
    """A needle cluster: n straight strokes radiating from a small scattered
    base at (x, y) over `arc` degrees centred on `direction` (degrees, -90 =
    up); lengths ~35-100% of L. `along` (degrees) elongates the base along
    that direction, so clusters sit on a branch rather than a point."""
    n = n or int(L * 2.6)
    ca, sa = math.cos(math.radians(along)), math.sin(math.radians(along))
    for _ in range(n):
        a = math.radians(direction + random.uniform(-arc / 2, arc / 2) + random.gauss(0, 2))
        r = random.random() ** 0.7
        length = L * (0.3 + 0.7 * r) * random.uniform(0.85, 1.05)
        while True:                                   # elliptical base, denser centre
            u, v = random.uniform(-1, 1), random.uniform(-1, 1)
            if u * u + v * v <= 1:
                break
        u, v = u * spread[0], v * spread[1]
        x0, y0 = x + u * ca - v * sa, y + u * sa + v * ca
        tree.line(x0, y0, x0 + length * math.cos(a), y0 + length * math.sin(a),
                  random.uniform(*width), random.uniform(*op))

def foliage_mass(tree, tpts, cx, cy, w, h, fan_L, wood=(9, 4), n_mult=1.0,
                 arc=54, fan_w=(1.4, 4.0), hang=0.5, level=0.5):
    """A horizontal mass of foliage around (cx, cy), w wide, h tall, hung
    on branches leaving the trunk polyline tpts. `level` is the mass's
    height within the crown (0 = top, 1 = bottom): upper branches rise,
    lower ones droop. Fans sit close together along each branch, on twigs
    rising above it and hanging below it, so the mass is layered, ragged
    and asymmetric; the two sides leave the trunk at different heights."""
    tx = trunk_x(tpts, cy)
    sides = []
    left, right = cx - w / 2, cx + w / 2
    if left < tx - 20:
        sides.append((-1, tx - left))
    if right > tx + 20:
        sides.append((1, right - tx))
    if not sides:
        sides.append((1 if cx >= tx else -1, w / 2))
    random.shuffle(sides)
    for k_side, (s, reach) in enumerate(sides):
        stagger = (k_side - 0.5) * h * 0.5 if len(sides) > 1 else 0
        sy = cy + h * random.uniform(0.2, 0.45) + stagger
        ey = cy + random.uniform(-h * 0.1, h * 0.2) + stagger * 0.5
        start, end = (tx, sy), (tx + s * reach, ey)
        rise = reach * (0.24 - 0.34 * level) + random.uniform(-0.04, 0.04) * reach
        w0 = wood[0] * min(1.0, reach / 80) + wood[1]
        at = branch(tree, start, end, rise, w0, wood[1] * 0.8,
                    droop=0.04 + 0.1 * level)
        # small fan at the junction with the trunk
        jx, jy = at(0.14)
        fan(tree, jx, jy - 2, -90 + s * random.uniform(-10, 20), fan_L * 0.7,
            n=int(fan_L * 1.3 * n_mult), arc=arc, width=fan_w, spread=(10, 6))
        n_fans = max(2, int(reach / 24))
        for k in range(n_fans):
            t = 1.0 - k / n_fans * 0.68 + random.uniform(-0.04, 0.04)
            px, py = at(t)
            qx, qy = at(min(1.0, t + 0.05))
            slope = math.degrees(math.atan2(qy - py, qx - px))
            tilt = s * (2 + 28 * t) + random.uniform(-10, 10)
            L = fan_L * random.uniform(0.75, 1.15) * (0.85 + 0.15 * t)
            fan(tree, px, py - 3, -90 + tilt, L, n=int(L * 1.7 * n_mult),
                arc=arc + random.uniform(-8, 12), width=fan_w, along=slope,
                spread=(18, 7))
            # twigs rising off the branch carry smaller fans (fills the height)
            if h > 36 and random.random() < 0.8:
                e = twig(tree, (px - s * 6, py), h * random.uniform(0.28, 0.5),
                         -90 + s * random.uniform(10, 50), wood[1] * 0.7)
                fan(tree, e[0], e[1], -90 + tilt * 0.6, L * random.uniform(0.6, 0.8),
                    n=int(L * 1.1 * n_mult), arc=arc - 8, width=fan_w, spread=(12, 6))
            # strands hanging under the branch
            if random.random() < hang:
                fan(tree, px + random.uniform(-6, 6), py + 4, 90 + s * random.uniform(-5, 25),
                    L * random.uniform(0.45, 0.7), n=int(L * 0.7 * n_mult), arc=36,
                    width=fan_w, op=(0.4, 0.8), spread=(14, 4))

def roots(tree, x, y, w, n=3):
    for _ in range(n):
        s = random.choice((-1, 1))
        L = random.uniform(28, 70)
        p0 = (x + s * random.uniform(0, 8), y - random.uniform(0, 12))
        end = (x + s * L, y + random.uniform(4, 14))
        c1 = (x + s * L * 0.3, y - random.uniform(4, 14))
        c2 = (x + s * L * 0.7, y + random.uniform(-6, 8))
        pts = [cubic(p0, c1, c2, end, i / 8) for i in range(9)]
        wr = random.uniform(w * 0.6, w * 0.95)
        tree.shape(outline(pts, lambda t, wr=wr: wr * (1 - 0.75 * t)))

def pine(opacity, tpts, wood=(22, 9), masses=(), fan_L=44, wood_op=0.6, fade=None,
         n_mult=1.0, root=0, twig_w=4, arc=54, fan_w=(1.4, 4.0), hang=0.5):
    """A whole tree: trunk polyline tpts (base -> top), widths wood=(base,
    top), and foliage masses (cx, cy, w, h[, fan-length multiplier])."""
    t = Tree(opacity, wood_op)
    trunk(t, tpts, wood[0], wood[1], fade=fade)
    if root:
        roots(t, tpts[0][0], tpts[0][1], wood[0] * 0.55, n=root)
    if masses:
        ys = [m[1] for m in masses]
        lo, hi = min(ys), max(ys)
        for m in masses:
            cx, cy, w, h = m[:4]
            Lm = m[4] if len(m) > 4 else 1.0
            level = (cy - lo) / (hi - lo) if hi > lo else 0.5
            foliage_mass(t, tpts, cx, cy, w, h, fan_L * Lm, wood=(wood[1] * 1.2, twig_w),
                         n_mult=n_mult, arc=arc, fan_w=fan_w, hang=hang, level=level)
        # fans sitting against the trunk between the masses hide the pole
        y = hi + 10
        while y > lo - 10:
            x = trunk_x(tpts, y)
            s = random.choice((-1, 1))
            fan(t, x + s * 6, y, -90 + s * random.uniform(5, 35), fan_L * random.uniform(0.55, 0.8),
                n=int(fan_L * 1.0 * n_mult), arc=arc, width=fan_w, spread=(12, 6))
            y -= random.uniform(30, 48)
    # the leader: needles at the very top of the trunk
    ax, ay = tpts[-1]
    fan(t, ax, ay + 2, -90 + random.uniform(-12, 12), fan_L * 0.8,
        n=int(fan_L * 1.4 * n_mult), arc=arc, width=fan_w, spread=(9, 5))
    return t

# ---------------------------------------------------------------- composition
trees = []

# ---- far left: the misty group (panels 1-2), four pale overlapping pines
FAR = dict(fan_L=50, wood_op=0.5, n_mult=0.45, twig_w=3, fan_w=(1.6, 4.5), hang=0.35)
trees.append(pine(0.16, [(268, 560), (266, 420), (262, 290), (258, 190)], wood=(11, 4),
                  masses=[(262, 195, 120, 44), (248, 250, 150, 52), (274, 308, 130, 46), (266, 352, 90, 34)],
                  fade=(380, 560), **FAR))
trees.append(pine(0.2, [(338, 580), (340, 440), (346, 270), (348, 150)], wood=(12, 4),
                  masses=[(345, 158, 90, 38), (358, 214, 150, 54), (334, 272, 150, 54), (362, 328, 110, 42),
                          (350, 372, 80, 30)],
                  fade=(410, 580), **FAR))
trees.append(pine(0.17, [(474, 560), (470, 430), (474, 300), (470, 210)], wood=(11, 4),
                  masses=[(472, 222, 110, 42), (458, 278, 160, 54), (482, 334, 130, 46), (476, 382, 90, 34)],
                  fade=(390, 560), **FAR))
trees.append(pine(0.12, [(420, 520), (416, 400), (410, 290), (404, 240)], wood=(9, 3),
                  masses=[(404, 250, 100, 40), (416, 300, 120, 44), (426, 350, 90, 34)],
                  fade=(360, 520), **FAR))

# ---- second rank: the tall pine peeking above the dark group, and one
# between the far group and the cluster
MID = dict(fan_L=46, wood_op=0.6, n_mult=0.6, twig_w=3.5, fan_w=(1.3, 3.6), hang=0.4)
trees.append(pine(0.3, [(586, 570), (588, 380), (582, 150), (578, 70)], wood=(12, 5),
                  masses=[(580, 90, 80, 36), (566, 140, 120, 48), (592, 190, 100, 42), (585, 236, 70, 30)],
                  fade=(330, 570), **MID))
trees.append(pine(0.24, [(508, 540), (505, 430), (503, 280), (500, 220)], wood=(10, 4),
                  masses=[(502, 240, 100, 42), (516, 292, 130, 48), (505, 340, 90, 34)],
                  fade=(350, 540), **MID))

# ---- second rank behind the dark group (panels 3-4)
trees.append(pine(0.3, [(960, 540), (953, 420), (946, 290), (940, 110)], wood=(13, 5),
                  masses=[(940, 140, 90, 38), (960, 200, 140, 54), (930, 262, 140, 52), (905, 322, 100, 42),
                          (930, 364, 70, 28)],
                  fade=(380, 540), **MID))
trees.append(pine(0.2, [(1052, 500), (1050, 400), (1048, 262), (1050, 190)], wood=(10, 4),
                  masses=[(1058, 226, 110, 46), (1040, 282, 120, 42)],
                  fade=(340, 500), **MID))

# ---- the dark group (panels 2-3): four trunks, base -> top
NEAR = dict(fan_L=46, wood_op=0.55, n_mult=0.85, twig_w=4, fan_w=(1.0, 2.8), hang=0.55)
# companions first (behind), the main tree last (on top)
trees.append(pine(0.6, [(858, 806), (862, 680), (850, 540), (848, 410)], wood=(15, 6),
                  masses=[(880, 618, 130, 60), (862, 456, 80, 32), (876, 372, 70, 30)],
                  root=2, **NEAR))
trees.append(pine(0.7, [(640, 800), (650, 700), (644, 560), (652, 440)], wood=(17, 7),
                  masses=[(636, 522, 150, 60), (600, 572, 80, 32), (646, 626, 70, 30)],
                  root=3, **NEAR))
trees.append(pine(0.8, [(704, 812), (700, 700), (712, 520), (710, 350), (706, 300)], wood=(21, 8),
                  masses=[(700, 306, 90, 40), (720, 470, 60, 28)],
                  root=3, **NEAR))
trees.append(pine(0.92, [(774, 816), (766, 680), (774, 500), (768, 330), (766, 150)], wood=(26, 7),
                  masses=[(766, 150, 90, 42, 0.85), (770, 224, 190, 84), (796, 322, 240, 92),
                          (742, 402, 115, 44)],
                  root=4, **NEAR))

# ---- right group (panels 5-6)
# faint one to the left of the group
trees.append(pine(0.14, [(1670, 480), (1662, 360), (1656, 230), (1650, 190)], wood=(10, 4),
                  masses=[(1652, 208, 100, 42), (1666, 262, 120, 46)],
                  fade=(300, 480), **FAR))
# tall faint pine behind, crown poking above the main one
trees.append(pine(0.28, [(1772, 560), (1758, 400), (1745, 170), (1742, 110)], wood=(12, 5),
                  masses=[(1742, 128, 90, 38), (1735, 182, 130, 48), (1760, 232, 80, 32)],
                  fade=(340, 560), **MID))
# pine at the far right edge
trees.append(pine(0.26, [(1990, 560), (1980, 420), (1968, 260), (1962, 180)], wood=(12, 5),
                  masses=[(1962, 200, 90, 38), (1975, 256, 110, 46), (1980, 310, 80, 32)],
                  fade=(340, 560), **MID))
# faint trunk standing behind-left of the main pine
trees.append(pine(0.3, [(1672, 816), (1682, 640), (1692, 470), (1690, 440)], wood=(14, 7),
                  masses=[(1672, 480, 90, 38)], **MID))
# a thinner companion trunk beside the main one
trees.append(pine(0.5, [(1846, 812), (1838, 700), (1830, 560), (1826, 520)], wood=(12, 6),
                  masses=[(1856, 640, 60, 26)], root=2, **NEAR))

# the main right pine: dark crown, leaning trunk, long branch sweeping down-left
main_r = pine(0.88, [(1892, 816), (1876, 700), (1862, 560), (1842, 390), (1824, 250)], wood=(22, 7),
              masses=[(1818, 268, 70, 36, 0.85), (1824, 334, 150, 80), (1838, 410, 120, 50),
                      (1762, 362, 70, 40)],
              root=4, **NEAR)
# the long sweeping branch, hung with fans along its length
at = branch(main_r, (1860, 520), (1632, 616), -10, 8, 3, droop=0.12)
for k, t in enumerate((1.0, 0.86, 0.72, 0.58, 0.44, 0.3)):
    px, py = at(t)
    L = 44 * random.uniform(0.85, 1.05)
    fan(main_r, px, py - 2, -90 - (10 + 16 * t) + random.uniform(-5, 5), L, n=int(L * 1.8), arc=54, width=(1.0, 2.8))
    if k % 2 == 0:
        e = twig(main_r, (px + 6, py), random.uniform(16, 30), -90 + random.uniform(-40, 10), 3)
        fan(main_r, e[0], e[1], -95, L * 0.7, n=int(L * 1.2), arc=48, width=(1.0, 2.8))
    else:
        e = twig(main_r, (px, py + 2), random.uniform(18, 34), 90 + random.uniform(-30, 30), 3)
        fan(main_r, e[0], e[1], -90 + random.uniform(-20, 20), L * 0.75, n=int(L * 1.3), arc=50, width=(1.0, 2.8))
    fan(main_r, px, py + 4, 95, L * 0.55, n=int(L * 0.7), arc=36, op=(0.4, 0.8), spread=(14, 4), width=(1.0, 2.8))
at2 = branch(main_r, (1864, 480), (1962, 598), -8, 6, 3, droop=0.1)
for t in (1.0, 0.75, 0.5):
    px, py = at2(t)
    fan(main_r, px, py - 2, -90 + 12 * t, 40, n=72, arc=52, width=(1.0, 2.8))
trees.append(main_r)

# ---------------------------------------------------------------- output
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
       '<!-- After Hasegawa Tohaku, Pine Trees (Shorin-zu byobu, right screen), '
       'c. 1595. Generated by tools/gen-tohaku-pines.py - edit and re-run that '
       'script rather than this file. -->'
       + "".join(t.svg() for t in trees) + '</svg>')
out = sys.argv[1] if len(sys.argv) > 1 else "tohaku-pines.svg"
with open(out, "w") as f:
    f.write(svg)
n_lines = sum(len(v) for t in trees for v in t.lines.values())
print(f"wrote {out}: {len(svg)/1024:.0f} KB, {len(trees)} trees, {n_lines} needles")
