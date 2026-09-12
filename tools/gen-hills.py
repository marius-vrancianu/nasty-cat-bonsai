#!/usr/bin/env python3
"""Generate the three hill silhouettes behind the home page.

    python3 tools/gen-hills.py

Writes src/assets/img/hill-1.svg, hill-2.svg and hill-3.svg, and prints the
handful of figures main.css has to agree with. Edit the tables below and
re-run rather than touching the SVGs by hand.

WHY A SCRIPT AT ALL

The three hills are one drawing cut into three files. They have to register
with each other exactly — hill 2's head only clears hill 3's right flank over
its last 130 units of rise, and that crossing is the whole depth cue — and
they have to keep registering when the group is scaled to a window, to a
phone, or to a strip at the foot of an inner page. Hand-kept SVGs drift;
this doesn't.

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

HOW A HILL IS WRITTEN: SLOPES, NOT POINTS

Each hill is a summit height, a place to put it, and two lists of
(slope, rise) segments — one up the left flank, foot first, one down the
right, summit first. The generator turns those into vertices. Nothing here
is a curve or a rounded corner: a ridge is read from where its slope BREAKS,
so the segments are straight and the breaks do the work.

Slopes rather than coordinates because slope is the thing that is actually
being judged, and because it is the one quantity that survives every
resizing: the drawing is never stretched, only scaled and cropped, so a
segment written at 0.34 here is drawn at 34 pixels of rise per 100 across,
in a phone's band and in a wide window alike. Written as points, changing a
hill's width silently re-pitches every slope in it.

Three rules the numbers follow, all of them taken off the reference trace
rather than invented:

  POINTY HEADS. The LAST segment into a summit is the steepest of its
  flank, by a factor of two or so against the one below it (0.62 against
  0.40 on hill 3, 0.52 against 0.24 on hill 2). A summit approached by
  easing off reads as a dome; one approached by steepening reads as a peak.

  FLAT BODIES. Everything that is not that final pull sits between 0.10 and
  0.40. Flanks are long and the hills are wide for their height — hill 3
  runs 6.5 times its own height end to end. This is most of what separates
  these from the cones they replaced, which ran to 1.26.

  EASING OUT. Each flank's outermost segments taper — 0.22, then 0.10, then
  the flat — so the outline settles onto its ground rather than meeting it
  at a corner. That also makes the join with the stylesheet's continuation
  (see INFINITE GROUND) invisible, since there is almost no angle left to
  break at the frame's edge.

INFINITE GROUND

Each hill's outline leaves the frame's left and right edges HORIZONTAL, at
that hill's own ground level, and the path runs flat along those levels all
the way to both edges. So the drawing can be continued sideways forever by
a flat band at the same height — which is exactly what the stylesheet adds
as a second mask layer, letting the group sit in a window of any width
without stretching and without a seam. The ground levels are printed below
as fractions of the frame's height; they are the only numbers the CSS needs
from the geometry.

WHAT IS ACTUALLY SEEN

Worth knowing before spending effort on a flank, because it is much less
than half the drawing.

The wide layout centres the frame on the window but then covers everything
left of the picture's mat, which sits at 0.8914 of the window's HEIGHT. In
frame units either side of the centre, that leaves

    from  1783 - 1000 * (width / height)   to   1000 * (width / height)

so a 16:9 window shows +5 to +1778 and a 16:10 one +183 to +1600: the right
side of the frame and almost nothing else. Only past an aspect of about
1.78 does the centre clear the picture at all — which is the one thing to
know about this composition, since hill 3's summit sits exactly on that
centre and is therefore behind the picture on most laptops.

The narrow layout puts the centre on the window's left edge and shows 0 to
about +1940, so it is the same side of the frame again.

Neither ever shows hill 1's summit, off at -2000, nor hill 3's left flank.
What both show is hill 3's head and long right flank, hill 2's head
clearing it around +1120, and hill 1's flank underneath — so that is where
the segments are spent, and why hill 1's right flank has five of them and
its left three.
"""

import os

# --------------------------------------------------------------------------
# The shared frame. 1000 units tall = the group's height = the tallest hill.
# The width is symmetric about x = VB_W/2, which is hill 3's summit, and is
# set by the furthest-reaching foot in the set (hill 1's, at -4082).
# --------------------------------------------------------------------------
VB_H = 1000
VB_W = 8400
CENTRE = VB_W / 2  # 4200 — hill 3's summit, and the group's anchor point

# summit  height of the top above the frame's foot
# at      where that top goes, in units either side of CENTRE
# ground  the level the hill settles onto, and runs flat at to both edges
# up      (slope, rise) up the left flank, FOOT first, steepest last
# down    (slope, fall) down the right flank, SUMMIT first
# The rises in each list have to add up to summit - ground; the generator
# says so if they don't.
HILLS = {
    # Near, front, full strength. Its summit is off at -2000 and is never on
    # screen in either layout; what this hill is for is the long right flank
    # that runs under the other two and carries the footer row, so that flank
    # gets five segments and the left gets three. It is the flattest of the
    # three by some way — 0.34 at its steepest descent, easing to 0.055 — and
    # it is still descending where the narrow layout's window ends, which is
    # what keeps it from reading as a plinth.
    "hill-1.svg": dict(
        summit=760, at=-2000, ground=220,
        up=[(0.15, 130), (0.26, 180), (0.44, 230)],
        down=[(0.08, 24), (0.34, 190), (0.22, 150), (0.13, 110), (0.055, 66)],
    ),
    # Middle distance, right of centre, and the only hill whose head has to
    # clear another's flank: it is inside hill 3 until about +1120 and stands
    # 180 units clear at its own summit. That margin is small on purpose —
    # a head just breaking a further ridge reads as depth, a whole hill
    # standing beside it reads as two hills — but it is the first thing to
    # check after moving anything here.
    "hill-2.svg": dict(
        summit=700, at=1250, ground=190,
        up=[(0.14, 110), (0.24, 160), (0.52, 240)],
        down=[(0.13, 22), (0.48, 200), (0.29, 170), (0.12, 118)],
    ),
    # Far, centred, tallest — the frame's anchor, and the only hill whose
    # summit is pinned: it must sit on x = CENTRE, and it must reach u = VB_H,
    # because the box's height is defined as this hill's.
    #
    # A massif rather than a peak. Four segments up a left flank that is two
    # thirds the run of the right, the last of them at 0.62 to put a point on
    # it; then a 200-unit crest and five steps down, the first steep at 0.55
    # and the last at 0.10 as it settles. End to end it is 6522 units for 860
    # of rise.
    "hill-3.svg": dict(
        summit=1000, at=0, ground=140,
        up=[(0.16, 130), (0.26, 200), (0.40, 300), (0.62, 230)],
        down=[(0.11, 22), (0.55, 230), (0.36, 240), (0.22, 210), (0.10, 158)],
    ),
}


def vertices(spec):
    """(slope, rise) segments -> (x, u) vertices, left to right, with the
    flat runs out to both edges of the frame added."""
    top_x, top_u = CENTRE + spec["at"], spec["summit"]
    rise = spec["summit"] - spec["ground"]

    for side in ("up", "down"):
        got = sum(r for _, r in spec[side])
        assert abs(got - rise) < 1e-9, f"{side} rises {got}, needs {rise}"

    # Left flank: walk back down from the summit, steepest segment first,
    # which is why `up` is read in reverse.
    left, x, u = [], top_x, top_u
    for slope, r in reversed(spec["up"]):
        x, u = x - r / slope, u - r
        left.append((x, u))
    left.reverse()

    right, x, u = [], top_x, top_u
    for slope, r in spec["down"]:
        x, u = x + r / slope, u - r
        right.append((x, u))

    pts = [(0, spec["ground"])] + left + [(top_x, top_u)] + right \
        + [(VB_W, spec["ground"])]
    return [(round(x, 1), round(u, 1)) for x, u in pts]


def fmt(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return s if s not in ("", "-0") else "0"


def ridge_path(pts):
    """Vertices -> a closed path: the skyline, then down and back along the
    frame's foot. Straight segments throughout, so one L per vertex."""
    d = [f"M{fmt(pts[0][0])} {fmt(VB_H - pts[0][1])}"]
    d += [f"L{fmt(x)} {fmt(VB_H - u)}" for x, u in pts[1:]]
    d.append(f"L{VB_W} {VB_H}L0 {VB_H}Z")
    return "".join(d)


def check(name, pts, ground):
    """The rules a hill has to keep. Each breaks as a seam or a gap against
    the stylesheet rather than as an obviously wrong drawing, which is why
    they are asserted rather than left to the eye."""
    assert pts[0] == (0, ground) and pts[-1] == (VB_W, ground), \
        f"{name}: does not reach both edges at its ground"
    assert 0 <= pts[1][0] and pts[-2][0] <= VB_W, \
        f"{name}: a foot falls outside the frame — widen VB_W"
    assert min(u for _, u in pts) == ground, f"{name}: dips below its ground"
    assert all(b[0] > a[0] for a, b in zip(pts, pts[1:])), \
        f"{name}: x not monotonic — a flank doubles back"


def main():
    out = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "img")
    print(f"frame {VB_W}x{VB_H} ({VB_W / VB_H:g} : 1), centre x={fmt(CENTRE)}, "
          f"half-width {VB_W / VB_H / 2:g} heights\n")

    for name, spec in sorted(HILLS.items()):
        pts = vertices(spec)
        check(name, pts, spec["ground"])
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {VB_W} {VB_H}" width="{VB_W}" height="{VB_H}">'
            f'<path d="{ridge_path(pts)}"/></svg>'
        )
        with open(os.path.join(out, name), "w") as f:
            f.write(svg)

        g = spec["ground"] / VB_H
        span = pts[-2][0] - pts[1][0]
        print(f"{name:12s} {len(svg):5d} bytes  {len(pts):2d} vertices  "
              f"ground {g:.3f} (CSS: {100 - g * 100:g}%)  "
              f"summit {spec['summit'] / VB_H:.3f} at {spec['at'] / VB_H:+.3f}  "
              f"span {span:.0f} = {span / spec['summit']:.1f}x its height")


if __name__ == "__main__":
    main()
