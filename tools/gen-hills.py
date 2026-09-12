#!/usr/bin/env python3
"""Generate the three hill silhouettes behind the home page.

    python3 tools/gen-hills.py

Writes src/assets/img/hill-1.svg, hill-2.svg and hill-3.svg, and prints the
handful of figures main.css has to agree with. Edit the tables below and
re-run rather than touching the SVGs by hand.

WHY A SCRIPT AT ALL

The three hills are one drawing cut into three files. They have to register
with each other exactly — hill 2's peak rises out of hill 3's right flank,
hill 1's mass cuts across both — and they have to keep registering when the
group is scaled to a window, to a phone, or to a strip at the foot of an
inner page. Hand-kept SVGs drift; this doesn't.

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
as CSS masks over a box painted in the hill colour — the same device the
brush rules use — so one file serves both themes and the stylesheet owns
the colour and the strength. What the file carries is a silhouette.

INFINITE GROUND

Each hill's outline leaves the frame's left and right edges HORIZONTAL, at
that hill's own ground level, and the path runs flat along those levels all
the way to both edges. So the drawing can be continued sideways forever by
a flat band at the same height — which is exactly what the stylesheet adds
as a second mask layer, letting the group sit in a window of any width
without stretching and without a seam. The ground levels are printed below
as fractions of the frame's height; they are the only numbers the CSS needs
from the geometry.

SHAPES

Polylines with rounded corners, not freehand curves. Each corner becomes a
quadratic fillet whose control point is the corner itself, so the outline is
tangent-continuous everywhere and the whole ridge costs a dozen commands.
Radii are per-corner: wide at the shoulders, tight at a summit, which is
what makes a far peak read as rock and a near hill as a long grassed back.
"""

import math
import os

# --------------------------------------------------------------------------
# The shared frame. 1000 units tall = the group's height = the tallest hill.
# The width is symmetric about x = VB_W/2, which is hill 3's tip.
# --------------------------------------------------------------------------
VB_H = 1000
VB_W = 5100
CENTRE = VB_W / 2  # 2550 — hill 3's summit, and the group's anchor point

# Vertices run left to right as (x, u, r):
#   u  height ABOVE the frame's bottom edge (so bigger = higher up)
#   r  corner radius in frame units; 0 at the two ends, which are already
#      horizontal
# The first and last vertex must sit on x = 0 and x = VB_W at that hill's
# ground level — that is what makes the flat continuation exact.
HILLS = {
    # Near, front, full strength. Lowest and widest of the three: a long
    # grassed back whose summit sits well left of the group's centre, then a
    # saddle and a secondary knoll before it comes down over 1500 units. Its
    # ground is the highest of the three, so on any window it is this hill's
    # horizon that runs out to the edges — the other two never reach their
    # own, which is why there is only ever one horizon line on the page.
    "hill-1.svg": dict(
        ground=220,
        pts=[
            (   0, 220,   0),
            ( 300, 220, 140),
            ( 980, 520, 320),
            (1660, 660, 230),
            (2150, 520, 200),
            (2560, 545, 180),
            (3050, 340, 240),
            (3560, 220, 190),
            (5100, 220,   0),
        ],
    ),
    # Middle distance, right of centre. A shoulder part-way up the left
    # flank, then a sharper head than the near hill and two long steps down
    # the right. It rises out of hill 3's right flank around x=3100, which is
    # the crossing that gives the group its depth: nothing else tells you the
    # two are at different distances, since they share a strength.
    "hill-2.svg": dict(
        ground=190,
        pts=[
            (   0, 190,   0),
            (2280, 190, 160),
            (2790, 430, 230),
            (3080, 500, 200),
            (3340, 690, 120),
            (3640, 800,  80),
            (3990, 590, 140),
            (4380, 360, 250),
            (4860, 190, 220),
            (5100, 190,   0),
        ],
    ),
    # Far, centred, tallest — the frame's anchor, and the only hill whose
    # summit is pinned: it must sit on x = CENTRE. Short steep left flank
    # (780 units of run for 860 of rise), long trailing right one that steps
    # down three times over 1770. That imbalance is what stops it reading as
    # a cone; the tightest radius in the set, 55 against the near hill's 230,
    # what separates distance from bulk.
    "hill-3.svg": dict(
        ground=140,
        pts=[
            (   0, 140,   0),
            (1770, 140, 110),
            (2130, 520, 170),
            (2330, 760,  90),
            (2550,1000,   0),
            (2790, 790, 130),
            (3060, 560, 200),
            (3450, 330, 280),
            (3900, 200, 240),
            (4320, 140, 200),
            (5100, 140,   0),
        ],
    ),
}


def fmt(v):
    """Trim a coordinate to at most one decimal, without a trailing '.0'."""
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def ridge_path(pts):
    """Vertices -> a closed path, corners rounded by quadratic fillets.

    Each interior corner B is replaced by the pair of points a radius along
    BA and BC, joined by a quadratic whose control point is B itself. The
    radius is clamped to just under half of the shorter arm so two adjacent
    fillets can never cross, which is the only way this can misdraw.
    """
    xy = [(x, VB_H - u) for x, u, _ in pts]  # to SVG's y-down frame
    radii = [r for _, _, r in pts]
    d = []

    for i, (px, py) in enumerate(xy):
        if i == 0:
            d.append(f"M{fmt(px)} {fmt(py)}")
            continue
        if i == len(xy) - 1:
            d.append(f"L{fmt(px)} {fmt(py)}")
            continue

        ax, ay = xy[i - 1]
        cx, cy = xy[i + 1]
        la = math.hypot(px - ax, py - ay)
        lc = math.hypot(cx - px, cy - py)
        r = min(radii[i], la * 0.499, lc * 0.499)
        if r <= 0:
            # A sharp vertex. Only hill 3's summit asks for one, and it asks
            # because it is the figure the box's height is defined by: any
            # fillet there would hold the topmost ink a couple of per cent
            # below the frame's top edge, and the tallest hill is supposed to
            # fill the box exactly.
            d.append(f"L{fmt(px)} {fmt(py)}")
            continue

        d.append(f"L{fmt(px + (ax - px) / la * r)} {fmt(py + (ay - py) / la * r)}")
        d.append(f"Q{fmt(px)} {fmt(py)} "
                 f"{fmt(px + (cx - px) / lc * r)} {fmt(py + (cy - py) / lc * r)}")

    # Close down the right edge, along the bottom, and up the left edge.
    d.append(f"L{VB_W} {VB_H}L0 {VB_H}Z")
    return "".join(d)


def main():
    out = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "img")
    print(f"frame {VB_W}x{VB_H}, centre x={fmt(CENTRE)}\n")

    for name, spec in sorted(HILLS.items()):
        path = ridge_path(spec["pts"])
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {VB_W} {VB_H}" width="{VB_W}" height="{VB_H}">'
            f'<path d="{path}"/></svg>'
        )
        dest = os.path.join(out, name)
        with open(dest, "w") as f:
            f.write(svg)

        peak = max(spec["pts"], key=lambda p: p[1])
        ground = spec["ground"] / VB_H
        print(f"{name:12s} {len(svg):5d} bytes   "
              f"ground {ground:.3f} of height (CSS: {100 - ground * 100:g}%)   "
              f"summit {peak[1] / VB_H:.3f} high at "
              f"{(peak[0] - CENTRE) / VB_H:+.3f} of height from centre")

    print(f"\naspect (width / height) = {VB_W / VB_H:g}"
          f"   half-width = {VB_W / VB_H / 2:g}")


if __name__ == "__main__":
    main()
