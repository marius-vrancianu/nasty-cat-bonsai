#!/usr/bin/env python3
"""Generate the three hill silhouettes behind the home page.

    python3 tools/gen-hills.py           # write the SVGs and main.css's block
    python3 tools/gen-hills.py --check   # verify they match; change nothing

Writes src/assets/img/hill-1.svg, hill-2.svg, hill-3.svg and the generated
block of figures in main.css (between the >>> / <<< markers). Edit the tables
below and re-run; never edit the SVGs or that block by hand.

WHY A SCRIPT: the three hills are one drawing cut into three files and must
register exactly (hill 2's head clearing hill 3's flank is the whole depth
cue) at every scale. Hand-kept SVGs drift.

ONE SHARED FRAME. Every file has the SAME viewBox — the group's bounding box
(VB_W x VB_H), symmetric about hill 3's summit — with its hill drawn in
place, so any subset stacks with no per-file offsets and "centre the image"
= "put the tallest tip on the centre line".

WHAT THE FILES CONTAIN: one flat-filled <path>, no colour. They are CSS
masks over boxes painted in each hill's OPAQUE tone (main.css owns colours),
so one file serves both themes and a nearer hill hides a further one.

HOW A HILL IS WRITTEN: a summit height, a position (`at`, units from the
centre), a ground level, and two lists of (slope, rise) segments — up the
left flank foot first, down the right flank summit first. Straight segments
only; a ridge reads from where its slope breaks. Slopes rather than points,
because the drawing is only ever scaled and cropped, never stretched, so a
slope is what survives every window. Three rules, taken from the reference:

  POINTY HEADS  the last segment into a summit is the steepest of its flank
                (~2x the one below): a peak, not a dome.
  FLAT BODIES   everything else between 0.10 and 0.40; wide, long hills.
  EASING OUT    outermost segments taper (0.22, 0.10, flat) so the outline
                settles onto its ground and meets the CSS continuation
                without a visible corner.

INFINITE GROUND: each outline leaves the frame horizontally at its own
ground level, and the stylesheet continues it to both window edges with a
second mask layer, so the group fits any window width without stretching.

SHAPE HERE, PLACEMENT IN CSS. One drawing serves both layouts; where and how
big each hill is drawn is main.css's job, using the generated figures
(--hN-summit, --hN-peak, ...) so the stylesheet never restates a number.
How to ask for changes:
  - shape ("hill 2's head pointier"): a line in the tables below.
  - a hill against the page ("summit on the gallery link"): one rule in
    main.css per layout — a hill FEATURE onto a page LANDMARK.
  - a hill against another hill ("180 units clear of hill 3"): here, in
    `at` and the slopes; only the frame shares coordinates.
  Asking for both kinds at once can conflict at some window size — say
  which wins.

WHAT IS ACTUALLY SEEN is much less than the drawing. Wide layout: the frame
is centred but the picture covers everything left of 0.8914 x the window
height, leaving frame units from 1783 - 1000*(w/h) to 1000*(w/h) either side
of the centre (16:9 shows +5..+1778), so hill 3's summit is behind the
picture on most laptops. Narrow layout: each hill is placed separately
(main.css), and the window again sees mostly the right-hand side of the
frame. Neither shows hill 1's summit or hill 3's left flank — segments are
spent where they are seen, except hill 1's left flank (see its entry).
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
# Symmetric about x = VB_W/2 (hill 3's summit); its width is set by the
# furthest-reaching foot, hill 1's left one at CENTRE - 4815. Changing it is
# safe: the stylesheet reads every position from the generated figures.
# --------------------------------------------------------------------------
VB_H = 1000
VB_W = 10400
CENTRE = VB_W / 2  # 5200 — hill 3's summit, and the group's anchor point

# --------------------------------------------------------------------------
# The narrow layout's window — the only figures here taken from the
# STYLESHEET, because hill 1's tail is solved from them.
#
# NARROW_FOOT is main.css's --foot below 439px (the footer row's top above
# the page's foot). The stylesheet draws hill 1 at --foot / its ground, so the
# two must agree, or the break in its flank stops landing on the window's
# middle; tools/check-hills.mjs asserts that it does.
# --------------------------------------------------------------------------
NARROW_FOOT = 84     # px, = main.css's --foot under 439px wide
NARROW_PHONE = 393   # px, the window the break is exact on

# summit  height of the top above the frame's foot
# at      where that top goes, in units either side of CENTRE
# ground  the level the hill settles onto, and runs flat at to both edges
# up      (slope, rise) up the left flank, FOOT first, steepest last
# down    (slope, fall) down the right flank, SUMMIT first
# The rises in each list have to add up to summit - ground; the generator
# says so if they don't.

# Hill 1's right flank, solved rather than written — see THE TAIL IS CUT and
# WHAT PAYS FOR THE TAIL in its entry below. The four segments off the summit
# are fixed; the closing pair is two runs of half the phone's window each, at
# a pitch and four times it; and the ground is whatever makes those two add
# up to the fall that is left.
H1_SUMMIT = 760
H1_DOWN_FIXED = [(0.08, 24), (0.34, 190), (0.22, 150), (0.13, 120.64)]
H1_TAIL_PITCH = (0.22, 0.055)
H1_UP_INNER = [(0.14, 190), (0.26, 140), (0.44, 130)]

_fixed = sum(r for _, r in H1_DOWN_FIXED)
# Drawn at NARROW_FOOT / ground px, so half of a NARROW_PHONE window is
# NARROW_PHONE * ground / (2 * NARROW_FOOT) units. Each tail segment is that
# long, both are paid for out of summit - ground, and that is one equation in
# one unknown.
_half = lambda g: NARROW_PHONE * g / (2 * NARROW_FOOT)
# Rounded to a tenth of a unit, because the drawing is written to that and the
# ground has to land on a vertex exactly. The tail is then re-cut to whatever
# fall is actually left, which puts the break 0.02% off the window's middle —
# four hundredths of a pixel on the phone it is cut for.
H1_GROUND = round((H1_SUMMIT - _fixed) / (1 + sum(H1_TAIL_PITCH) * _half(1)), 1)
_run = (H1_SUMMIT - H1_GROUND - _fixed) / sum(H1_TAIL_PITCH)
H1_TAIL = [(p, p * _run) for p in H1_TAIL_PITCH]
# The left flank's outermost segment takes up the slack, so both sides still
# add to summit - ground whatever the ground came out at.
H1_UP_OUTER = (0.06, H1_SUMMIT - H1_GROUND - sum(r for _, r in H1_UP_INNER))

HILLS = {
    # Near, front, full strength. Summit at -625 (half hill 2's distance from
    # the centre, other side); never on screen. Its job is the long right flank
    # that runs under the other two and carries the footer row: six segments,
    # 0.34 at its steepest easing to 0.055, still descending where the window
    # ends so it never reads as a plinth.
    #
    # THE LEFT FLANK IS THE WIDE LAYOUT'S HORIZON: four segments, ~4400 units,
    # written for SHORT, WIDE windows where the whole frame is on screen (a
    # shorter flank left the footer icons on a flat plinth). Its closing 0.06
    # matches the right tail's pitch, so the hill reads as one shape.
    #
    # THE TAIL IS CUT TO THE NARROW LAYOUT'S WINDOW. There the toe is pinned to
    # the window's right edge; the last segment (0.055) reaches the middle of a
    # NARROW_PHONE window, and the one before it (4x that pitch) the left edge.
    # Both runs are half a window = NARROW_PHONE * ground / (2 * NARROW_FOOT)
    # units. Exact at 393px, "about the middle" either side.
    #
    # WHAT PAYS FOR THE TAIL is the ground, which is therefore solved, not
    # chosen: the steeper pitch costs fall, and taking it from the 0.13 segment
    # above would pull the steepening into the wide layout's view. Lowering the
    # ground (to ~168) keeps the 0.13 running past +1778, the edge of a 16:9
    # window. Past ~2100px wide at 1080 tall the steepened stretch does come
    # into view — unavoidable, since both layouts share this flank.
    "hill-1.svg": dict(
        note="near, front",
        summit=H1_SUMMIT, at=-625, ground=H1_GROUND,
        up=[H1_UP_OUTER] + H1_UP_INNER,
        down=H1_DOWN_FIXED + H1_TAIL,
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
        # A pitch, not a length: rise over run, so it is the same number in
        # units and in pixels and needs no height to use. It is the GENTLEST
        # segment of the left flank — every segment above it is steeper by
        # construction (see POINTY HEADS) — which is what lets a rule ask how
        # high the flank is at some distance from the summit and be sure the
        # answer is a floor rather than a guess.
        ("approach", num((pts[2][1] - pts[1][1]) / (pts[2][0] - pts[1][0])),
         "pitch of the outermost segment of the left flank"),
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
