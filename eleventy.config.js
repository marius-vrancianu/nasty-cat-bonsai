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

   The full-size original is untouched and still comes from the CDN. That is
   what the lightbox opens, and it is the only place the detail is wanted.

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
   survive that. The full-size original the lightbox opens is untouched. */
const THUMB_QUALITY = 74;

/* What the card actually measures, which is what the browser needs in order
   to pick a width: the full column on a phone, a ~360px column above that.
   Measured 315-374 CSS px across 1280-1440 viewports; 360 is the middle of
   that and errs upward. Keep this honest if .gallery-grid's columns change,
   or the browser will fetch the wrong size with complete confidence. */
const THUMB_SIZES = "(max-width: 700px) 92vw, 360px";

/* ---- The blog's images ---------------------------------------------------
   The gallery stopped handing out full-size photos; the blog had not. A
   post card's thumbnail is drawn 200 CSS px wide and was fetching the same
   ~2000px original the lightbox opens, and so was every photo in the body
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
 * Returns the <img> tag as a string.
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
    return `<img src="${esc(site.images.cdn + file)}" alt="${alt}"` +
      `${attrs} decoding="async" onerror="${missing}">`;
  }

  const srcset = sources.map((s) => `${s.url} ${s.width}w`).join(", ");
  // The fallback for a browser without srcset, which in practice is none
  // of them: the middle width, rather than the largest, so that if this
  // ever is the one fetched it is not the heaviest.
  const fallback = sources[Math.floor((sources.length - 1) / 2)];
  const biggest = sources[sources.length - 1];
  return (
    `<img src="${fallback.url}" srcset="${srcset}" sizes="${sizes}"` +
    ` width="${biggest.width}" height="${biggest.height}" alt="${alt}"` +
    `${attrs} decoding="async" onerror="${missing}">`
  );
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
    const cap = caption ? `<figcaption>${caption}</figcaption>` : "";
    return `<figure class="post-figure">
  <div class="cdn-frame">${img}</div>
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
    return cdnImg({
      file,
      widths: POST_THUMB_WIDTHS,
      sizes: POST_THUMB_SIZES,
      quality: THUMB_QUALITY,
      alt: "",
      attrs: ` loading="lazy"`,
      strict: false,
    });
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
    return cdnImg({
      file: item.file,
      widths: THUMB_WIDTHS,
      sizes: THUMB_SIZES,
      quality: THUMB_QUALITY,
      alt,
      attrs: index < 4 ? ` fetchpriority="high"` : ` loading="lazy"`,
      strict: true,
    });
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
    pathPrefix: "/nasty-cat-bonsai/",
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
