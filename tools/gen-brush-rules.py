#!/usr/bin/env python3
"""Generate the homepage's brush-stroke rules from the stock stroke sheet.

    python3 tools/gen-brush-rules.py

Input is tools/brush-strokes-source.ai, a sheet of free vector brush
strokes. Despite the extension it is a PDF - Illustrator writes a
PDF-compatible stream and nothing here reads the private AI part - so the
whole file is one page whose content stream is 1243 filled shapes, each a
separate stroke wrapped in its own q/cm ... f* Q block.

Four of those become the rules on the home page: one long vertical for the
line between the picture and the nav, and three horizontals, one per link.
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

import os
import re
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "brush-strokes-source.ai")
OUT = os.path.join(HERE, os.pardir, "src", "assets", "img")

PAGE_H = 491.975          # the sheet's MediaBox height, for the y-flip

# Shape index in the content stream -> output. The three horizontals read
# left to right as about / blog / gallery. They were chosen by squashing
# every candidate to 3px and measuring the ink: all three are solid where
# they meet the vertical, taper away to the right - the direction the fade
# runs anyway - and no two are alike.
#
# They also had to carry the same weight. Stretching a stroke's bounding
# box to 3px equalises the widest point and nothing else, so strokes that
# look alike on the sheet can differ by a third in the ink they actually
# lay down. These three sit at 2.3, 2.4 and 2.5px of ink against a 3px box;
# the first stroke tried here for blog measured 1.75 and read as the faint
# one of the three, which looks like a mistake rather than like a hand.
PICKS = {
    "brush-spine.svg":  dict(shape=693, axis="v", target=(3, 910),
                             stops=[(0.0, 0.0), (0.12, 1.0), (0.88, 1.0), (1.0, 0.0)]),
    "brush-rule-1.svg": dict(shape=1,   axis="h", target=(290, 3),
                             stops=[(0.45, 1.0), (1.0, 0.0)]),
    "brush-rule-2.svg": dict(shape=642, axis="h", target=(290, 3),
                             stops=[(0.45, 1.0), (1.0, 0.0)]),
    "brush-rule-3.svg": dict(shape=36,  axis="h", target=(290, 3),
                             stops=[(0.45, 1.0), (1.0, 0.0)]),
}

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


def draw(subpaths, box, scale):
    """One `d` attribute, in the box the stroke is drawn in.

    Coordinates are squashed into the target box here rather than left in
    the sheet's space and squashed by the viewBox, so that rounding them to
    two decimals means a hundredth of a rendered pixel instead of a
    hundredth of a sheet unit - across a 16x horizontal squash those are
    three orders of magnitude apart, and the finer one is all bytes and no
    ink. Rounding then makes whole segments degenerate, and curves whose
    handles have collapsed onto their ends are just lines, so both are
    written out.
    """
    x0, y0, _, y1 = box
    sx, sy = scale

    def to(p):
        return (round((p[0] - x0) * sx, 2), round((y1 - p[1]) * sy, 2))

    d, pen = [], None
    for sub in subpaths:
        for kind, pts in sub:
            if kind == "Z":
                d.append("Z")
                continue
            q = [to(p) for p in pts]
            if pen is not None and kind != "M" and all(
                    abs(p[0] - pen[0]) < MIN_STEP and abs(p[1] - pen[1]) < MIN_STEP
                    for p in q):
                continue                      # never leaves the pen's pixel
            if kind == "C" and flat(pen, q):
                kind, q = "L", q[2:]          # straight at this size
            d.append(kind + " ".join("%g,%g" % p for p in q))
            pen = q[-1]
    return "".join(d)


def build(shape, axis, target, stops):
    x0, y0, x1, y1 = bounds(shape)
    w, h = x1 - x0, y1 - y0
    sx, sy = target[0] / w, target[1] / h

    kept = []
    for sub in shape:
        a, b, c, d = bounds([sub])
        if (c - a) * sx < DROP_PX or (d - b) * sy < DROP_PX:
            continue                       # too small to reach a pixel
        kept.append(sub)

    coords = (0, 0, 0, 1) if axis == "v" else (0, 0, 1, 0)
    ramp = "".join(
        '<stop offset="%g" stop-color="#fff" stop-opacity="%g"/>' % s for s in stops)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g"'
        ' preserveAspectRatio="none">'
        '<linearGradient id="f" x1="%d" y1="%d" x2="%d" y2="%d">%s</linearGradient>'
        '<path d="%s" fill="url(#f)"/></svg>'
    ) % (target[0], target[1], coords[0], coords[1], coords[2], coords[3],
         ramp, draw(kept, (x0, y0, x1, y1), (sx, sy)))
    return svg, len(shape), len(kept), w, h


def main():
    art = shapes(content_stream(open(SRC, "rb").read()))
    print("%d filled shapes in the sheet" % len(art))
    for name, spec in PICKS.items():
        svg, before, after, w, h = build(
            art[spec["shape"]], spec["axis"], spec["target"], spec["stops"])
        path = os.path.normpath(os.path.join(OUT, name))
        with open(path, "w") as fh:
            fh.write(svg)
        print("  %-16s shape %-4d %6.1f x %-6.1f  %4d -> %-4d subpaths  %6.1f kB"
              % (name, spec["shape"], w, h, before, after, len(svg) / 1024.0))


if __name__ == "__main__":
    main()
