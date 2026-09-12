#!/usr/bin/env python3
"""Generate the three hill silhouettes behind the home page.

    python3 tools/gen-hills.py

Writes src/assets/img/hill-1.svg, hill-2.svg and hill-3.svg, and prints the
handful of figures main.css has to agree with. Edit the tables below and
re-run rather than touching the SVGs by hand.

WHY A SCRIPT AT ALL

The three hills are one drawing cut into three files. They have to register
with each other exactly — hill 2's crest rises out of hill 3's right flank at
x=3150, hill 3 clears hill 1's shoulder at x=1960 — and they have to keep
registering when the group is scaled to a window, to a phone, or to a strip
at the foot of an inner page. Hand-kept SVGs drift; this doesn't.

ONE SHARED FRAME

Every file carries the SAME viewBox, the group's whole bounding box
(VB_W x VB_H), with each hill drawn where it belongs inside it. Nothing but
the path differs between the files. That is what makes the group composable:
any subset of the three, dropped into boxes of the same size and position,
lands correctly with no per-file offsets to maintain, and a footer that
wants only the near hill costs one file and one rule.

The frame is symmetric about the tallest hill's tip (hill 3's, at the exact
horizontal middle), so "centre the image" and "put the tallest tip on the
window's centre line" are the same instruction. The empty width that
symmetry leaves on one side costs nothing: a viewBox is four numbers.

WHAT THE FILES CONTAIN

One <path>, filled flat, no gradients, no filters, no colour. They are used
as CSS masks over a box painted in that hill's tone — the same device the
brush rules use — so one file serves both themes and the stylesheet owns the
colour. What the file carries is a silhouette.

The three tones are OPAQUE, not three alphas over the paper. That is what
keeps a nearer hill from letting a further one show through it: with alpha,
two hills at two thirds made a third tone everywhere they crossed, and an
overlap you can see reads as cellophane rather than as distance. main.css
carries the flat values and the mix each one comes from.

STRAIGHT SEGMENTS

The skylines are polylines and nothing else — no curves, no rounded corners.
A ridge is read from where its slope BREAKS, so each is built as a run of
straight segments that change angle: a shallow foot, a steeper pull, a
shoulder where it eases, a summit, then a stepped descent with a subsidiary
knoll or two. Twelve to twenty vertices apiece is what makes them read as
landscape rather than as a curve or a cone; it is also, at these sizes, a
smaller file than any smooth equivalent.

INFINITE GROUND

Each hill's outline leaves the frame's left and right edges HORIZONTAL, at
that hill's own ground level, and the path runs flat along those levels all
the way to both edges. So the drawing can be continued sideways forever by
a flat band at the same height — which is exactly what the stylesheet adds
as a second mask layer, letting the group sit in a window of any width
without stretching and without a seam. The ground levels are printed below
as fractions of the frame's height; they are the only numbers the CSS needs
from the geometry.
"""

import os

# --------------------------------------------------------------------------
# The shared frame. 1000 units tall = the group's height = the tallest hill.
# The width is symmetric about x = VB_W/2, which is hill 3's tip.
# --------------------------------------------------------------------------
VB_H = 1000
VB_W = 5100
CENTRE = VB_W / 2  # 2550 — hill 3's summit, and the group's anchor point

# Vertices run left to right as (x, u), u being height ABOVE the frame's
# bottom edge, so bigger = higher up. The first and last must sit on x = 0
# and x = VB_W at that hill's ground level, and the segment next to each has
# to be flat — that is what makes the stylesheet's continuation exact.
HILLS = {
    # Near, front, full strength. Lowest and widest of the three and the
    # bulkiest: a long two-stage foot, a shoulder at 1110, then the pull to a
    # summit that is nearly flat across its last 300 units — a worn, grassed
    # top rather than a peak. The descent steps down four times and carries a
    # small counter-rise at 2320, the knoll that keeps its right flank from
    # reading as one straight ramp.
    "hill-1.svg": dict(
        ground=220,
        pts=[(0, 220), (240, 220),
             (620, 355), (900, 470), (1110, 500), (1380, 620), (1520, 638),
             (1660, 660),
             (1860, 585), (2120, 520), (2320, 535), (2560, 460), (2800, 400),
             (2980, 385), (3220, 285), (3450, 230), (3620, 220),
             (5100, 220)],
    ),
    # Middle distance, right of centre. Steeper throughout than the near hill
    # and with a narrower head — two short segments into the summit rather
    # than a crest — but still broken by shoulders at 2930 and 3290 on the
    # way up and 4080 and 4470 on the way down. It clears hill 3's right
    # flank at about x=3150, which is the crossing that gives the group its
    # depth: nothing else tells you the two are at different distances.
    "hill-2.svg": dict(
        ground=190,
        pts=[(0, 190), (2230, 190),
             (2520, 300), (2760, 430), (2930, 465), (3130, 620), (3290, 665),
             (3450, 775), (3560, 790),
             (3640, 800),
             (3790, 735), (3930, 610), (4080, 585), (4280, 455), (4470, 400),
             (4620, 300), (4830, 215), (4960, 190),
             (5100, 190)],
    ),
    # Far, centred, tallest — the frame's anchor, and the only hill whose
    # summit is pinned: it must sit on x = CENTRE, and it must reach u = VB_H,
    # because the box's height is defined as this hill's.
    #
    # It is a massif, not a peak. Three separate pulls up the left flank, each
    # broken by a shoulder (2010, 2330), and the last segment into the summit
    # runs at a quarter of the gradient of the one below it, so the top is a
    # short crest that falls away slowly rather than a point. The right flank
    # is nearly twice the run of the left and steps down five times, with a
    # subsidiary knoll at 3510 rising back out of it. That asymmetry, and the
    # shoulders, are what the cone this replaced was missing.
    "hill-3.svg": dict(
        ground=140,
        pts=[(0, 140), (1420, 140),
             (1690, 300), (1880, 520), (2010, 575), (2180, 790), (2330, 860),
             (2450, 975),
             (2550, 1000),
             (2700, 960), (2830, 830), (2990, 790), (3160, 620), (3340, 560),
             (3510, 620), (3620, 600), (3810, 420), (4010, 300), (4230, 200),
             (4420, 140),
             (5100, 140)],
    ),
}


def fmt(v):
    """Trim a coordinate, without a trailing '.0'."""
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def ridge_path(pts):
    """Vertices -> a closed path: the skyline, then down and back along the
    frame's foot. Straight segments throughout, so one L per vertex."""
    d = [f"M{fmt(pts[0][0])} {fmt(VB_H - pts[0][1])}"]
    d += [f"L{fmt(x)} {fmt(VB_H - u)}" for x, u in pts[1:]]
    d.append(f"L{VB_W} {VB_H}L0 {VB_H}Z")
    return "".join(d)


def check(name, spec):
    """The four rules a hill has to keep. Breaking any of them shows up as a
    seam or a gap against the stylesheet rather than as an obviously wrong
    drawing, which is why they are asserted rather than left to the eye."""
    pts, g = spec["pts"], spec["ground"]
    assert pts[0] == (0, g) and pts[-1] == (VB_W, g), f"{name}: ends off-frame"
    assert pts[1][1] == g and pts[-2][1] == g, f"{name}: edges not horizontal"
    assert min(u for _, u in pts) == g, f"{name}: dips below its own ground"
    assert all(b[0] > a[0] for a, b in zip(pts, pts[1:])), f"{name}: x not monotonic"


def main():
    out = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "img")
    print(f"frame {VB_W}x{VB_H}, centre x={fmt(CENTRE)}\n")

    for name, spec in sorted(HILLS.items()):
        check(name, spec)
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {VB_W} {VB_H}" width="{VB_W}" height="{VB_H}">'
            f'<path d="{ridge_path(spec["pts"])}"/></svg>'
        )
        with open(os.path.join(out, name), "w") as f:
            f.write(svg)

        peak = max(spec["pts"], key=lambda p: p[1])
        ground = spec["ground"] / VB_H
        print(f"{name:12s} {len(svg):5d} bytes  {len(spec['pts']):2d} vertices  "
              f"ground {ground:.3f} (CSS: {100 - ground * 100:g}%)  "
              f"summit {peak[1] / VB_H:.3f} at "
              f"{(peak[0] - CENTRE) / VB_H:+.3f} from centre")

    print(f"\naspect (width / height) = {VB_W / VB_H:g}"
          f"   half-width = {VB_W / VB_H / 2:g}")


if __name__ == "__main__":
    main()
