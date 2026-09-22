import fs from "node:fs";
import path from "node:path";

import { HtmlBasePlugin } from "@11ty/eleventy";
import Image from "@11ty/eleventy-img";
import site from "./src/_data/site.js";

/* ---- Thumbnails -----------------------------------------------------------
   The grid used to hand a visitor the full-size photo — a ~2000px, ~700KB
   JPEG — to fill a card that renders about 350 CSS pixels wide. Measured on
   the 22 photos in the manifest, a 1440px desktop pulled 21 of them on first
   paint: 14 MB to paint one screen, which is the pause you see on a cold
   cache. Lazy loading barely dents it, because the browser's threshold
   reaches far enough past the fold to cover nearly the whole grid.

   So the build cuts its own thumbnails. Each photo is fetched once from the
   images repo, re-encoded to WebP at the widths below, and written into the
   site beside the pages; the card gets a srcset and the browser takes the
   one it needs. Same five photos, measured: 14 KB each at 400w against
   724 KB — the desktop screenful drops from 14 MB to about 0.3.

   The full-size original is untouched and still on the CDN, behind the
   card's link. The lightbox has its own, larger build-cut copies — see
   "The lightbox's photo" further down.

   The blog's images go the same way now — see the ladders further down.

   Cost: every source has to be downloaded and encoded once. eleventy-img
   names each output after a hash of the bytes that made it, so a build only
   works on photos it has not seen — and the deploy workflow keeps .cache/
   and the output between runs, so only newly added photos cost anything.
   A cold build of the whole gallery is the price of a new cache key. */

/* The ladder is cut to the sizes the card actually asks for, not to round
   numbers: 400 for a 1x desktop column, 760 for the same column on a 2x
   laptop (374 CSS px doubled is 748, and a 900 step made every one of those
   machines fetch 20% more than it could use), 900 for a phone, which at
   348 CSS px and 3x wants 1044 and takes the top of the ladder with a
   slight upscale nobody can see at that density. 560 sits between for the
   in-between viewports. */
const THUMB_WIDTHS = [400, 560, 760, 900];

/* Below sharp's default of 80. These are viewed at a third to a half of
   their pixel size — every one of them is downscaled again by the browser
   — and 74 takes about a fifth off the file for a difference that does not
   survive that. The lightbox's copies are cut separately, at 82. */
const THUMB_QUALITY = 74;

/* What the card actually measures, which is what the browser needs in order
   to pick a width: the full column on a phone, a ~360px column above that.
   Measured 315-374 CSS px across 1280-1440 viewports; 360 is the middle of
   that and errs upward. Keep this honest if .gallery-grid's columns change,
   or the browser will fetch the wrong size with complete confidence. */
const THUMB_SIZES = "(max-width: 700px) 92vw, 360px";

/* How many cards are fetched without waiting to be scrolled to.
   FOUR, and this note exists because the obvious improvement was tried,
   measured, and did nothing — so the next person does not spend the
   afternoon again.

   The grid is masonry, which CSS builds by filling column 1 top to
   bottom, then column 2, so a photo's place in the markup is not its
   place on the page. At 1440px the columns hold 0-4, 5-11, 12-17 and
   18-21, and a visitor sees 0, 1, 5, 6, 12, 13, 18, 19 without
   scrolling. Cards 2 and 3 therefore ask to be fetched early from below
   the fold, while six of the eight photos actually on screen do not.

   THE OBVIOUS FIX IS NOT THE FIX. Narrowing this to two — 0 and 1 are on
   screen at every width measured — is free and correct-looking and buys
   nothing: 364ms against 374ms for the eight visible photos on a
   throttled desktop, which is inside the run-to-run spread. A trace of
   when each request STARTS says why:

     photo  0, 1   (eager)  request begins at ~140 ms
     photo  5 ... 19 (lazy) request begins at ~630 ms

   The cost is not that priority is spent on the wrong cards. It is that
   the right cards say `loading="lazy"`, and a lazy image is not asked
   for until layout has run — about 490ms of waiting for nothing. Moving
   priority around does not touch that, because those six are lazy either
   way.

   What would touch it is fetching them eagerly, and the first row at four
   or five columns reaches ~80% of the way down the batch, so "eagerly"
   means very nearly all of it — fine at 22 photos, which the lazy pass
   fetches within the second anyway, and 950KB of thumbnails at a batch of
   fifty. That is a bandwidth decision, not a tidiness one.

   The clean answer is for the source order to be the visual order, which
   means a row-major grid and no ragged bottom edge. See .gallery-grid in
   main.css. Until then this stays at four: it is no worse than two on any
   screen measured, and better on a tall one, where card 2 is visible. */
const EAGER_CARDS = 4;

/* ---- The blog's images ---------------------------------------------------
   The gallery stopped handing out full-size photos; the blog had not. A
   post card's thumbnail is drawn 200 CSS px wide and was fetching the same
   ~2000px original the lightbox then opened, and so was every photo in the body
   of a post. On a blog index that is one full-size photo per post, all of
   them at once, for a column of postage stamps.

   So both go through the same build-time resizer the gallery cards use.
   The originals are untouched and still on the CDN; these are copies cut
   to what the page actually draws.

   ONE DIFFERENCE FROM THE GALLERY, and it is deliberate: a photo the build
   cannot fetch never fails the deploy here, on CI or anywhere else. A
   gallery entry is a line in a manifest, so a broken one is a typo worth
   stopping for. A blog image is a filename written inside a sentence, and
   the design has always answered a missing one by drawing the hatched box
   with the filename on it (see .cdn-frame.missing). Failing the build
   instead would mean a post could not be published until every photo in it
   had been uploaded first, which is not the order anybody writes in. */

/* 200 CSS px in the post card, the full column below 520px where the card
   stacks. 900 tops it for a 3x phone at that width. */
const POST_THUMB_WIDTHS = [200, 400, 600, 900];
const POST_THUMB_SIZES = "(max-width: 520px) 92vw, 200px";

/* A figure in the body of a post runs to --measure, 680px, and is looked at
   at roughly its own size rather than downscaled into a card — so it takes
   a taller ladder than the thumbnails and a little more quality with it. */
const FIGURE_WIDTHS = [400, 680, 960, 1360];
const FIGURE_SIZES = "(max-width: 767px) 92vw, 680px";
const FIGURE_QUALITY = 80;

/* ---- The lightbox's photo -------------------------------------------------
   Clicking a card used to fetch the full-size original from the CDN — a
   ~700KB JPEG, measured at a 696KB mean over the 22 photos in the
   manifest, on a connection to a host the page has not opened yet. That
   was invisible while the GRID was also serving originals, because by the
   time anyone clicked, the browser already had the file. Cutting the grid
   down to thumbnails took that away and left the click paying for it.

   So the lightbox gets its own copies, cut here like everything else and
   served from this site. Two things fall out of that, and the second is
   the larger:

     size        783KB -> about 200KB at the width a lightbox actually
                 draws. Measured per photo further down in the commit.
     connection  it is the same origin as the page, so it travels down
                 the HTTP/2 connection that is already open. No DNS, no
                 TCP handshake, no TLS negotiation — which on a cold visit
                 is 100-300ms of nothing happening before the first byte.

   The original is untouched and still what the card links to: "open image
   in new tab" gives it, and so does a visitor with JavaScript off.

   Widths against what the lightbox draws: fit() gives the photo up to
   min(94vw, 1100px), so a phone at 390 CSS px and 3x wants ~1100, a 1x
   desktop wants up to 1100, and a 2x desktop wants 2200 and takes the top
   of the ladder. Quality 82 rather than the grid's 74 — this is the one
   place the detail is being looked at rather than glanced past. */
/* The site is served from a subdirectory, and HtmlBasePlugin puts that
   prefix on href and src for us. It does not know about any other
   attribute, so the lightbox urls — which travel as data-lb-* and are
   read by script rather than followed by the browser — have to carry it
   themselves. Same constant the config returns as pathPrefix below, so
   the two can never drift. */
const PATH_PREFIX = "/nasty-cat-bonsai/";
const withBase = (url) => PATH_PREFIX.replace(/\/$/, "") + url;

const LIGHTBOX_WIDTHS = [900, 1300, 1800];
const LIGHTBOX_QUALITY = 82;
const LIGHTBOX_SIZES = "(max-width: 700px) 96vw, 1100px";

/* The shape to reserve for a figure whose source the build could not
   fetch, and whose proportions are therefore unknown. Only ever seen on a
   photo that has not been uploaded yet: the frame draws the hatched box
   with the filename on it, and something has to give that box a height.
   3/2 because it is the commonest shape a camera produces, so on the day
   the photo does arrive the page moves as little as possible. */
const UNKNOWN_RATIO = "3 / 2";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* The onerror hook every CDN-backed image on the site carries: it turns the
   frame around a photo that did not arrive into the hatched box with the
   filename written on it, rather than leaving a broken-image glyph. */
const missingHook = (file) =>
  `this.parentElement.classList.add('missing');` +
  `this.parentElement.setAttribute('data-file','${esc(file)}')`;

/* One <img>, cut at build time from a photo in the images repo.
 *
 * Every image on the site that comes from bonsai-images goes through here —
 * gallery cards, post-card thumbnails, figures in a post — so there is one
 * place that knows how to turn a source file into a srcset, and one place
 * that decides what to do when the source cannot be had.
 *
 *   file     path inside the images repo, e.g. "blog/repot-01.webp"
 *   widths   the ladder to cut
 *   sizes    what the page will actually draw it at
 *   quality  WebP quality for the copies
 *   alt      already-escaped alt text
 *   attrs    loading/fetchpriority, as a leading-space string
 *   strict   true  -> a source the build cannot fetch fails a CI build
 *            false -> always degrade to the full-size original on the CDN
 *
 * Returns { html, width, height, src, srcset } — the <img> tag, the shape
 * of the largest copy cut (for a caller that has to reserve the right
 * space for it), and the urls, for a caller that wants the same copies on
 * a tag of its own. Everything but html is null when the source could not
 * be fetched and the tag is a bare CDN fallback, because then nothing
 * here knows the shape and no copies were cut.
 */
async function cdnImg({ file, widths, sizes, quality, alt, attrs, strict }) {
  const missing = missingHook(file);
  let sources;
  try {
    const metadata = await Image(site.images.source + file, {
      widths,
      formats: ["webp"],
      sharpWebpOptions: { quality },
      // Every build-cut copy lands here, gallery and blog alike — the
      // deploy workflow keeps this directory between runs so a photo is
      // only ever encoded once. Names are a hash of the bytes that made
      // them, so nothing collides and nothing goes stale.
      outputDir: "_site/assets/photos/",
      urlPath: "/assets/photos/",
      cacheOptions: { duration: "30d" },
    });
    sources = metadata.webp;
  } catch (err) {
    const why = `Could not build a thumbnail for ${file}: ${err.message}`;
    if (strict && process.env.CI) throw new Error(why);
    console.warn(`[images] ${why} — falling back to the full-size original`);
    return {
      html:
        `<img src="${esc(site.images.cdn + file)}" alt="${alt}"` +
        `${attrs} decoding="async" onerror="${missing}">`,
      width: null,
      height: null,
      src: null,
      srcset: null,
    };
  }

  const srcset = sources.map((s) => `${s.url} ${s.width}w`).join(", ");
  // The fallback for a browser without srcset, which in practice is none
  // of them: the middle width, rather than the largest, so that if this
  // ever is the one fetched it is not the heaviest.
  const fallback = sources[Math.floor((sources.length - 1) / 2)];
  const biggest = sources[sources.length - 1];
  return {
    html:
      `<img src="${fallback.url}" srcset="${srcset}" sizes="${sizes}"` +
      ` width="${biggest.width}" height="${biggest.height}" alt="${alt}"` +
      `${attrs} decoding="async" onerror="${missing}">`,
    width: biggest.width,
    height: biggest.height,
    src: fallback.url,
    srcset,
  };
}

/* Strip CSS comments, and only comments.
 *
 * Strings are why this is a small state machine rather than a regular
 * expression: `content: "/* not a comment *\/"` is legal CSS, and a bare
 * /\/\*[\s\S]*?\*\// would cut the file in half at one. Nothing else is
 * rewritten — no value shortened, no selector merged, no rule reordered —
 * so this cannot change what the page looks like, only how much of the
 * file is prose.
 */
function stripCssComments(css) {
  let out = "";
  let i = 0;
  let quote = null; // the quote character we are inside, or null
  while (i < css.length) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += css[i + 1] || ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) break; // unterminated: drop the rest, as a browser would
      i = end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out
    .replace(/[ \t]+$/gm, "")  // trailing space a removed comment left behind
    .replace(/\n{3,}/g, "\n\n") // and the runs of blank lines
    .trim() + "\n";
}

export default function (eleventyConfig) {
  // Rewrites root-relative URLs (/assets/..., /blog/...) to include the
  // /nasty-cat-bonsai/ path prefix in the built output.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  /* ---- The stylesheet goes out without its notes ------------------------
     main.css is two thirds comment by weight — 92KB of file, 31KB of rules
     — and those comments are the point of it: every colour in the dark
     theme carries the contrast ratio it was solved to, and the hill figures
     say which script writes them. They belong in the repo, and nothing here
     touches the file on disk.

     What they do not belong in is the copy a visitor downloads. The
     stylesheet is render-blocking — nothing paints until it has arrived —
     and compressed, the notes are most of it: 28.8KB over the wire against
     6.5KB for the same rules with the prose taken out. That is ~22KB on the
     first load of every page, spent on text no browser reads.

     This runs after the build rather than as a transform because the
     stylesheet is passthrough-copied, and passthrough copy does not go
     through transforms — it is a file copy, and the copy is what has to be
     edited. */
  eleventyConfig.on("eleventy.after", async ({ dir }) => {
    const cssDir = path.join(dir.output, "assets", "css");
    if (!fs.existsSync(cssDir)) return;
    let saved = 0;
    for (const name of fs.readdirSync(cssDir)) {
      if (!name.endsWith(".css")) continue;
      const file = path.join(cssDir, name);
      const before = fs.readFileSync(file, "utf8");
      const after = stripCssComments(before);
      fs.writeFileSync(file, after);
      saved += before.length - after.length;
    }
    if (saved > 0) {
      console.log(`[css] ${(saved / 1024).toFixed(1)}KB of comments left in the repo, not in the build`);
    }
  });

  eleventyConfig.addFilter("readableDate", (date) =>
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date)
  );

  eleventyConfig.addFilter("rfc3339", (date) => new Date(date).toISOString());

  // Post tags minus Eleventy's own "posts" collection tag (which every
  // post carries via src/posts/posts.json and must never be displayed).
  eleventyConfig.addFilter("displayTags", (tags) =>
    (tags || []).filter((t) => t !== "posts")
  );

  // Rendered HTML -> plain text for the client-side search index.
  eleventyConfig.addFilter("plainText", (html) =>
    String(html)
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  // Feed-only: root-relative href/src (as authored, before HtmlBasePlugin)
  // become absolute using the deployed base URL, which already carries the
  // /nasty-cat-bonsai path prefix — mirroring what HtmlBasePlugin does for
  // on-site pages. Protocol-relative "//host" URLs are left alone.
  eleventyConfig.addFilter("absoluteHtml", (html, base) =>
    String(html).replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`)
  );

  /* A photo from the images repo, inline in a post or on the About page:
       {% cdnimg "blog/repot-01.webp", "Roots after combing out", "Optional caption" %}
     The <img> is a build-cut copy at the widths a 680px column asks for;
     the original stays on the CDN, untouched. A caption may carry markup,
     so it is passed through as written — it comes from the post's own
     source, not from anything a visitor can reach. */
  eleventyConfig.addAsyncShortcode("cdnimg", async function (file, alt, caption) {
    const img = await cdnImg({
      file,
      widths: FIGURE_WIDTHS,
      sizes: FIGURE_SIZES,
      quality: FIGURE_QUALITY,
      alt: esc(alt),
      attrs: ` loading="lazy"`,
      strict: false,
    });
    /* THE FRAME TAKES THE PHOTO'S OWN PROPORTIONS. It used to be 16/10 for
       every picture on the site, with the image cropped to fill it, and a
       tree is the wrong subject to do that to: an upright loses its apex
       off the top and its nebari off the bottom, which are the two things
       the photograph is of. Nobody reports that as a fault. They conclude
       the photographs are badly composed.

       So the shape comes from the file, and the only thing decided here is
       the width — the text column, so a picture never runs wider than the
       words around it. The height follows. The ratio is taken from the
       largest copy actually cut rather than from the original, so it is
       the shape of the bytes the browser will be handed, to the pixel. */
    const ratio =
      img.width && img.height ? `${img.width} / ${img.height}` : UNKNOWN_RATIO;
    const cap = caption ? `<figcaption>${caption}</figcaption>` : "";
    return `<figure class="post-figure">
  <div class="cdn-frame" style="aspect-ratio: ${ratio}">${img.html}</div>
  ${cap}
</figure>`;
  });

  /* A post card's thumbnail on the blog index:
       {% postThumb post.data.thumb %}
     Drawn 200 CSS px wide, so it is cut to that rather than to the ~2000px
     the original is. Decorative — the card's title is the link a reader
     follows and the thumb sits inside an aria-hidden anchor — hence the
     empty alt. */
  eleventyConfig.addAsyncShortcode("postThumb", async function (file) {
    /* The card's thumbnail keeps its 4:3 frame and crops to it — unlike a
       figure in a post, this one is a fixed slot in a row of them, and a
       column of cards whose pictures were each a different height would
       read as a broken list rather than as a set. The photo it stands for
       is shown uncropped on the post itself. */
    const img = await cdnImg({
      file,
      widths: POST_THUMB_WIDTHS,
      sizes: POST_THUMB_SIZES,
      quality: THUMB_QUALITY,
      alt: "",
      attrs: ` loading="lazy"`,
      strict: false,
    });
    return img.html;
  });

  /* One gallery card's <img>, with the thumbnails above behind it.
       {% galleryThumb item, loop.index0 %}
     `eager` is for the first row only: those photos are what the page is,
     so waiting for the lazy pass to notice them costs the one moment that
     matters. Everything below stays lazy.

     A photo the build cannot fetch or encode is a broken manifest entry,
     and it is treated the way _data/gallery.js treats a broken manifest:
     on CI it fails the deploy, so the previous good site stays up, and
     locally it degrades to the CDN original so the page still builds
     offline — with the same onerror hook the cards have always carried to
     name the missing file on screen. */
  eleventyConfig.addAsyncShortcode("galleryThumb", async function (item, index) {
    const alt = esc(
      item.alt ||
        `${item.species} bonsai, ${String(item.style || "").toLowerCase()} style`
    );
    /* The card's own thumbnail, and — carried on the same tag — what the
       lightbox should open instead of the CDN original. It rides here
       rather than in #gallery-data because this is where the build
       already knows it; the script reads it off the grid image it is
       replacing. Two attributes per card, which gzip barely notices
       since every one of them is the same shape.

       Cut as a second ladder rather than by extending the first: the
       thumbnail ladder stops at 900 on purpose, and a 3x phone asking
       for a 359px card would otherwise start picking 1300 off a shared
       srcset and fetch twice what the card can show. */
    const [img, large] = await Promise.all([
      cdnImg({
        file: item.file,
        widths: THUMB_WIDTHS,
        sizes: THUMB_SIZES,
        quality: THUMB_QUALITY,
        alt,
        attrs:
          index < EAGER_CARDS ? ` fetchpriority="high"` : ` loading="lazy"`,
        strict: true,
      }),
      cdnImg({
        file: item.file,
        widths: LIGHTBOX_WIDTHS,
        sizes: LIGHTBOX_SIZES,
        quality: LIGHTBOX_QUALITY,
        alt,
        attrs: "",
        strict: true,
      }),
    ]);

    // No build-cut large copy (a local build that could not fetch the
    // source): say nothing, and gallery.js falls back to the original.
    const lb = large.srcset
      ? ` data-lb-src="${esc(withBase(large.src))}"` +
        ` data-lb-srcset="${esc(
          large.srcset.replace(/(^|, )(\/)/g, (m, sep) => sep + withBase("/").slice(0, -1) + "/")
        )}"` +
        ` data-lb-sizes="${esc(LIGHTBOX_SIZES)}"`
      : "";

    // The card's frame is shaped by the manifest's `ratio`, in gallery.njk.
    return img.html.replace("<img ", `<img${lb} `);
  });

  // Responsive, privacy-friendly YouTube embed for posts:
  //   {% youtube "dQw4w9WgXcQ", "Optional accessible title" %}
  eleventyConfig.addShortcode("youtube", function (id, title) {
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${title || "YouTube video"}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  });

  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("src/posts/*.md").sort((a, b) => b.date - a.date)
  );

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    pathPrefix: PATH_PREFIX,
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
