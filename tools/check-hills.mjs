/* Check the home page's hill backdrop against the rules it is supposed to keep.
 *
 *     node tools/check-hills.mjs            # needs _site, so run a build first
 *     node tools/check-hills.mjs --quiet    # only failures
 *
 * Playwright is NOT a dependency of this site — adding it would make the
 * optional local preview in GUIDE.md section 6.8 a far bigger download for
 * the owner, who never runs this. Install it just for a run:
 *
 *     npm i --no-save playwright && npx playwright install chromium
 *
 * WHY THIS EXISTS
 *
 * The backdrop is placed against landmarks the page computes at runtime — the
 * foot of a link, the top of the footer row, the picture's mat — and the
 * stylesheet cannot measure any of them. So a handful of figures in main.css
 * were measured off the live page instead, and nothing about CSS will tell
 * you when one of them drifts. One already did: the 439px breakpoint read 430
 * for two rounds and was nine pixels wrong, silently, in a thoroughly
 * commented rule.
 *
 * Most of them are gone now — the narrow layout is given its link height and
 * sizes the type into it, rather than measuring the type — but --foot is
 * still a measurement of the page, and gen-hills.py holds a copy of it to cut
 * the near hill's tail with. That copy went stale the moment --foot moved,
 * and the run below is what said so.
 *
 * These are the same measurements that were being written by hand and thrown
 * away every time the backdrop changed. Kept, they take about twenty seconds.
 *
 * WHAT IT DOES
 *
 * Renders the page at a spread of sizes in both themes, reads the layout back
 * out of the DOM, and scans the pixels for the three hill tones — the tones
 * come from the stylesheet's own computed values, so re-colouring the hills
 * does not break the check. Then it asserts the rules the design is built on,
 * named as the design states them rather than as numbers.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "_site");
const BASE = "/nasty-cat-bonsai/";
const QUIET = process.argv.includes("--quiet");

/* Sizes worth checking, and why each one is here.
   The narrow ones bracket the 439px breakpoint where the footer row unwraps,
   and include the two screens where the page has no spare height at all. */
const SIZES = [
  { w: 320, h: 568, why: "smallest phone still supported; no spare height" },
  { w: 360, h: 740, why: "common Android" },
  { w: 375, h: 667, why: "older iPhone; no spare height" },
  { w: 393, h: 852, why: "current iPhone" },
  { w: 430, h: 932, why: "largest phone, just under the row's unwrap" },
  { w: 439, h: 900, why: "first width where the footer row unwraps" },
  { w: 600, h: 800, why: "small tablet, still the narrow layout" },
  { w: 767, h: 1024, why: "last width of the narrow layout" },
  { w: 768, h: 1024, why: "first width of the wide layout" },
  { w: 1280, h: 800, why: "laptop; the centre is behind the picture here" },
  { w: 1512, h: 982, why: "MacBook" },
  { w: 1920, h: 1080, why: "16:9 desktop" },
  { w: 2560, h: 1080, why: "ultrawide; the ground runs flat to both edges" },
  { w: 1920, h: 420, why: "short window; the near hill has to grow to hold the icons" },
  { w: 2013, h: 291, why: "the wide, short window the icons fell off" },
];

// ---------------------------------------------------------------------------

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".json": "application/json", ".xml": "application/xml",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".woff2": "font/woff2", ".png": "image/png" };

function serve() {
  const server = http.createServer((req, res) => {
    let p = path.join(SITE, decodeURIComponent(req.url.split("?")[0]).replace(BASE, "/"));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((ok) => server.listen(0, () => ok([server, server.address().port])));
}

/* Read the page's own idea of where everything is, plus the hill tones as the
   stylesheet computes them — so this never hard-codes a colour or a figure the
   stylesheet owns. */
const readLayout = () => {
  const R = (s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const q = e.getBoundingClientRect();
    return { top: q.top + scrollY, bottom: q.bottom + scrollY, left: q.left, right: q.right };
  };
  const css = getComputedStyle(document.documentElement);
  const fig = (n) => parseFloat(css.getPropertyValue(n));
  /* A custom property that holds a max()/clamp()/calc() comes back from
     getComputedStyle as the TOKENS, unresolved — "max(84px, 24vw, 104px)" —
     so parsing a number out of it gives NaN, and a NaN that is quietly turned
     into 0 is a rule that checks nothing. The only way to make the browser do
     the arithmetic is to spend the value on a real property: this hangs an
     empty box off the element the property is inherited by and measures it. */
  const resolve = (sel, name) => {
    const host = document.querySelector(sel);
    if (!host) return NaN;
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;width:0;height:var(${name})`;
    host.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  };
  const rgb = (s) => getComputedStyle(document.querySelector(s)).backgroundColor
    .match(/\d+/g).slice(0, 3).map(Number);
  return {
    pageH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    vw: innerWidth, vh: innerHeight,
    band: R(".hills"), links: R(".home-links"), social: R(".home-social"),
    hero: R(".hero-frame"),
    /* The last link's own box, read rather than taken from --link-h, so the
       rule checks the landmark and not the constant that claims to be it. */
    gallery: R(".home-links > a:last-child"),
    hillH: [1, 2, 3].map((n) => parseFloat(
      getComputedStyle(document.querySelector(`.hill-${n}`)).height)),
    tones: [rgb(".hill-1"), rgb(".hill-2"), rgb(".hill-3")],
    /* The narrow layout's reserved band, and what the footer icons need of the
       wide layout's — both as the stylesheet works them out. */
    bandGap: resolve(".home", "--band-gap"),
    bandIcons: resolve(".hills", "--band-icons"),
    h1Ground: fig("--h1-ground"),
    h1Last: fig("--h1-last"),
    /* The two boxes the wide layout's footer row spans, so the rule that the
       near hill carries it can be asked over those columns and no others. */
    socialX: (() => {
      const r = document.querySelector(".home-social")?.getBoundingClientRect();
      return r ? { left: r.left, right: r.right } : null;
    })(),
    socialColors: [...document.querySelectorAll(".home-social a, .home-social button")]
      .map((e) => getComputedStyle(e).color),
    summitOf: [1, 2, 3].map((n) => fig(`--h${n}-summit`)),
    stroke: innerWidth < 768 ? innerWidth * 0.04545 : innerHeight * 0.04052,
  };
};

/* Topmost pixel of each hill tone, per column.

   Nearest-tone rather than exact, because colour management shifts a flat
   fill by a level or two and exact matching finds nothing. But a loose match
   on ONE pixel is worse than useless here: the near hill's anti-aliased edge
   against the paper runs through every blend of the two, and at about 46% of
   the way it passes within five levels of the far hill's tone. A single stray
   pixel of that reads as a mountain 10px above where any mountain is drawn.
   So a match has to hold for RUN rows together — anti-aliasing is one or two
   pixels deep, a hill is hundreds. */
const RUN = 3;
const readPixels = async ({ b64, tones, from, RUN }) => {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const tops = tones.map(() => []);
  for (let x = 0; x < c.width; x++) {
    const seen = tones.map(() => null);
    const streak = tones.map(() => 0);
    for (let y = Math.max(0, from); y < c.height; y++) {
      const i = (y * c.width + x) * 4;
      for (let t = 0; t < tones.length; t++) {
        if (seen[t] !== null) continue;
        const [r, gr, b] = tones[t];
        if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - gr) + Math.abs(d[i + 2] - b) <= 12) {
          if (++streak[t] >= RUN) seen[t] = y - RUN + 1;
        } else streak[t] = 0;
      }
    }
    tones.forEach((_, t) => tops[t].push(seen[t]));
  }
  /* A summit is one vertex, but its topmost row of PIXELS is a run several
     wide, and that run is lopsided: it extends as far as one pixel of drop
     buys on each flank, which is 1.6px on a 0.62 slope and 9px on a 0.11 one.
     So the run's midpoint sits a few pixels to the shallow side of the real
     vertex. Its LEFT edge is the better estimate, because every hill here is
     drawn with its steepest pull last on the way up — see gen-hills.py, POINTY
     HEADS — which puts the steep side on the left of every summit. */
  const peak = (a) => {
    let best = null;
    a.forEach((v, i) => { if (v !== null && (best === null || v < a[best])) best = i; });
    if (best === null) return null;
    return { x: a.indexOf(a[best]), y: a[best] };
  };
  return { width: c.width, tops, peaks: tops.map(peak) };
};

// ---------------------------------------------------------------------------

const results = [];
const hidden = [];
const near = (a, b, tol) => a !== null && b !== null && Math.abs(a - b) <= tol;

function rule(size, theme, name, ok, detail) {
  results.push({ size, theme, name, ok, detail });
}

async function main() {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch {
    console.error("playwright is not installed. It is deliberately not a\n" +
      "dependency of this site; install it just for this run:\n\n" +
      "    npm i --no-save playwright && npx playwright install chromium\n");
    process.exit(2);
  }
  if (!fs.existsSync(SITE)) {
    console.error("_site is missing — run `npm run build` first.");
    process.exit(2);
  }

  const [server, port] = await serve();
  const url = `http://127.0.0.1:${port}${BASE}`;
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

  for (const size of SIZES) {
    const wide = size.w >= 768;
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width: size.w, height: size.h },
        deviceScaleFactor: 1, isMobile: !wide, hasTouch: !wide,
      });
      await ctx.addInitScript((t) => {
        try { if (t === "dark") localStorage.setItem("theme", "dark"); } catch {}
      }, theme);
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "networkidle" });

      /* The consent banner covers the whole lower page until it is answered,
         and pre-seeding its localStorage key does NOT dismiss it — the script
         only reads that key on a later visit. It has to be clicked, and
         forgetting to cost an hour once. */
      const decline = page.locator(".consent-banner button", { hasText: /decline/i }).first();
      if (await decline.count()) await decline.click({ force: true }).catch(() => {});
      /* And then get the pointer off the page. The banner's Decline button
         sits at (176, 798) on a 393px phone, and once the banner goes that
         point is on top of the RSS icon — so the click leaves it in :hover and
         it renders --olive while its neighbours render --home-social. It looks
         exactly like a colour bug in the footer and is not one; it does not
         happen in the wide layout only because the same button's centre lands
         on the picture there. */
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);

      const L = await page.evaluate(readLayout);

      /* Measurements come from the page as composed; the PIXEL scan gets the
         picture and the nav hidden first. Two reasons. The photograph carries
         greys within a level or two of the far hill's tone, so scanning the
         composed page finds the cat and calls it a mountain. And the picture
         covers the frame's centre on any window squarer than about 1.78 : 1,
         which would mean the tallest summit — the thing the whole composition
         is anchored to — could only be checked on a minority of screens.
         Hidden, it can be checked on all of them: the rule is about where the
         hill is DRAWN, not about how much of it a reader can see.

         `visibility: hidden` and not `display: none`, so nothing reflows and
         the hills stay exactly where the measurements above found them. */
      await page.evaluate(() => {
        for (const sel of [".hero-frame", ".home-nav", ".theme-toggle", ".consent-banner"])
          document.querySelector(sel)?.style.setProperty("visibility", "hidden");
      });
      await page.waitForTimeout(120);

      /* Start the scan at the highest row any hill can reach — each layer is
         anchored to the page's foot and its ink tops out at its summit's
         share of its own height — rather than at a fixed margin above the
         band, which the near hill outgrows on a wide narrow-layout window. */
      const ceiling = Math.max(...L.hillH.map((h, n) => h * L.summitOf[n]));
      const shot = await page.screenshot({ fullPage: true });
      const P = await page.evaluate(readPixels, {
        b64: shot.toString("base64"), tones: L.tones, RUN,
        from: Math.floor(L.pageH - ceiling) - 3,
      });

      const tag = `${size.w}x${size.h}`;
      rule(tag, theme, "the page does not scroll sideways", L.overflowX <= 0,
        `overflow ${L.overflowX}px`);
      rule(tag, theme, "the footer row is all one colour at rest",
        new Set(L.socialColors).size === 1, L.socialColors.join(" "));

      const bandH = L.band.bottom - L.band.top;

      if (wide) {
        /* The band is the lower half of the window — or as much more as the
           footer icons need, on a window short and wide enough that the near
           hill's ground would otherwise be under them — and the tallest hill
           fills it exactly, so its tip lands on the window's centre lines.
           Both halves of that are the stylesheet's own arithmetic, read back
           rather than repeated here. */
        const wantBand = Math.max(size.h / 2, L.bandIcons);
        rule(tag, theme, "band is the window's lower half, or what the icons need",
          near(bandH, wantBand, 1),
          `${bandH.toFixed(1)} vs ${wantBand.toFixed(1)} ` +
          `(half ${size.h / 2}, icons ${L.bandIcons.toFixed(1)})`);
        /* All three stay inside the band, whatever it came out at — they are
           drawn at its full height and every summit is a fraction of that.
           The band grows as a whole rather than one hill at a time, which is
           what keeps this rule simple and the composition intact: see THE
           WHOLE BAND AND NOT JUST THE ONE HILL in main.css. */
        rule(tag, theme, "no hill rises above the band",
          P.peaks.every((p) => p === null || p.y >= L.band.top - 1),
          `highest ${Math.min(...P.peaks.filter(Boolean).map((p) => p.y))} vs ${L.band.top}`);

        /* THE FOOTER ICONS SIT ON THE NEAR HILL, which is the whole reason
           that hill has a height floor. Asked over the row's own columns and
           with the row's own top, so it is the landmark being checked and not
           a figure that claims to be it. This is what a 2013x291 window failed
           before the floor went in. */
        if (L.socialX !== null && L.socialX.right <= size.w + 1) {
          rule(tag, theme, "the near hill carries the footer row",
            Array.from({ length: Math.ceil(L.socialX.right - L.socialX.left) },
                       (_, i) => P.tops[0][Math.round(L.socialX.left) + i])
              .every((y) => y !== null && y <= L.social.top + 1),
            `row x ${Math.round(L.socialX.left)}..${Math.round(L.socialX.right)}, ` +
            `top ${Math.round(L.social.top)}`);
        } else if (!QUIET) {
          /* The wide layout puts the nav at 89.14dvh from the left, so on a
             window narrower than that — 768x1024 is the one here — the nav and
             half the picture are off the right-hand side of it. That is the
             layout being used out of its range, not the backdrop being wrong,
             and there is nothing on screen to carry. */
          console.log(`  ${tag} ${theme}: the footer row is off the right of the ` +
            `window (the wide layout wants a landscape one) — nothing to carry`);
        }

        rule(tag, theme, "tallest summit reaches the band's top",
          near(P.peaks[2]?.y, L.band.top, 2),
          `summit y ${P.peaks[2]?.y} vs ${L.band.top}`);
        rule(tag, theme, "tallest summit on the window's centre line",
          near(P.peaks[2]?.x, size.w / 2, 4),
          `summit x ${P.peaks[2]?.x} vs ${size.w / 2}`);

        /* Not a rule, but the one fact about this composition worth knowing,
           and it changes with the window rather than with the code: the
           picture's mat reaches 0.8914 of the window's HEIGHT, so on anything
           squarer than about 1.78 : 1 the tallest summit is correctly placed
           and entirely behind the picture. */
        if (theme === "light" && L.hero.right >= size.w / 2) hidden.push(tag);
      } else {
        const sixth = size.w / 6;
        const groundPx = L.hillH[0] * L.h1Ground;
        const roomBehind = bandH - groundPx;
        const bandGap = L.bandGap;
        /* Whether a hill's summit is actually out in the open, asked where it
           matters: at the column the summit stands in, against the near hill's
           silhouette THERE. Comparing against the near hill's ground instead
           is the obvious mistake and a wrong one — that ground is only reached
           at its toe, on the window's right edge, and by the left of a wide
           narrow-layout window the same flank is 200px higher and buries
           everything. 12px is the point past which a summit is a shape rather
           than a few pixels the scan cannot place. */
        const clear = (col, y) => {
          const over = P.tops[0][Math.round(col)];
          return over === null ? Infinity : over - y;
        };
        rule(tag, theme, "band starts at the links' foot",
          near(L.band.top, L.links.bottom, 1),
          `band ${L.band.top} vs links ${L.links.bottom}`);
        rule(tag, theme, "near hill's ground on the footer row's top",
          near(P.tops[0][P.width - 1], L.social.top, 2),
          `${P.tops[0][P.width - 1]} vs ${Math.round(L.social.top)}`);

        /* THE BAND IS RESERVED, NOT LEFT OVER. The gap between the links' foot
           and the near hill's ground is --band-gap, put into the flow as the
           links' bottom margin, and it is there at every size — including the
           sizes where the page is shorter than its content. Before that, this
           gap was 4px on a 393x750 phone and there was nowhere for the other
           two hills to stand. Read from the stylesheet rather than written
           here, so changing it is a one-line change. */
        rule(tag, theme, "the band clears the near hill's ground by --band-gap",
          roomBehind >= bandGap - 1,
          `${roomBehind.toFixed(0)}px of clear sky, --band-gap is ${bandGap.toFixed(0)}px`);

        /* The flank holds one pitch from the right edge to the break, and four
           times that from the break on to the left. Where the break falls is
           the drawing's own business — it is the closing segment's run, which
           the generated figures give as --h1-last — so it is read from there
           and the two pitches are sampled on either side of it, over the outer
           four fifths of each, so no reading is taken across the corner.

           The tolerance is wide because the shallow side is shallow: 0.055
           over 150px is 8px of drop, and a pixel of rounding at each end is
           already a tenth of the answer. It is still a real check — it fails
           at once on a flank that was never steepened, or steepened twice. */
        const slope = (a, b) => (P.tops[0][a] - P.tops[0][b]) / (b - a);
        const tailPx = L.h1Last * L.hillH[0];
        const brk = size.w - tailPx;
        const right = slope(Math.round(brk + (size.w - brk) * 0.2), P.width - 2);
        /* Both segments are one run long, so the steep one is the run BEFORE
           the break and not everything left of it — on a 600px window there
           is a third, gentler segment beyond that, and reading across it gave
           2.95x for a flank that is a clean 4. */
        const left = slope(Math.max(2, Math.round(brk - tailPx * 0.95)),
                           Math.round(brk - tailPx * 0.1));
        const ratio = Math.abs(left) / Math.abs(right);
        rule(tag, theme, "near hill's flank quadruples its pitch at the break",
          brk > 20 && ratio > 3 && ratio < 5,
          `break at ${brk.toFixed(0)} of ${size.w}: ` +
          `left ${Math.abs(left).toFixed(3)} vs right ${Math.abs(right).toFixed(3)} ` +
          `= ${ratio.toFixed(2)}x`);

        /* And the break belongs on the WINDOW'S MIDDLE — on the phone the
           drawing is cut for, at least, which is 393px wide. It drifts either
           side of that by design (the drawing is one shape, the window is
           not), so this is asserted where it is meant to be exact and noted
           where it is not.

           This is the rule that caught gen-hills.py's copy of --foot going
           stale: --foot moved from 102 to 84, the hill was drawn 100px
           shorter, and the break slid from the middle of the phone to 41% of
           it — with every other rule still passing. */
        if (size.w === 393)
          rule(tag, theme, "on a 393px phone the break is on the window's middle",
            near(brk, size.w / 2, 2), `${brk.toFixed(1)} vs ${size.w / 2}`);
        else if (!QUIET)
          console.log(`  ${tag} ${theme}: the flank breaks at ${brk.toFixed(0)} of ` +
            `${size.w}px — ${(Math.abs(brk - size.w / 2) / size.w * 100).toFixed(0)}% ` +
            `off the middle, which is the drift the cut is allowed`);
        /* The near hill's ground IS the row's top now, so at the one column
           where they meet the first painted pixel falls a row below it. The
           +1 is that rounding and nothing else. */
        rule(tag, theme, "near hill carries the whole footer row",
          P.tops[0].every((y) => y !== null && y <= L.social.top + 1),
          `lowest ${Math.max(...P.tops[0].filter((y) => y !== null))} vs row ${L.social.top}`);

        /* BOTH HILLS BEHIND ARE OUT IN THE OPEN, at every size — this used to
           be conditional, and the condition was the bug: on a real phone the
           page had no room left and the checks quietly skipped rather than
           failed. The band is now reserved in the flow (see --band-gap in
           main.css), so there is no size at which either summit is buried and
           no reason to ask whether it is.

           12px is the point past which a summit is a shape rather than a few
           antialiased pixels the scan cannot place. */
        const galleryMid = (L.gallery.top + L.gallery.bottom) / 2;
        const want = [null, { col: sixth * 5, y: L.links.bottom + L.stroke },
                            { col: sixth, y: galleryMid }];
        const clearOf = (n) => clear(want[n].col, want[n].y);
        rule(tag, theme, "both hills behind stand clear of the near one",
          clearOf(1) >= 12 && clearOf(2) >= 12,
          `far ${clearOf(2).toFixed(0)}px, middle ${clearOf(1).toFixed(0)}px of clear sky`);
        rule(tag, theme, "far summit a sixth in from the left, on the gallery link's middle",
          near(P.peaks[2]?.x, sixth, 3) && near(P.peaks[2]?.y, galleryMid, 3),
          `(${P.peaks[2]?.x}, ${P.peaks[2]?.y}) vs (${Math.round(sixth)}, ${Math.round(galleryMid)})`);
        rule(tag, theme, "middle summit a sixth in from the right, one stroke down",
          near(P.peaks[1]?.x, sixth * 5, 3) && near(P.peaks[1]?.y, L.links.bottom + L.stroke, 3),
          `(${P.peaks[1]?.x}, ${P.peaks[1]?.y}) vs (${Math.round(sixth * 5)}, ${Math.round(L.links.bottom + L.stroke)})`);
      }
      await ctx.close();
    }
  }

  await browser.close();
  server.close();

  const bad = results.filter((r) => !r.ok);
  if (!QUIET) {
    const names = [...new Set(results.map((r) => r.name))];
    for (const n of names) {
      const all = results.filter((r) => r.name === n);
      const fails = all.filter((r) => !r.ok).length;
      console.log(`${fails ? "FAIL" : "ok  "}  ${n}  (${all.length - fails}/${all.length})`);
    }
  }
  if (bad.length) {
    console.log("\nfailures:");
    for (const r of bad) console.log(`  ${r.size} ${r.theme}  ${r.name}  —  ${r.detail}`);
    process.exit(1);
  }
  console.log(`\nall ${results.length} checks pass across ${SIZES.length} sizes, both themes`);
  if (hidden.length)
    console.log(`note: the picture covers the frame's centre at ${hidden.join(", ")} — ` +
      `the tallest summit is placed correctly there but a reader cannot see it`);
}

main();
