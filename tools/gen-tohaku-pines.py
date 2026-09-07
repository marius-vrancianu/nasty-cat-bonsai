#!/usr/bin/env python3
"""Generate src/assets/img/tohaku-pines.svg: a vector after Hasegawa Tohaku's
"Pine Trees" (Shorin-zu byobu, right screen, c. 1595), drawn in the same
vocabulary as the site's original pine-trees.svg.

    python3 tools/gen-tohaku-pines.py src/assets/img/tohaku-pines.svg [seed]

Vocabulary (borrowed from pine-trees.svg): one <g> per tree at its own
opacity - overlapping trees at different opacities give the mist, no blur
filters; trunks are thick round-capped cubic curves; branches are thinner
curves that leave the trunk level near the top and droop more and more
toward the base, as on an old pine; every branch tip carries a fan
of a few hundred straight needles radiating over a 40-60 degree arc from a
small scattered base. Composition coordinates follow the painting, except
that the empty middle panels are closed up: the right group sits 520 px
closer than in the 2000 x 880 layout of the screen, on a 1480 x 880
canvas, so the mistiest trees of the two groups overlap. All ink is #222,
so the file also works as the dark-theme alpha mask. Deterministic per seed;
standard library only.
"""
import math
import random
import sys
from collections import defaultdict

W, H = 1480, 880
INK = "#222"
random.seed(int(sys.argv[2]) if len(sys.argv) > 2 else 11)

# ---------------------------------------------------------------- helpers
def fmt(v):
    return str(int(round(v)))

def q(v, step):
    return round(round(v / step) * step, 2)

class Tree:
    """One tree = one <g opacity=...>. All the wood (trunk and branches)
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

def outline(pts, width_at, round_ends=True, round_start=None):
    """Closed ring around polyline pts; width_at(t) gives the full width at
    t in [0, 1]. Ends are rounded (round_start=False cuts the start flat).
    Orientation is always the same relative to the direction of travel, so
    all rings union under fill-rule nonzero."""
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
    if round_start is None:
        round_start = round_ends
    ring = left + (cap(n - 1, 1) if round_ends else []) + right[::-1] + (cap(0, -1) if round_start else [])
    return ring

def trunk(tree, pts, w0, w1, fade=None):
    """Trunk: one tapered shape along a smooth chain through pts (BASE ->
    TOP). fade=(y_full, y_zero): the shape narrows to nothing between those
    heights, so distant trunks dissolve into the mist."""
    chain = sample_chain(catmull(pts), 14)
    def width_at(t):
        w = w0 + (w1 - w0) * t
        if fade:
            y = chain[min(len(chain) - 1, int(t * (len(chain) - 1)))][1]
            w *= max(0.0, min(1.0, (fade[1] - y) / (fade[1] - fade[0]))) ** 0.7
        return w
    tree.shape(outline(chain, width_at, round_start=False))
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
                 arc=54, fan_w=(1.4, 4.0), hang=0.5, level=0.5, bias=1):
    """A horizontal mass of foliage around (cx, cy), w wide, h tall, hung
    on branches leaving the trunk polyline tpts. `level` is the mass's
    height within the crown (0 = top, 1 = bottom): the top branches run
    level or dip a little, and each lower one leaves the trunk higher and
    hangs more steeply, like an old pine. `bias` (+1/-1) is the side the
    tree favours - its branches reach further there. Fans sit close
    together along each branch, on twigs rising above it and hanging below
    it. The two sides leave the trunk at different heights, one side is
    sometimes missing, and every reach is jittered, so no two masses match."""
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
    if len(sides) > 1 and random.random() < 0.18:
        sides.pop()                                   # the odd one-sided tier
    for k_side, (s, reach) in enumerate(sides):
        reach *= random.uniform(0.7, 1.25) * (1.15 if s == bias else 0.88)
        reach *= 1 + 0.33 * level ** 1.5                 # the lowest tiers reach furthest
        stagger = (k_side - 0.5) * h * random.uniform(0.3, 0.9) if len(sides) > 1 else 0
        # the branch leaves the trunk above the mass and comes down into it
        sy = cy - h * (0.1 + 0.6 * level) + stagger
        ey = cy + h * (0.1 + 0.45 * level) + stagger * 0.5 + random.uniform(-0.1, 0.1) * h
        start, end = (tx, sy), (tx + s * reach, ey)
        # negative rise = the branch sets off downward; steeper lower down
        rise = -reach * (0.02 + 0.42 * level ** 1.2) + random.uniform(-0.03, 0.03) * reach
        w0 = wood[0] * 0.7 * min(1.0, reach / 80) + wood[1] * 0.8
        at = branch(tree, start, end, rise, w0, wood[1] * 0.6,
                    droop=0.03 + 0.2 * level)
        # small fan at the junction with the trunk
        jx, jy = at(0.14)
        fan(tree, jx, jy - 2, -90 + s * random.uniform(-10, 20), fan_L * 0.7,
            n=int(fan_L * 1.3 * n_mult), arc=arc, width=fan_w, spread=(10, 6))
        n_fans = max(2, int(reach / 24))
        for k in range(n_fans):
            t = 1.0 - k / n_fans * 0.76 + random.uniform(-0.04, 0.04)
            px, py = at(t)
            qx, qy = at(min(1.0, t + 0.05))
            slope = math.degrees(math.atan2(qy - py, qx - px))
            tilt = s * (2 + 22 * t) + random.uniform(-10, 10)
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

def pine(opacity, tpts, wood=(22, 9), masses=(), fan_L=44, wood_op=0.6, fade=None,
         n_mult=1.0, twig_w=4, arc=54, fan_w=(1.4, 4.0), hang=0.5):
    """A whole tree: trunk polyline tpts (base -> top), widths wood=(base,
    top), and foliage masses (cx, cy, w, h[, fan-length multiplier])."""
    t = Tree(opacity, wood_op)
    trunk(t, tpts, wood[0], wood[1], fade=fade)
    bias = random.choice((-1, 1))                     # the side this tree favours
    if masses:
        ys = [m[1] for m in masses]
        lo, hi = min(ys), max(ys)
        for m in masses:
            cx, cy, w, h = m[:4]
            Lm = m[4] if len(m) > 4 else 1.0
            level = (cy - lo) / (hi - lo) if hi > lo else 0.5
            cy += random.uniform(-0.25, 0.25) * h     # irregular spacing of the tiers
            foliage_mass(t, tpts, cx, cy, w, h, fan_L * Lm, wood=(wood[1] * 1.2, twig_w),
                         n_mult=n_mult, arc=arc, fan_w=fan_w, hang=hang, level=level,
                         bias=bias)
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
FAR = dict(fan_L=50, wood_op=0.5, n_mult=0.225, twig_w=3, fan_w=(1.6, 4.5), hang=0.35)
trees.append(pine(0.16, [(268, 560), (266, 430), (262, 320), (256, 236)], wood=(11, 4),
                  masses=[(262, 240, 110, 42), (246, 292, 160, 54), (276, 350, 120, 44)],
                  fade=(380, 560), **FAR))
trees.append(pine(0.2, [(338, 580), (340, 440), (346, 270), (350, 118)], wood=(12, 4),
                  masses=[(348, 126, 70, 32), (360, 186, 150, 54), (332, 262, 170, 56), (364, 330, 100, 40),
                          (350, 386, 70, 28)],
                  fade=(410, 580), **FAR))
trees.append(pine(0.17, [(474, 560), (470, 430), (474, 300), (470, 210)], wood=(11, 4),
                  masses=[(472, 222, 110, 42), (458, 278, 160, 54), (482, 334, 130, 46), (476, 382, 90, 34)],
                  fade=(390, 560), **FAR))
trees.append(pine(0.12, [(420, 520), (416, 420), (410, 340), (404, 296)], wood=(9, 3),
                  masses=[(404, 306, 100, 40), (420, 362, 130, 46)],
                  fade=(360, 520), **FAR))

# ---- second rank: the tall pine peeking above the dark group, and one
# between the far group and the cluster
MID = dict(fan_L=46, wood_op=0.6, n_mult=0.3, twig_w=3.5, fan_w=(1.3, 3.6), hang=0.4)
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
NEAR = dict(fan_L=46, wood_op=0.55, n_mult=0.57, twig_w=4, fan_w=(1.0, 2.8), hang=0.55)
# companions first (behind), the main tree last (on top)
trees.append(pine(0.6, [(858, 806), (862, 690), (852, 580), (848, 476)], wood=(15, 6),
                  masses=[(884, 622, 140, 62), (866, 500, 90, 36)], **NEAR))
trees.append(pine(0.7, [(640, 800), (650, 700), (644, 560), (654, 404)], wood=(17, 7),
                  masses=[(650, 420, 90, 36), (630, 522, 160, 62), (600, 578, 80, 32), (646, 630, 70, 30)], **NEAR))
trees.append(pine(0.8, [(704, 812), (700, 700), (712, 520), (710, 350), (704, 246)], wood=(21, 8),
                  masses=[(696, 262, 80, 36), (700, 330, 100, 42), (722, 470, 60, 28)], **NEAR))
trees.append(pine(0.92, [(774, 816), (766, 680), (774, 500), (768, 330), (766, 150)], wood=(26, 7),
                  masses=[(766, 150, 90, 42, 0.85), (774, 222, 200, 84), (798, 322, 250, 92),
                          (748, 410, 120, 46)], **NEAR))

# ---- right group (panels 5-6)
# faint one to the left of the group
trees.append(pine(0.14, [(1150, 480), (1142, 360), (1136, 230), (1130, 190)], wood=(10, 4),
                  masses=[(1132, 208, 100, 42), (1146, 262, 120, 46)],
                  fade=(50, 480), **FAR))
# tall faint pine behind, crown poking above the main one
trees.append(pine(0.28, [(1252, 560), (1238, 400), (1225, 170), (1222, 110)], wood=(12, 5),
                  masses=[(1222, 128, 90, 38), (1215, 182, 130, 48), (1240, 232, 80, 32)],
                  fade=(90, 560), **MID))
# pine at the far right edge
trees.append(pine(0.26, [(1470, 560), (1460, 420), (1448, 300), (1444, 226)], wood=(12, 5),
                  masses=[(1444, 240, 90, 38), (1456, 296, 120, 46), (1462, 350, 80, 32)],
                  fade=(90, 560), **MID))
# faint trunk standing behind-left of the main pine
trees.append(pine(0.3, [(1152, 816), (1162, 640), (1172, 470), (1170, 440)], wood=(14, 7),
                  masses=[(1152, 480, 90, 38)], **MID))
# a thinner companion trunk beside the main one
trees.append(pine(0.5, [(1326, 812), (1318, 700), (1312, 600), (1308, 566)], wood=(12, 6),
                  masses=[(1336, 650, 70, 28)], **NEAR))

# the main right pine: dark crown, leaning trunk, long branch sweeping down-left
main_r = pine(0.88, [(1372, 816), (1356, 700), (1342, 560), (1322, 390), (1304, 250)], wood=(22, 7),
              masses=[(1298, 268, 70, 36, 0.85), (1304, 334, 150, 80), (1318, 410, 120, 50),
                      (1242, 362, 70, 40)], **NEAR)
# the long sweeping branch, hung with fans along its length
at = branch(main_r, (1340, 520), (1112, 616), -10, 8, 3, droop=0.12)
for k, t in enumerate((1.0, 0.86, 0.72, 0.58, 0.44, 0.3)):
    px, py = at(t)
    L = 44 * random.uniform(0.85, 1.05)
    fan(main_r, px, py - 2, -90 - (10 + 16 * t) + random.uniform(-5, 5), L, n=int(L * 1.2), arc=54, width=(1.0, 2.8))
    if k % 2 == 0:
        e = twig(main_r, (px + 6, py), random.uniform(16, 30), -90 + random.uniform(-40, 10), 3)
        fan(main_r, e[0], e[1], -95, L * 0.7, n=int(L * 0.8), arc=48, width=(1.0, 2.8))
    else:
        e = twig(main_r, (px, py + 2), random.uniform(18, 34), 90 + random.uniform(-30, 30), 3)
        fan(main_r, e[0], e[1], -90 + random.uniform(-20, 20), L * 0.75, n=int(L * 0.87), arc=50, width=(1.0, 2.8))
    fan(main_r, px, py + 4, 95, L * 0.55, n=int(L * 0.47), arc=36, op=(0.4, 0.8), spread=(14, 4), width=(1.0, 2.8))
at2 = branch(main_r, (1344, 480), (1442, 598), -8, 6, 3, droop=0.1)
for t in (1.0, 0.75, 0.5):
    px, py = at2(t)
    fan(main_r, px, py - 2, -90 + 12 * t, 40, n=48, arc=52, width=(1.0, 2.8))
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
