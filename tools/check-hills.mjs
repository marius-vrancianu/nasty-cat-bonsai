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
 * are measured off the live page instead (--links-h, --nav-h, --foot, and the
 * 439px breakpoint), and nothing about CSS will tell you when one of them
 * drifts. One already did: the breakpoint read 430 for two rounds and was
 * nine pixels wrong, silently, in a thoroughly commented rule.
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
  const rgb = (s) => getComputedStyle(document.querySelector(s)).backgroundColor
    .match(/\d+/g).slice(0, 3).map(Number);
  return {
    pageH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    vw: innerWidth, vh: innerHeight,
    band: R(".hills"), links: R(".home-links"), social: R(".home-social"),
    hero: R(".hero-frame"),
    hillH: [1, 2, 3].map((n) => parseFloat(
      getComputedStyle(document.querySelector(`.hill-${n}`)).height)),
    tones: [rgb(".hill-1"), rgb(".hill-2"), rgb(".hill-3")],
    h1Ground: fig("--h1-ground"),
    stroke: innerWidth < 768 ? innerWidth * 0.04545 : innerHeight * 0.04052,
  };
};

/* Topmost pixel of each hill tone, per column. Nearest-tone with a small
   tolerance: the browser's colour management shifts a flat fill by a level or
   two, so exact matching finds nothing. */
const readPixels = async ({ b64, tones, from }) => {
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
    for (let y = Math.max(0, from); y < c.height; y++) {
      const i = (y * c.width + x) * 4;
      for (let t = 0; t < tones.length; t++) {
        if (seen[t] !== null) continue;
        const [r, gr, b] = tones[t];
        if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - gr) + Math.abs(d[i + 2] - b) <= 12)
          seen[t] = y;
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

      const shot = await page.screenshot({ fullPage: true });
      const P = await page.evaluate(readPixels,
        { b64: shot.toString("base64"), tones: L.tones, from: Math.floor(L.band.top) - 40 });

      const tag = `${size.w}x${size.h}`;
      rule(tag, theme, "the page does not scroll sideways", L.overflowX <= 0,
        `overflow ${L.overflowX}px`);

      if (wide) {
        /* The band is the lower half of the window, and the tallest hill fills
           it exactly — so its tip lands on the window's own centre lines. */
        rule(tag, theme, "band is the window's lower half",
          near(L.band.top, size.h / 2, 1), `top ${L.band.top} vs ${size.h / 2}`);
        rule(tag, theme, "no hill rises above the band",
          P.peaks.every((p) => p === null || p.y >= L.band.top - 1),
          `highest ${Math.min(...P.peaks.filter(Boolean).map((p) => p.y))} vs ${L.band.top}`);

        rule(tag, theme, "tallest summit reaches the band's top",
          near(P.peaks[2].y, L.band.top, 1),
          `summit y ${P.peaks[2]?.y} vs ${L.band.top}`);
        rule(tag, theme, "tallest summit on the window's centre line",
          near(P.peaks[2].x, size.w / 2, 4), `summit x ${P.peaks[2]?.x} vs ${size.w / 2}`);

        /* Not a rule, but the one fact about this composition worth knowing,
           and it changes with the window rather than with the code: the
           picture's mat reaches 0.8914 of the window's HEIGHT, so on anything
           squarer than about 1.78 : 1 the tallest summit is correctly placed
           and entirely behind the picture. */
        if (theme === "light" && L.hero.right >= size.w / 2) hidden.push(tag);
      } else {
        const sixth = size.w / 6;
        const bandH = L.band.bottom - L.band.top;
        const groundPx = L.hillH[0] * L.h1Ground;
        /* Where the page has no spare height the near hill's ground is floored
           at the band's own top (see .hill-1 in main.css) and the two behind
           it are left with a sliver or nothing. Both of those are intended, so
           what changes below is WHICH rule is asserted, not whether one is.
           The 12px is the point past which a summit is a shape rather than a
           few antialiased pixels the scan cannot locate reliably. */
        const floored = groundPx >= bandH - 1;
        const roomBehind = bandH - groundPx;

        rule(tag, theme, "band starts at the links' foot",
          near(L.band.top, L.links.bottom, 1),
          `band ${L.band.top} vs links ${L.links.bottom}`);
        rule(tag, theme,
          floored ? "near hill's ground floored at the band's top"
                  : "near hill's ground one stroke over the footer row",
          near(P.tops[0][P.width - 1],
               floored ? L.band.top : L.social.top - L.stroke, 2),
          `${P.tops[0][P.width - 1]} vs ` +
          `${Math.round(floored ? L.band.top : L.social.top - L.stroke)}`);
        rule(tag, theme, "near hill carries the whole footer row",
          P.tops[0].every((y) => y !== null && y <= L.social.top),
          `lowest ${Math.max(...P.tops[0].filter((y) => y !== null))} vs row ${L.social.top}`);

        if (roomBehind >= 12) {
          rule(tag, theme, "far summit a sixth in from the left, on the links' foot",
            near(P.peaks[2]?.x, sixth, 3) && near(P.peaks[2]?.y, L.links.bottom, 3),
            `(${P.peaks[2]?.x}, ${P.peaks[2]?.y}) vs (${Math.round(sixth)}, ${Math.round(L.links.bottom)})`);
          rule(tag, theme, "middle summit a sixth in from the right, one stroke down",
            near(P.peaks[1]?.x, sixth * 5, 3) && near(P.peaks[1]?.y, L.links.bottom + L.stroke, 3),
            `(${P.peaks[1]?.x}, ${P.peaks[1]?.y}) vs (${Math.round(sixth * 5)}, ${Math.round(L.links.bottom + L.stroke)})`);
        } else if (!QUIET) {
          console.log(`  ${tag} ${theme}: only ${roomBehind.toFixed(0)}px of band ` +
            `above the near hill — the two behind it are buried, ` +
            `their anchors not checked`);
        }
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
