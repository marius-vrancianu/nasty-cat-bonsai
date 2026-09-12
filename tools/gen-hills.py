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

ONE GENERATOR, NOT TWO

There is no separate wide and narrow generator, and there should not be: the
SVG is the same drawing in both layouts, and cutting it in two would put the
same ridge in two files for the drift between them to open up — which is the
exact thing this script exists to prevent. What DOES differ between the
layouts is where each hill is put and how big it is drawn, and that is the
stylesheet's job, not this file's. The split that matters is shape here,
placement there.

The seam between the two used to be six numbers copied by hand into
main.css. They are now WRITTEN there, into the marked block this script
maintains (see CSS_PATH below), so the stylesheet can say

    --h: calc((var(--hills-h) - var(--stroke)) / var(--h2-summit))

and mean it, instead of restating 0.70 and hoping. Re-running this script is
what keeps them in step; nothing else has to.

HOW TO ASK FOR A CHANGE

Three kinds, and they cost very different amounts.

  SHAPE — "hill 2's head pointier", "flatten hill 1's tail", "another break
  in that flank". One line in the table below, both layouts at once, and the
  asserts catch a broken one. Cheapest thing here. Say it in slopes if you
  can ("that last pull nearer 0.7") but "pointier" is fine; slope is what it
  turns into.

  PLACEMENT AGAINST THE PAGE — "hill 3's summit on the foot of the gallery
  link", "hill 1's ground a stroke over the footer icons", "a sixth in from
  the right". One rule in main.css, per layout. This is the vocabulary that
  works: one FEATURE of one hill (summit, ground, heel, toe) onto one
  LANDMARK the page already has (a window edge or fraction of it, the
  picture's mat, an element's edge). Both halves are things that exist, so
  the rule can be written once and stay true at every size.

  PLACEMENT AGAINST ANOTHER HILL — "hill 2's head 180 units clear of hill
  3's flank". Also cheap, but it belongs HERE, in `at` and the slopes, not
  in the stylesheet: the frame is the only place the three hills share a
  coordinate system. The stylesheet only ever sees one hill at a time.

  What is expensive is asking for both at once — "a sixth in from the right
  AND 180 clear of hill 3" — because the two can disagree at some window
  size and something has to give. Say which one wins.

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

Neither ever shows hill 1's summit, at -625, nor hill 3's left flank. What
both show is hill 3's head and long right flank, hill 2's head clearing it
around +1120, and hill 1's flank underneath — so that is where the segments
are spent, and why hill 1's right flank has six of them and its left three.
"""

import os
import re

HERE = os.path.dirname(__file__)
IMG_PATH = os.path.join(HERE, "..", "src", "assets", "img")
CSS_PATH = os.path.join(HERE, "..", "src", "assets", "css", "main.css")

# The stylesheet keeps a block of figures this script owns. Everything between
# these two lines is rewritten on every run; everything outside is never
# touched. Both must already be present — a missing marker is an error rather
# than something to helpfully re-create, since it means someone has edited the
# stylesheet in a way this script cannot reason about.
MARK_A = "/* >>> figures written by tools/gen-hills.py — do not edit by hand */"
MARK_B = "/* <<< end of the generated figures */"

# --------------------------------------------------------------------------
# The shared frame. 1000 units tall = the group's height = the tallest hill.
# The width is symmetric about x = VB_W/2, which is hill 3's summit, and is
# set by the furthest-reaching foot in the set (hill 3's own, at +3819).
# Changing it is safe: the stylesheet reads every position out of the
# generated figures, which are all relative to a hill's own height, so a
# wider or narrower frame moves nothing on the page.
# --------------------------------------------------------------------------
VB_H = 1000
VB_W = 7700
CENTRE = VB_W / 2  # 4200 — hill 3's summit, and the group's anchor point

# summit  height of the top above the frame's foot
# at      where that top goes, in units either side of CENTRE
# ground  the level the hill settles onto, and runs flat at to both edges
# up      (slope, rise) up the left flank, FOOT first, steepest last
# down    (slope, fall) down the right flank, SUMMIT first
# The rises in each list have to add up to summit - ground; the generator
# says so if they don't.
HILLS = {
    # Near, front, full strength. Its summit sits at half hill 2's distance
    # from the centre, on the other side — the only thing fixing it, and the
    # reason `at` is -625 against hill 2's +1250. It is still never on screen:
    # the wide layout's picture covers everything left of +5, and the narrow
    # one starts at the centre.
    #
    # What this hill is for is the long right flank that runs under the other
    # two and carries the footer row, so that flank gets six segments and the
    # left gets three. It is the flattest of the three by some way — 0.34 at
    # its steepest descent, easing to 0.055 — and it is still descending where
    # either window ends, which is what keeps it from reading as a plinth.
    #
    # THE TAIL IS CUT TO THE NARROW LAYOUT'S WINDOW. There, this hill's toe is
    # pinned to the window's right edge, so a run measured back from the toe
    # is a run measured back from that edge. 347 units at 0.055 reaches the
    # middle of a 393px phone; 347 more at FOUR TIMES that pitch reaches its
    # left edge. The window is 694 units wide there because the hill is drawn
    # at foot/0.18 = 567px and 393/0.567 = 693.
    #
    # That is exact at 393 and drifts either side, since the window's width in
    # units follows the viewport while the break does not. It cannot be
    # otherwise — the drawing is one shape and the window is not — and either
    # side of 393 it still reads as "about the middle", which is what it is
    # for.
    #
    # WHY THE GROUND IS 180 AND NOT 220. Quadrupling that pitch costs 46 more
    # units of fall than the segment it replaces, and the fall budget is
    # summit - ground. Taking it from the 0.13 segment above would shorten
    # that segment, and the 0.13 segment is precisely what the WIDE layout is
    # looking at — it would drag the steepened part left into view and change
    # a layout that is finished. Lowering the ground grows the budget instead,
    # and 180 is the loosest value that still leaves the 0.13 running past
    # +1778, where a 16:9 window ends. The wide layout's flank is then
    # unchanged to within half a pixel, and the steepening begins at +1844,
    # just off the edge of it.
    #
    # The left flank gains the same 40 units so the two sides still balance;
    # it is never on screen in either layout.
    #
    # Beyond about 2100px at 1080 tall the window does reach past +1844 and
    # the steepened segment comes into view, sitting roughly 20px lower at the
    # far right than it used to. Nothing can prevent that: the narrow layout
    # defines that stretch of flank and an ultrawide window can see it.
    "hill-1.svg": dict(
        note="near, front",
        summit=760, at=-625, ground=180,
        up=[(0.15, 170), (0.26, 180), (0.44, 230)],
        down=[(0.08, 24), (0.34, 190), (0.22, 150),
              (0.13, 120.64), (0.22, 76.29), (0.055, 19.07)],
    ),
    # Middle distance, right of centre, and the only hill whose head has to
    # clear another's flank: it is inside hill 3 until about +1120 and stands
    # 180 units clear at its own summit. That margin is small on purpose —
    # a head just breaking a further ridge reads as depth, a whole hill
    # standing beside it reads as two hills — but it is the first thing to
    # check after moving anything here.
    "hill-2.svg": dict(
        note="middle distance, right of centre",
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
        note="far, centred, tallest",
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


def num(v):
    """A CSS number: no trailing zeros, no exponent, enough places for 5.787."""
    return f"{v:.4f}".rstrip("0").rstrip(".") or "0"


def figures(name, spec, pts):
    """The handful of numbers the stylesheet needs about one hill, all of them
    in units of that hill's own DRAWN HEIGHT — which is the only unit both
    sides can agree on, since the stylesheet picks the height and this file
    never sees it. A rule that wants a feature at some place on the page then
    reads `<place> - var(--h) * var(--hN-<feature>)` and is done."""
    tag = name.split(".")[0].replace("hill-", "h")   # hill-2.svg -> h2
    ground = spec["ground"] / VB_H
    return tag, [
        ("summit", num(spec["summit"] / VB_H), "top, as a fraction of the height"),
        ("ground", num(ground), "the level it settles onto"),
        ("sky", num((1 - ground) * 100) + "%", "all of it above that ground"),
        ("peak", num((CENTRE + spec["at"]) / VB_H), "summit, from the frame's left edge"),
        ("heel", num(pts[1][0] / VB_H), "first corner off the left flat run"),
        ("toe", num(pts[-2][0] / VB_H), "last corner before the right flat run"),
        ("last", num((pts[-2][0] - pts[-3][0]) / VB_H), "run of the closing segment"),
    ]


def css_with(blocks):
    """The stylesheet as it SHOULD be: everything outside the two markers left
    exactly as it is, everything between them rebuilt. Returning the whole
    file rather than writing it is what lets --check compare without touching
    anything."""
    css = open(CSS_PATH).read()
    for mark in (MARK_A, MARK_B):
        if css.count(mark) != 1:
            raise SystemExit(f"main.css: expected exactly one {mark!r}")
    a, b = css.index(MARK_A), css.index(MARK_B)
    if b < a:
        raise SystemExit("main.css: the generated block's markers are inverted")

    out = [MARK_A, ":root {",
           "  /* The frame every hill file shares, in units of its own height. */",
           f"  --hills-frame: {num(VB_W / VB_H)};",
           f"  --hills-mid: {num(VB_W / VB_H / 2)};"]
    for tag, rows, note in blocks:
        out.append(f"\n  /* {tag} — {note} */")
        for prop, val, why in rows:
            out.append(f"  --{tag}-{prop}: {val};".ljust(28) + f"/* {why} */")
    out += ["}", ""]
    return css[:a] + "\n".join(out) + "\n" + css[b:]


def build():
    """Everything this script produces, as strings. Nothing is written here,
    so the same code path serves both writing and checking — which is the
    point: a --check that rebuilt things differently would be no check."""
    svgs, blocks, report = {}, [], []
    for name, spec in sorted(HILLS.items()):
        pts = vertices(spec)
        check(name, pts, spec["ground"])
        svgs[name] = (
            f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {VB_W} {VB_H}" width="{VB_W}" height="{VB_H}">'
            f'<path d="{ridge_path(pts)}"/></svg>'
        )
        tag, rows = figures(name, spec, pts)
        blocks.append((tag, rows, spec["note"]))

        g = spec["ground"] / VB_H
        span = pts[-2][0] - pts[1][0]
        report.append(
            f"{name:12s} {len(svgs[name]):5d} bytes  {len(pts):2d} vertices  "
            f"ground {g:.3f}  summit {spec['summit'] / VB_H:.3f} "
            f"at {spec['at'] / VB_H:+.3f}  "
            f"span {span:.0f} = {span / spec['summit']:.1f}x its height")
    return svgs, css_with(blocks), report


def main(check_only=False):
    svgs, css, report = build()
    print(f"frame {VB_W}x{VB_H} ({VB_W / VB_H:g} : 1), centre x={fmt(CENTRE)}, "
          f"half-width {VB_W / VB_H / 2:g} heights\n")
    print("\n".join(report))

    targets = [(os.path.join(IMG_PATH, n), t) for n, t in svgs.items()]
    targets.append((CSS_PATH, css))

    if check_only:
        stale = [os.path.basename(f) for f, want in targets
                 if not os.path.exists(f) or open(f).read() != want]
        if stale:
            print(f"\nSTALE: {', '.join(stale)}")
            print("The drawings or the figures in main.css do not match this "
                  "script.\nRun:  python3 tools/gen-hills.py")
            raise SystemExit(1)
        print("\nup to date: the three drawings and main.css's generated "
              "figures all match this script")
        return

    for f, text in targets:
        with open(f, "w") as fh:
            fh.write(text)
    print(f"\nwrote 3 drawings and main.css's generated block")


if __name__ == "__main__":
    import sys
    main(check_only="--check" in sys.argv)
