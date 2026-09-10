#!/usr/bin/env python3
"""Generate the homepage's brush-stroke rules from the stock stroke sheet.

    python3 tools/gen-brush-rules.py

Input is tools/brush-strokes-source.ai, a sheet of free vector brush
strokes. Despite the extension it is a PDF - Illustrator writes a
PDF-compatible stream and nothing here reads the private AI part - so the
whole file is one page whose content stream is 1243 filled shapes, each a
separate stroke wrapped in its own q/cm ... f* Q block.

Seven of those become the marks on the home page. The wide layout gets one
long vertical for the line between the picture and the nav and three
horizontals, one per link; the narrow one, which has no vertical to hang a
rule off, gets three underlines instead, each under part of its word.
The rest of the sheet is left alone, which is why the source is kept whole
rather than trimmed to what is used - picking different strokes later is a
matter of changing the numbers in PICKS.

The rules are drawn as CSS masks over the accent colour, the same way dark
mode paints the pines, so what these files carry is alpha and nothing else:
a white path whose opacity falls off at the ends. That does two jobs at
once. The colour stays in the stylesheet, so a stroke is rust on paper and
olive on ink without a second copy of the file; and the fade that the plain
1px rules used to get from a CSS gradient is baked into the same channel,
so the mask carries both the shape of the brush and where it dies out.

Each stroke is stretched to whatever box the stylesheet gives it
(preserveAspectRatio="none" plus mask-size: 100% 100%), which is a violent
squash: a horizontal is about 320x25 in the sheet and lands in roughly
290x3, and the vertical goes from 48x431 to 3x910. Nothing about the
stroke's texture survives that except its silhouette, which is the point -
what reads at three pixels is the taper, the slight wander off straight,
and the ragged end. It also means the specks that make up the dry-brush
edge cost bytes without drawing anything, so DROP_PX throws away every
subpath too small to reach a fraction of a pixel once squashed.
"""

import math
import os
import random
import re
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "brush-strokes-source.ai")
OUT = os.path.join(HERE, os.pardir, "src", "assets", "img")

PAGE_H = 491.975          # the sheet's MediaBox height, for the y-flip

# Shape index in the content stream -> output. The three horizontals read
# left to right as about / blog / gallery. All three are fullest where they
# meet the vertical and thin away to the right, which is the direction the
# fade runs anyway, and no two are alike: #1 leaves a hooked, loaded start,
# #2 lifts and bends early, #208 runs dry and breaks into flecks.
#
# They were picked for that character alone. An earlier round picked partly
# on weight, because stretching a stroke's bounding box to the rule's
# equalises its widest point and nothing else, so strokes that look alike
# on the sheet can differ by a third in the ink they lay down. Normalising
# the thickness against the measured envelope rather than the bounding box
# settles that on its own - every stroke now fills the same share of the
# box at its fullest - which frees the choice to be about the mark.
PICKS = {
    "brush-spine.svg":  dict(shape=693, axis="v", target=(3, 910),
                             stops=[(0.0, 0.0), (0.12, 1.0), (0.88, 1.0), (1.0, 0.0)]),
    "brush-rule-1.svg": dict(shape=1,   axis="h", target=(290, 3),
                             stops=[(0.45, 1.0), (1.0, 0.0)]),
    "brush-rule-2.svg": dict(shape=2,   axis="h", target=(290, 3),
                             stops=[(0.45, 1.0), (1.0, 0.0)]),
    "brush-rule-3.svg": dict(shape=208, axis="h", target=(290, 3),
                             stops=[(0.45, 1.0), (1.0, 0.0)]),

    # The mobile underlines: the same three strokes under part of each word,
    # where there is no vertical for a rule to hang off. Two differences.
    # They carry no fade - a rule crossing open paper has to die out
    # somewhere, but an underline ends where its word does, and the stroke's
    # own thinning tail is a better ending than a ramp laid over it. And the
    # targets are the spans they actually cover, a few dozen pixels rather
    # than a few hundred, which is what DROP_PX and its neighbours measure
    # against. That much shorter box also puts these far closer to the
    # sheet's own proportions than the desktop rules, which stretch a stroke
    # of aspect 12 across an aspect of 27 - so the brush reads more plainly
    # here, on the smaller screen, than it does on the larger one.
    #
    # That is also why they wander less. A rule crossing open paper can bend
    # a third of its own weight and read as a brush; the same bend under a
    # word reads as an underline that has slipped, because the word above it
    # is a straight edge to measure against. And the third stroke is not the
    # one under gallery on the wide layout: #208's dry tail is a fine ending
    # to a 300px rule and a mess in 62px, where the flecks are most of it.
    "brush-underline-1.svg": dict(shape=1,  axis="h", target=(85, 7),
                                  stops=[(0.0, 1.0), (1.0, 1.0)], wander=0.12),
    "brush-underline-2.svg": dict(shape=2,  axis="h", target=(55, 7),
                                  stops=[(0.0, 1.0), (1.0, 1.0)], wander=0.12),
    "brush-underline-3.svg": dict(shape=36, axis="h", target=(62, 7),
                                  stops=[(0.0, 1.0), (1.0, 1.0)], wander=0.12),
}

WANDER = 0.34    # share of a mark's BOX given over to the centreline moving,
                 # the rest being the stroke itself. main.css sizes each box
                 # by dividing the asked-for weight by (1 - this); the two
                 # must agree, so this prints the figure for every file it
                 # writes. PICKS may override it - the underlines do.
BINS = 200       # samples taken along a stroke to find that centreline
CURVE_STEPS = 8  # pieces each curve is cut into to take those samples
SMOOTH = 9       # bins averaged over, so amplifying it does not amplify noise

SPECKLE = 0.07   # share of a stroke's ink lifted back out as bare paper
FLECK = 0.14     # no fleck smaller than this: it would not survive rounding
CLUMP = 6.0      # flecks per cluster, on average - see flecks()
SEED = 8317      # fixed, so regenerating gives the same paper back

DROP_PX = 0.35   # a subpath thinner than this once squashed draws nothing
MIN_STEP = 0.12  # nor does a segment that goes nowhere once squashed
FLAT_PX = 0.08   # a curve bending less than this is written as a line


# ---------------------------------------------------------------- PDF bits

def content_stream(data):
    """Inflate the page's content stream.

    The file has no cross-reference table worth trusting after Illustrator
    has been at it, so objects are found by scanning for `N 0 obj`. The
    page is object 5 and its /Contents is 6; both are asserted rather than
    resolved, since this reads exactly one known file.
    """
    def body(num):
        m = re.search((r"(?<![0-9])%d\s+0\s+obj\b" % num).encode(), data)
        return data[m.end():data.find(b"endobj", m.end())]

    page = body(5)
    assert b"/Contents 6 0 R" in page, "unexpected page object"
    assert b"/MediaBox[0.0 0.0 672.066 491.975]" in page, "unexpected page size"

    b = body(6)
    raw = b[b.find(b"stream") + 6:].lstrip(b"\r\n")
    return zlib.decompress(raw[:raw.rfind(b"endstream")])


def mul(m, n):
    """Concatenate two PDF matrices, [a b c d e f] each."""
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return [a * A + b * C, a * B + b * D,
            c * A + d * C, c * B + d * D,
            e * A + f * C + E, e * B + f * D + F]


def apply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def shapes(txt):
    """Every filled path in the stream, in order, in page coordinates.

    Only the operators this sheet actually uses are handled; anything else
    (text, images, shading) would be silently skipped, and there is none.
    Points are pushed through the current transform as they are read, so a
    shape comes out flattened - the q/Q stack is only ever used to get back
    to the identity between strokes.
    """
    tok = re.findall(rb"(?:[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)|(?:[A-Za-z*']+)|[\[\]/]", txt)
    stack, ctm, ops = [], [1, 0, 0, 1, 0, 0], []
    out, path, sub = [], [], None
    x = y = sx = sy = 0.0

    for t in tok:
        s = t.decode("latin-1")
        try:                      # operands accumulate until an operator
            float(s)
            ops.append(s)
            continue
        except ValueError:
            pass
        n = [float(v) for v in ops]

        if s == "q":
            stack.append(list(ctm))
        elif s == "Q" and stack:
            ctm = stack.pop()
        elif s == "cm" and len(n) >= 6:
            ctm = mul(n[-6:], ctm)
        elif s == "m" and len(n) >= 2:
            x, y = n[-2:]
            sx, sy = x, y
            sub = [("M", [apply(ctm, x, y)])]
            path.append(sub)
        elif s == "l" and len(n) >= 2 and sub is not None:
            x, y = n[-2:]
            sub.append(("L", [apply(ctm, x, y)]))
        elif s == "c" and len(n) >= 6 and sub is not None:
            a, b, c, d, e, f = n[-6:]
            sub.append(("C", [apply(ctm, a, b), apply(ctm, c, d), apply(ctm, e, f)]))
            x, y = e, f
        elif s == "v" and len(n) >= 4 and sub is not None:
            c, d, e, f = n[-4:]                      # current point doubles
            sub.append(("C", [apply(ctm, x, y), apply(ctm, c, d), apply(ctm, e, f)]))
            x, y = e, f
        elif s == "y" and len(n) >= 4 and sub is not None:
            a, b, e, f = n[-4:]                      # end point doubles
            sub.append(("C", [apply(ctm, a, b), apply(ctm, e, f), apply(ctm, e, f)]))
            x, y = e, f
        elif s == "re" and len(n) >= 4:
            X, Y, W, H = n[-4:]
            box = [(X, Y), (X + W, Y), (X + W, Y + H), (X, Y + H)]
            sub = ([("M", [apply(ctm, *box[0])])]
                   + [("L", [apply(ctm, *p)]) for p in box[1:]] + [("Z", [])])
            path.append(sub)
        elif s == "h" and sub is not None:
            sub.append(("Z", []))
            x, y = sx, sy
        elif s in ("f", "f*", "B", "B*", "b", "b*"):
            if path:
                out.append(path)
            path, sub = [], None
        elif s in ("n", "S", "s"):
            path, sub = [], None
        ops = []
    return out


# ------------------------------------------------------------- SVG output

def bounds(subpaths):
    pts = [p for sub in subpaths for _, ps in sub for p in ps]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def flatten(shape, steps=CURVE_STEPS):
    """The shape as closed polylines, in SVG's y-down space.

    Curves are subdivided evenly rather than adaptively: everything here is
    about to be squashed to a few pixels, so eight pieces is already finer
    than the result can show.
    """
    polys = []
    for sub in shape:
        pts, pen, start = [], None, None
        for kind, ps in sub:
            q = [(x, PAGE_H - y) for x, y in ps]
            if kind == "M":
                pen = start = q[0]
                pts = [pen]
            elif kind == "L":
                pts.append(q[0])
                pen = q[0]
            elif kind == "C" and pen is not None:
                a, b, c, d = pen, q[0], q[1], q[2]
                for k in range(1, steps + 1):
                    t = k / float(steps)
                    m = 1.0 - t
                    pts.append((m*m*m*a[0] + 3*m*m*t*b[0] + 3*m*t*t*c[0] + t*t*t*d[0],
                                m*m*m*a[1] + 3*m*m*t*b[1] + 3*m*t*t*c[1] + t*t*t*d[1]))
                pen = d
            elif kind == "Z" and start is not None:
                pts.append(start)
                pen = start
        if len(pts) > 2:
            if pts[0] != pts[-1]:
                pts.append(pts[0])          # outlines are filled, so closed
            polys.append(pts)
    return polys


def envelope(polys, along, bins=BINS):
    """The stroke's two edges, sampled across its length.

    Read by crossing the outline with a line at each sample rather than by
    binning its points: a long straight run of one edge puts no points in
    the bins it passes over, so point-binning loses that edge exactly where
    the stroke is calmest, and reports the other edge as the middle. The
    centreline that comes out of that is noise, and this file's whole
    purpose is to amplify the centreline.

    Empty samples - where the brush has left the paper - borrow the nearest
    neighbour, and the centreline is smoothed, since a sample or two of
    jitter would come out as a kink once amplified.
    """
    segs = [(a, b) for poly in polys for a, b in zip(poly, poly[1:])]
    us = [p[along] for poly in polys for p in poly]
    u0, u1 = min(us), max(us)
    step = (u1 - u0) / bins
    lo = [None] * bins
    hi = [None] * bins

    for a, b in segs:
        ua, ub = a[along], b[along]
        if ua == ub:
            continue
        i0 = int((min(ua, ub) - u0) / step)
        i1 = int((max(ua, ub) - u0) / step)
        for i in range(max(0, i0), min(bins - 1, i1) + 1):
            u = u0 + (i + 0.5) * step
            if (ua - u) * (ub - u) > 0:
                continue                    # the sample misses this segment
            v = (a[1 - along]
                 + (b[1 - along] - a[1 - along]) * (u - ua) / (ub - ua))
            lo[i] = v if lo[i] is None else min(lo[i], v)
            hi[i] = v if hi[i] is None else max(hi[i], v)

    seen = [i for i in range(bins) if lo[i] is not None]
    for i in range(bins):
        if lo[i] is None:
            j = min(seen, key=lambda k: abs(k - i))
            lo[i], hi[i] = lo[j], hi[j]

    mid = [(lo[i] + hi[i]) / 2.0 for i in range(bins)]
    span = [hi[i] - lo[i] for i in range(bins)]
    k = SMOOTH // 2
    centre = [sum(mid[max(0, i-k):i+k+1]) / len(mid[max(0, i-k):i+k+1])
              for i in range(bins)]
    return u0, u1, centre, span


def placer(shape, axis, target, wander):
    """A map from sheet coordinates into the box the rule is drawn in.

    A plain squash of the bounding box loses the stroke almost entirely.
    The wander of a brush across 25 units of sheet is a couple of units;
    flattened into three pixels it is a fifth of one, and what is left is a
    straight band of even weight - which is what a ruled line already was.

    So the two are separated and scaled apart. The target is the stroke's
    own weight: its thickest point comes out at exactly that. The wander is
    then given room on top, in a box WANDER wider than the stroke, so that
    asking for three pixels gives three pixels of ink that move about
    rather than two pixels of ink with a pixel of margin. The stylesheet
    has to size the box to match - see --rule-w, which divides by the same
    figure this prints.

    The centreline is clamped to its own 5th and 95th percentiles before
    being scaled. A stroke that flicks hard at one end would otherwise set
    the range on its own and leave the length of it, where the eye actually
    reads the line, as straight as it was before; the ends are tapering to
    nothing and fading out under the mask anyway.
    """
    along = 0 if axis == "h" else 1                   # index of the long axis
    tu, tv = (target[0], target[1]) if axis == "h" else (target[1], target[0])
    u0, u1, centre, span = envelope(flatten(shape), along)
    box = tv / (1.0 - wander)               # the stroke, plus room to move
    ranked = sorted(centre)
    lo = ranked[int(0.05 * len(ranked))]
    hi = ranked[int(0.95 * len(ranked))]
    home = (hi + lo) / 2.0

    thick = tv / max(span)
    drift = (box * wander / (hi - lo)) if hi - lo > 1e-9 else 0.0

    def place(p):
        q = (p[0], PAGE_H - p[1])
        u, v = q[along], q[1 - along]
        t = (u - u0) / (u1 - u0) * (BINS - 1)
        i = max(0, min(BINS - 2, int(t)))
        c = centre[i] + (centre[i + 1] - centre[i]) * (t - i)
        U = (u - u0) / (u1 - u0) * tu
        V = box / 2.0 + (min(max(c, lo), hi) - home) * drift + (v - c) * thick
        return (U, V) if axis == "h" else (V, U)

    band = [((i + 0.5) / BINS * tu,
             box / 2.0 + (min(max(centre[i], lo), hi) - home) * drift,
             span[i] / 2.0 * thick)
            for i in range(BINS)]
    return place, box, band


def flecks(band, axis, seed):
    """Bare paper scattered back across the ink.

    A brush laid on paper does not leave a solid shape: the paper's tooth
    keeps some of it, and the ink that is left has grain. The strokes here
    have that in the sheet, but at the scale these are drawn - a stroke 25
    units deep squashed onto seven pixels - it is far below the pixels doing
    the drawing, so what arrives is a flat ribbon of colour.

    So it is put back at the size it can be seen at: small irregular gaps
    lifted out of the ink, up to SPECKLE of its area. They are holes, not
    marks, punched by the even-odd rule against the stroke around them - so
    each one has to sit wholly inside the ink, or the half of it hanging off
    the edge would have nothing to cancel against and would come out as a
    blob stuck to the stroke instead of a gap in it. That is why the fleck
    is sized against the local half-thickness and kept clear of the tapered
    ends, where there is not enough ink to take one.

    They are elongated along the stroke, the way a dragged brush breaks up,
    and seeded, so the files regenerate byte for byte.
    """
    rng = random.Random(seed)
    du = band[1][0] - band[0][0]
    budget = SPECKLE * sum(2.0 * h * du for _, _, h in band)

    # Cluster centres are drawn toward the thin of the stroke, because that
    # is where a brush running out of ink actually breaks up. Only bins with
    # ink enough to swallow a whole fleck can be drawn from at all, so the
    # very tips stay solid - the two pull against each other, and the
    # constant keeps the thick end from being skipped entirely.
    fat = max(h for _, _, h in band)
    pool = [i for i, (_, _, h) in enumerate(band) if h >= 2.0 * FLECK]
    if not pool:
        return []
    weight = [(fat - band[i][2]) + 0.2 * fat for i in pool]
    total = sum(weight)
    out, used, guard = [], 0.0, 0

    while used < budget and guard < 40000:
        # A cluster: somewhere on the stroke, and a run of flecks around it.
        # Scattering them one by one and independently gives a texture that
        # is even everywhere, which reads as dirt on the stroke rather than
        # as the stroke being dry; a brush leaves patches. The spread is set
        # by the stroke's own thickness because that, not its length, is the
        # scale brush texture happens at, and the count is drawn from an
        # exponential so that a few clusters are dense and most are a fleck
        # or two - which is the difference between spatter and a pattern.
        r, k = rng.uniform(0, total), 0
        while k < len(pool) - 1 and r > weight[k]:
            r -= weight[k]
            k += 1
        Uc, _, Hc = band[pool[k]]
        for _ in range(1 + int(rng.expovariate(1.0 / CLUMP))):
            guard += 1
            if used >= budget or guard >= 40000:
                break
            u = Uc + rng.gauss(0.0, 2.0 * Hc)
            i = int(u / band[-1][0] * (len(band) - 1) + 0.5)
            if i < 0 or i >= len(band):
                continue
            U, Vc, H = band[i]
            if H < 2.0 * FLECK:
                continue                 # too little ink here to take one
            # Half the size they were, so the same budget buys four times as
            # many: mist rather than spots. Squaring a uniform draw spreads
            # them, most pinpricks and a few gaps, without a second constant.
            ry = H * (0.06 + 0.22 * rng.random() ** 2)
            if ry < FLECK:
                continue
            rx = ry * rng.uniform(1.3, 3.0)
            cy = Vc + max(-1.0, min(1.0, rng.gauss(0.0, 0.5))) * (H - ry)
            cx = u
            pts = []
            for j in range(4):
                a = 2.0 * math.pi * (j + rng.uniform(-0.25, 0.25)) / 4.0
                g = rng.uniform(0.7, 1.3)
                p = (cx + math.cos(a) * rx * g, cy + math.sin(a) * ry * g)
                pts.append(p if axis == "h" else (p[1], p[0]))
            used += 2.0 * rx * ry            # a jittered quad of those radii
            out.append(pts)
    return out


def flat(pen, q):
    """True if a cubic's handles sit on its own chord, to within FLAT_PX.

    The strokes are described at sheet scale, where a bend of a tenth of a
    unit is real; squashed onto a three-pixel rule most of that curvature
    is finer than the pixels rendering it, and a cubic that bends less than
    a rounding error costs three points to say what one says.
    """
    if pen is None:
        return False
    (x0, y0), (x1, y1) = pen, q[2]
    dx, dy = x1 - x0, y1 - y0
    n = (dx * dx + dy * dy) ** 0.5
    for cx, cy in q[:2]:
        if n == 0:
            off = ((cx - x0) ** 2 + (cy - y0) ** 2) ** 0.5
        else:
            off = abs(dx * (cy - y0) - dy * (cx - x0)) / n
        if off > FLAT_PX:
            return False
    return True


def draw(subpaths, place):
    """One `d` attribute, in the box the stroke is drawn in.

    Coordinates are placed into the target box here rather than left in the
    sheet's space and squashed by the viewBox, so that rounding them to two
    decimals means a hundredth of a rendered pixel instead of a hundredth
    of a sheet unit - across a 16x squash those are three orders of
    magnitude apart, and the finer one is all bytes and no ink. Rounding
    then makes whole segments degenerate, and curves whose handles have
    collapsed onto their ends are just lines, so both are written out.
    """
    d, pen = [], None
    for sub in subpaths:
        for kind, pts in sub:
            if kind == "Z":
                d.append("Z")
                continue
            q = [tuple(round(c, 2) for c in place(p)) for p in pts]
            if pen is not None and kind != "M" and all(
                    abs(p[0] - pen[0]) < MIN_STEP and abs(p[1] - pen[1]) < MIN_STEP
                    for p in q):
                continue                      # never leaves the pen's pixel
            if kind == "C" and flat(pen, q):
                kind, q = "L", q[2:]          # straight at this size
            d.append(kind + " ".join("%g,%g" % p for p in q))
            pen = q[-1]
    return "".join(d)


def build(shape, axis, target, stops, wander, seed):
    place, box, band = placer(shape, axis, target, wander)
    target = (target[0], box) if axis == "h" else (box, target[1])

    kept = []
    for sub in shape:
        got = [place(p) for _, ps in sub for p in ps]
        w = max(p[0] for p in got) - min(p[0] for p in got)
        h = max(p[1] for p in got) - min(p[1] for p in got)
        if w < DROP_PX or h < DROP_PX:
            continue                       # too small to reach a pixel
        kept.append(sub)

    coords = (0, 0, 0, 1) if axis == "v" else (0, 0, 1, 0)
    ramp = "".join(
        '<stop offset="%g" stop-color="#fff" stop-opacity="%g"/>' % s for s in stops)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g"'
        ' preserveAspectRatio="none">'
        '<linearGradient id="f" x1="%d" y1="%d" x2="%d" y2="%d">%s</linearGradient>'
        '<path fill-rule="evenodd" d="%s" fill="url(#f)"/></svg>'
    ) % (target[0], target[1], coords[0], coords[1], coords[2], coords[3],
         ramp, draw(kept, place) + "".join(
             "M" + " ".join("%g,%g" % (round(x, 2), round(y, 2)) for x, y in f) + "Z"
             for f in flecks(band, axis, seed)))
    x0, y0, x1, y1 = bounds(shape)
    return svg, len(shape), len(kept), x1 - x0, y1 - y0


def main():
    art = shapes(content_stream(open(SRC, "rb").read()))
    print("%d filled shapes in the sheet" % len(art))
    for name, spec in PICKS.items():
        wander = spec.get("wander", WANDER)
        svg, before, after, w, h = build(
            art[spec["shape"]], spec["axis"], spec["target"], spec["stops"],
            wander, SEED + spec["shape"])
        path = os.path.normpath(os.path.join(OUT, name))
        with open(path, "w") as fh:
            fh.write(svg)
        print("  %-21s shape %-4d %4d -> %-3d subpaths %6.1f kB   box = weight / %.2f"
              % (name, spec["shape"], before, after, len(svg) / 1024.0, 1 - wander))


if __name__ == "__main__":
    main()
