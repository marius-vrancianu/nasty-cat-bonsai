#!/usr/bin/env python3
"""Generate the homepage pine backdrops from the traced Tohaku screen.

    python3 tools/gen-tohaku-pines.py

Input is tools/tohaku-pines-source.svg: a posterised trace of Hasegawa
Tohaku's "Pine Trees" (Shorin-zu byobu, right screen, c. 1595) - sixteen
flat grey layers, darkest last, over an opaque washi rectangle, all inside
one <g> that flips and scales the tracer's coordinate space.

That file cannot be used as-is. The site paints the pines two ways: as a
background-image in light mode, and in dark mode as an *alpha mask* over
the ink colour, so every stroke has to carry its tone as opacity rather
than as a grey fill - an opaque grey trace masks as a solid block. So this
script rewrites the sixteen greys into one ink colour at sixteen opacities,
and drops the washi rectangle.

The greys are strictly nested (each darker layer's region lies inside every
lighter one - verified on the source), so the layers composite rather than
tile: a pixel in layer k has been painted k times. The opacities below are
therefore *incremental* - a_k solves

    1 - (1 - A_k) = (1 - a_k) * (1 - A_{k-1})

for the cumulative coverage A_k the drawing asks for at that level. Stacked
in order they reproduce that tone; used as a mask they give the same tone in
ink.

A_k is not the trace's own tone, though: the curve below bends it first. A
straight transfer reproduces the painting faithfully and reads as a blur at
backdrop scale - sixteen shallow steps spread evenly from mist to trunk, so
the mist carries nearly as much ink as the trees. Dark mode has it worse for
a structural reason: masked over the ink colour, a faint layer on a near-
black ground gains far more apparent weight than the same layer on paper.

The screen is two things at once, and the levels say which is which. Painting
each level in its own colour and looking at where it lands, levels 1-5 (up to
coverage 0.32) draw the back pines - the mist trees at the left, above the
grove and behind the leaning pine - and levels 6-16 draw the two front trees.
So the curve is in two parts, split at MIST_LEVELS: the back pines are left
alone, and only the front trees are sharpened. See the constants below.

Three files come out, all sharing one scale and one ground line:

  tohaku-pines.svg        desktop - both groups, the empty middle panels of
                          the screen closed up (see .home-pines in main.css);
                          its ratio follows from that, so the CSS takes the
                          ratio from the drawing rather than the drawing
                          being cropped to a ratio
  tohaku-pines-left.svg   the left group on its own
  tohaku-pines-right.svg  the right group on its own

The two split files are what the mobile layout stands either side of the
nav links. Every file ends at the drawing's lowest ink, so whatever height
the CSS gives them they stand on one ground line; on the other three sides
each is cut to its own, so a band fills with tree rather than with the sky
above a group that happens to start lower. Keep .home-pines' aspect-ratio
equal to the desktop viewBox's ratio, which this script prints along with
each split file's own width-to-height - the numbers the mobile rules are
written against.

Standard library only.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "tohaku-pines-source.svg")
OUT = os.path.join(HERE, os.pardir, "src", "assets", "img")

INK = "#222"

# --------------------------------------------------------------- tone curve
# How many levels, counted from the palest, draw the back pines. Levels 1-5
# are where the mist trees live and nothing else does; the knee sits on the
# 5th level's coverage, so level 5 is the last one held and level 6 the first
# one bent.
MIST_LEVELS = 5

# What the back pines are painted at, as a multiple of their own coverage in
# the trace. 1 would reproduce the trace; above it they gain against the front
# trees, and that ratio - not any absolute tone - is what this constant sets.
# main.css's opacities scale the finished drawing as a whole and cancel out of
# it entirely, so they can be retuned without touching this. 1.44 reads the
# back pines as trees rather than as a glimpse, which is the point: they are
# what carries the screen's depth.
#
# It is not free. The five levels below the knee draw the halo around the
# front trees as well as the back pines - tone cannot tell the two apart -
# so raising this softens the front trees' edges by the same factor. At 1.44
# that costs a little; past about 1.8 the halo reads as a wash between the
# branch masses and the depth the emphasis was buying goes back out.
MIST_GAIN = 1.44

# How hard the front trees are sharpened. Above the knee the levels are put
# through an S-curve of this strength - 0 leaves them evenly spaced, 1 is a
# full smoothstep - which pulls the canopy's outer tones apart from its core
# and packs the darkest few together, so needles read as needles instead of a
# wash. Past about 0.8 the crown fills in and the gaps between branch masses
# close up, which reads as a blob rather than a tree.
FRONT_S = 0.6

CREDIT = ("After Hasegawa Tohaku, Pine Trees (Shorin-zu byobu, right screen), "
          "c. 1595. Generated by tools/gen-tohaku-pines.py from "
          "tools/tohaku-pines-source.svg - edit and re-run that script rather "
          "than this file.")

# The source's own frame: the tracer picked up the scan's border rules and
# the two collector's seals at the right edge. Neither belongs in a backdrop.
EDGE_BAND = 26                       # px: a border rule lies within this of an edge
SEALS = (2975, 645, 3050, 795)       # the seal block, in display coordinates

# The scan's right margin. Past the silk the mount shows, carrying the border
# rules and the two seals, and the silk is discoloured where it meets them.
# The tracer read all of that as a pale wash anchored to that edge - a band up
# to 105px wide, too wide for EDGE_BAND and reaching well below SEALS, so
# neither rule above catches it.
#
# Nothing in the painting is both pale and anchored to that edge. What does
# reach it is the leaning pine's trunk, which is dark, and each group's own
# outer contour, which spans the whole group (550-590px) rather than a band.
# So: a subpath at or below MIST_LEVELS whose box touches the right edge and
# is narrower than this is the mount, not the painting. Five subpaths go,
# four of them on the palest layer. They were always there - MIST_GAIN's
# doubling is what turned them into a visible grey block behind the leaning
# pine's feet, worst in dark mode where the mask paints them in ink.
MOUNT_BAND = 150                     # px

# The screen's two groups are separated by ~650px of bare silk; nothing the
# tracer drew crosses this line (asserted below).
SPLIT_X = 2050

# Desktop: the left group's ink starts at the box's left edge and the right
# group's runs off the right edge, exactly as the old backdrop did, with the
# screen's bare middle panels squeezed out between them until the groups
# stand OVERLAP apart. Nothing is cropped to reach a ratio - the box is as
# tall as the drawing is and as wide as the closed-up groups make it, and
# the ratio that falls out is what the CSS is told to use. Cropping the top
# instead would buy a wider box by beheading the tall pale pines, whose
# crowns are the highest thing in the painting.
OVERLAP = 60                         # px the groups share, mist over mist

# ------------------------------------------------------------------ parsing
NUM = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
CMD = re.compile(r"[MmLlCcZz]")


def tokenize(d):
    out, i = [], 0
    while i < len(d):
        if CMD.match(d[i]):
            cmd, i, nums = d[i], i + 1, []
            while i < len(d):
                m = NUM.match(d, i)
                if not m:
                    if d[i] in " ,":
                        i += 1
                        continue
                    break
                nums.append(float(m.group()))
                i = m.end()
            out.append((cmd, nums))
        else:
            i += 1
    return out


class Sub:
    """One subpath: where it starts, what it draws, and the box it covers."""

    def __init__(self, x, y):
        self.start = (x, y)
        self.toks = []
        self.box = [x, y, x, y]

    def grow(self, x, y):
        b = self.box
        b[0], b[1] = min(b[0], x), min(b[1], y)
        b[2], b[3] = max(b[2], x), max(b[3], y)


def subpaths(d):
    """Split one layer's path into its closed subpaths, each measured.

    The tracer emits only M/m, c, l and z, and every subpath is closed, so
    the walk below is exact rather than a bounding approximation - the only
    liberty is measuring cubics by their control points, which over-measures
    a curve's box but never under-measures it."""
    subs, cur, x, y, sx, sy = [], None, 0.0, 0.0, 0.0, 0.0
    for cmd, nums in tokenize(d):
        if cmd in "Mm":
            x, y = (nums[0], nums[1]) if cmd == "M" else (x + nums[0], y + nums[1])
            sx, sy = x, y
            cur = Sub(x, y)
            subs.append(cur)
            rest = nums[2:]
            if rest:                                  # implicit linetos
                cur.toks.append(("l" if cmd == "m" else "L", rest))
                for i in range(0, len(rest), 2):
                    x, y = ((x + rest[i], y + rest[i + 1]) if cmd == "m"
                            else (rest[i], rest[i + 1]))
                    cur.grow(x, y)
            continue
        cur.toks.append((cmd, nums))
        if cmd == "c":
            for i in range(0, len(nums), 6):
                for j in range(0, 6, 2):
                    cur.grow(x + nums[i + j], y + nums[i + j + 1])
                x, y = x + nums[i + 4], y + nums[i + 5]
        elif cmd == "l":
            for i in range(0, len(nums), 2):
                x, y = x + nums[i], y + nums[i + 1]
                cur.grow(x, y)
        elif cmd == "L":
            for i in range(0, len(nums), 2):
                x, y = nums[i], nums[i + 1]
                cur.grow(x, y)
        elif cmd in "Zz":
            x, y = sx, sy
        else:
            raise ValueError("unhandled path command %r" % cmd)
    return subs


def num(v):
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def join(nums):
    """Numbers with the fewest separators SVG allows: a leading minus sign
    already ends the number before it, so only positives need a space."""
    out = []
    for v in nums:
        s = num(v)
        out.append(s if (out and s[0] == "-") else (" " + s if out else s))
    return "".join(out)


def draw(subs):
    """Re-emit subpaths, each re-anchored with an absolute moveto so a
    selection stands alone."""
    out = []
    for sub in subs:
        out.append("M" + join(sub.start))
        for cmd, nums in sub.toks:
            out.append("z" if cmd in "Zz" else cmd + join(nums))
    return "".join(out)


# ------------------------------------------------------------------- source
def load():
    """-> (layers, transform); layers are (grey, subpaths) darkest last."""
    src = open(SRC).read()
    m = re.search(r'<g transform="matrix\(([^)]*)\)"', src)
    a, b, c, d, e, f = (float(v) for v in m.group(1).split(","))
    assert (b, c) == (0.0, 0.0), "only scale+flip transforms are handled"
    layers = [(int(g[1:3], 16), subpaths(dd))
              for g, dd in re.findall(r'<path fill="(#[0-9a-f]{6})" d="([^"]*)"', src)]
    assert len(layers) == 16, len(layers)
    assert [g for g, _ in layers] == sorted((g for g, _ in layers), reverse=True), \
        "layers must run lightest to darkest"
    return layers, (a, d, e, f)


def box_of(subs, xf):
    """The display-space box covering a list of subpaths."""
    a, d, e, f = xf
    out = [1e9, 1e9, -1e9, -1e9]
    for s in subs:
        x0, y0, x1, y1 = s.box
        for x, y in ((x0 * a + e, y1 * d + f), (x1 * a + e, y0 * d + f)):
            out[0], out[1] = min(out[0], x), min(out[1], y)
            out[2], out[3] = max(out[2], x), max(out[3], y)
    return out


def keep(sub, xf, W, H, level):
    """False for the scan rather than the painting: the border rules, the
    collector's seals, and the mount wash down the right margin."""
    b = box_of([sub], xf)
    if b[2] - b[0] > 0.9 * W and b[3] - b[1] > 0.9 * H:
        return False                                   # the border ring itself
    if (b[2] < EDGE_BAND or b[0] > W - EDGE_BAND
            or b[3] < EDGE_BAND or b[1] > H - EDGE_BAND):
        return False                                   # a rule along one edge
    sx0, sy0, sx1, sy1 = SEALS
    if b[0] >= sx0 and b[2] <= sx1 and b[1] >= sy0 and b[3] <= sy1:
        return False
    if (level <= MIST_LEVELS and b[2] >= W - EDGE_BAND
            and b[2] - b[0] < MOUNT_BAND):
        return False                                   # the mount, see above
    return True


# -------------------------------------------------------------------- tone
def bend(cum, knee):
    """The tone curve: hold the back pines, sharpen the front trees.

    At or below the knee - the top of the back pines' range - coverage is
    only scaled by MIST_GAIN, so those levels keep their spacing and move
    together, up or down. Above it the remaining
    levels are stretched across what is left and run through an S-curve of
    strength FRONT_S, which spreads the front trees' midtones and closes up
    their darkest few. The two halves meet at the knee by construction, and
    coverage 1 stays 1 whatever the constants say."""
    if cum <= knee:
        return MIST_GAIN * cum
    foot = MIST_GAIN * knee
    t = (cum - knee) / (1.0 - knee)
    t = (1.0 - FRONT_S) * t + FRONT_S * (t * t * (3.0 - 2.0 * t))
    return foot + (1.0 - foot) * t


def opacities(greys, washi, floor):
    """Incremental opacities that rebuild the trace's tone in one ink.

    A grey g sits at cumulative coverage (washi - g) / (washi - floor),
    bent by the curve above; the layer's own opacity is what that coverage
    needs on top of the layer before it."""
    cums = [min(1.0, max(0.0, (washi - g) / float(washi - floor))) for g in greys]
    knee = cums[MIST_LEVELS - 1]
    out, prev = [], 0.0
    for cum in cums:
        cum = bend(cum, knee)
        out.append(round(0 if cum >= 1 - 1e-9 and prev >= 1 - 1e-9
                         else (1.0 if prev >= 1 - 1e-9
                               else (cum - prev) / (1.0 - prev)), 4))
        prev = cum
    return out


# ------------------------------------------------------------------- output
def write(path, groups, vb, xf):
    """groups: [(dx, [(opacity, subpaths), ...]), ...] - one <g> each, shifted."""
    a, d, e, f = xf
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">' % vb,
           "<!-- %s -->" % CREDIT]
    for dx, layers in groups:
        out.append('<g transform="matrix(%g,0,0,%g,%g,%g)" fill-rule="evenodd">'
                   % (a, d, e + dx, f))
        for op, subs in layers:
            if op <= 0 or not subs:
                continue
            out.append('<path fill="%s" opacity="%g" d="%s"/>'
                       % (INK, op, draw(subs)))
        out.append("</g>")
    out.append("</svg>")
    svg = "".join(out)
    with open(path, "w") as fh:
        fh.write(svg)
    return svg


def main():
    layers, xf = load()
    W, H = 3072, 1344                     # the source's own canvas
    greys = [g for g, _ in layers]
    ops = opacities(greys, washi=243, floor=greys[-1])

    left, right = [], []
    for level, (_, subs) in enumerate(layers, 1):
        lo, ro = [], []
        for s in subs:
            if not keep(s, xf, W, H, level):
                continue
            b = box_of([s], xf)
            assert not (b[0] < SPLIT_X < b[2]), "a subpath crosses the split"
            (lo if b[2] <= SPLIT_X else ro).append(s)
        left.append(lo)
        right.append(ro)

    lbox, rbox = box_of(sum(left, []), xf), box_of(sum(right, []), xf)

    # One ground line for every file - they all end at the drawing's lowest
    # ink, so the two mobile files stand on the same ground however each is
    # scaled. The desktop file spans both groups' crowns; the split files
    # each start at their own, which is what lets the far group fill a band
    # rather than hanging 9% of it in empty sky (see .home-pines on mobile).
    y0, y1 = min(lbox[1], rbox[1]), max(lbox[3], rbox[3])
    height = y1 - y0
    width = (lbox[2] - lbox[0]) + (rbox[2] - rbox[0]) - OVERLAP

    # -- desktop: the left group flush left, the right group flush right.
    dx_l = -lbox[0]
    dx_r = width - rbox[2]
    pairs = [(dx_l, list(zip(ops, left))), (dx_r, list(zip(ops, right)))]
    vb = "0 %s %s %s" % (num(y0), num(width), num(height))
    uni = write(os.path.join(OUT, "tohaku-pines.svg"), pairs, vb, xf)

    # -- mobile: each group on its own, cut to its own ink on three sides and
    #    to the shared ground line at the bottom.
    outs = {}
    for name, group, gbox in (("left", left, lbox), ("right", right, rbox)):
        gh = y1 - gbox[1]
        vbg = "0 %s %s %s" % (num(gbox[1]), num(gbox[2] - gbox[0]), num(gh))
        outs[name] = (write(os.path.join(OUT, "tohaku-pines-%s.svg" % name),
                            [(-gbox[0], list(zip(ops, group)))], vbg, xf),
                      (gbox[2] - gbox[0]) / gh)

    print("opacities (lightest first): %s"
          % ", ".join("%g" % o for o in ops))
    print("ink: left x %.0f..%.0f, right x %.0f..%.0f, y %.0f..%.0f"
          % (lbox[0], lbox[2], rbox[0], rbox[2], y0, y1))
    print("tohaku-pines.svg       %6.0f KB  viewBox %s\n"
          "  ratio %.4f = %.0f/%.0f - set .home-pines' aspect-ratio to it"
          % (len(uni) / 1024, vb, width / height, round(width), round(height)))
    for name in ("left", "right"):
        svg, ratio = outs[name]
        print("tohaku-pines-%-6s.svg %6.0f KB  %.4f x its own height - the "
              "width it takes in a band" % (name, len(svg) / 1024, ratio))


if __name__ == "__main__":
    sys.exit(main())
