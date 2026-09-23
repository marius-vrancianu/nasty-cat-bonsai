import fs from "node:fs";
import path from "node:path";

import { HtmlBasePlugin } from "@11ty/eleventy";
import Image from "@11ty/eleventy-img";
import { minify } from "terser";
import sharp from "sharp";
import site from "./src/_data/site.js";

/* ---- The image pipeline, in brief ----------------------------------------
   Every photo on the site comes from the bonsai-images repo and is never
   served as-is: the build cuts WebP copies at the widths each place draws
   (ladders below), writes them to _site/assets/photos/, and the pages use
   srcset so the browser takes the one it needs. Originals are ~2000px /
   ~700KB; a gallery thumbnail at 400w is ~15KB.

   Copies are named after a hash of the source bytes (when read from a local
   checkout — see "Where the photos come from"), so a build only encodes
   photos it has not seen: the workflows keep _site/assets/photos between
   runs, and the build prunes copies no page uses (see eleventy.after). */

/* Gallery card widths, cut to what the card asks for: 400 for a 1x desktop
   column (~360 CSS px), 760 for that column at 2x (a 900 step made those
   fetch 20% too much), 900 for a 3x phone (~348 CSS px wants 1044; the slight
   upscale is invisible), 560 in between. */
const THUMB_WIDTHS = [400, 560, 760, 900];

/* Below sharp's default 80: thumbnails are shown downscaled, and 74 saves
   about a fifth. The lightbox uses 82. */
const THUMB_QUALITY = 74;

/* What a card measures (the browser picks a width from this): the full
   column on phones, ~360px above (measured 315-374 at 1280-1440 wide). Keep
   in step with .gallery-grid's columns in main.css. */
const THUMB_SIZES = "(max-width: 700px) 92vw, 360px";

/* Cards loaded eagerly (fetchpriority=high, no loading=lazy). Measured;
   don't retune without measuring again:

   - The grid is CSS masonry (columns fill top to bottom), so markup order is
     not screen order: at 1440px the visible cards are 0, 1, 5, 6, 12, 13, 18,
     19. The build cannot know which cards are on screen.
   - Lazy images start loading only after layout (~490ms in a trace), which is
     most of the wait. Narrowing this to 2 changed nothing (364 vs 374ms).
   - Making 12 or 24 eager did not help either: the extra photos share the
     bandwidth (a 3x phone fetched 1.2MB instead of 0.3MB for the same two
     photos on screen).
   The perceived wait is handled instead by the colour placeholders + fade-in
   (toneOf below). A row-major grid would fix the order, at the cost of the
   masonry look; see .gallery-grid in main.css. */
const EAGER_CARDS = 4;

/* ---- Blog images (post-card thumbnails and figures in posts) -------------
   Same pipeline as the gallery, one deliberate difference: a blog photo the
   build cannot find never fails the deploy. A gallery entry is a line in a
   manifest, so a missing file is a typo worth stopping for; a blog image is
   named inside prose, and the owner may publish before uploading. It shows as
   the hatched box with its filename (.cdn-frame.missing). */

/* Post-card thumbnail: 200 CSS px, the full column below 520px (900 covers
   a 3x phone). */
const POST_THUMB_WIDTHS = [200, 400, 600, 900];
const POST_THUMB_SIZES = "(max-width: 520px) 92vw, 200px";

/* A figure in a post: up to the 680px text column, seen at about its own
   size, so a taller ladder and a little more quality. */
const FIGURE_WIDTHS = [400, 680, 960, 1360];
const FIGURE_SIZES = "(max-width: 767px) 92vw, 680px";
const FIGURE_QUALITY = 80;

/* ---- Lightbox copies -------------------------------------------------------
   The lightbox draws the photo up to min(94vw, 1100px): 1300 covers a 1x
   desktop and a 3x phone, 1800 a 2x desktop. Quality 82 — the one place the
   detail is looked at. Served from this site (same connection as the page),
   ~200KB against the ~700KB original. The card's own href is the largest of
   these copies ("open in new tab", no-JS visitors).

   No 900 here on purpose: the lightbox borrows the card's 900 thumbnail as
   the bottom of its srcset (see galleryThumb). It is only picked on small
   1x/2x screens, where 74 vs 82 quality is invisible, and is usually already
   cached. Saves one file (~67KB) and a sixth of the encoding per photo. */
/* The site lives under /nasty-cat-bonsai/. HtmlBasePlugin prefixes href and
   src (and srcset) in the HTML, but not data-* attributes, so the lightbox's
   data-lb-srcset carries the prefix itself (withBase). Same constant as the
   pathPrefix returned below. */
const PATH_PREFIX = "/nasty-cat-bonsai/";
const withBase = (url) => PATH_PREFIX.replace(/\/$/, "") + url;

const LIGHTBOX_WIDTHS = [1300, 1800];
const LIGHTBOX_QUALITY = 82;
const LIGHTBOX_SIZES = "(max-width: 700px) 96vw, 1100px";

/* Shape reserved for a post figure whose photo is missing (hatched box):
   3/2, the commonest camera shape, so the page moves least when it arrives. */
const UNKNOWN_RATIO = "3 / 2";

/* ---- Where the photos come from ------------------------------------------
     IMAGES_DIR set    a local checkout of bonsai-images — what both workflows
                       use (one git clone of the latest commit)
     IMAGES_DIR unset  one download per photo from raw.githubusercontent.com —
                       the zero-setup default for a local preview

   The checkout is the one that scales:
     - raw.githubusercontent.com rate-limits anonymous downloads (since May
       2025), and a cold cache (GitHub drops it after a week unused) meant
       downloading every photo at once from a shared runner IP;
     - eleventy-img hashes a local file by its BYTES but a URL only by the URL,
       so from a checkout a photo replaced under the same name gets new copies
       on the next build (from a URL it kept its old ones);
     - the raw host caches for minutes; a clone is the commit itself (no wait
       after editing gallery.json).

   Visitors never fetch originals from anywhere: everything they get is a copy
   served from this site. (The site no longer uses jsDelivr, which stops
   serving a GitHub repo past ~50MB.) */
const IMAGES_DIR = process.env.IMAGES_DIR ? path.resolve(process.env.IMAGES_DIR) : null;

function sourceOf(file) {
  if (!IMAGES_DIR) return site.images.source + file;
  const local = path.join(IMAGES_DIR, file);
  // a plainer error than eleventy-img's
  if (!fs.existsSync(local)) throw new Error(`${file} is not in ${IMAGES_DIR}`);
  return local;
}

/* Every copy this build cut or reused. Anything else in PHOTOS_DIR belongs
   to a photo since removed, renamed or replaced, and is pruned in
   eleventy.after. */
const PHOTOS_DIR = "_site/assets/photos/";
const photosInUse = new Set();

/* The only call into eleventy-img: fixes the output location and records
   each copy as in use. */
async function cut(file, options) {
  const metadata = await Image(sourceOf(file), {
    ...options,
    outputDir: PHOTOS_DIR,
    urlPath: "/assets/photos/",
    cacheOptions: { duration: "30d" },
  });
  for (const entries of Object.values(metadata)) {
    for (const e of entries) photosInUse.add(path.resolve(e.outputPath));
  }
  return metadata;
}

/* ---- Placeholder colour --------------------------------------------------
   Each frame waits in its photo's average colour (--tone) while the photo
   loads, then the photo fades in (main.css, .cdn-frame). The stripes mean
   "missing", so they no longer show for a photo that is merely on its way.
   Computed from the smallest copy, shrunk to 1x1: a few ms per photo,
   memoised per build. */
const tones = new Map();
function toneOf(outputPath) {
  if (!tones.has(outputPath)) {
    tones.set(
      outputPath,
      sharp(outputPath)
        .resize(1, 1, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer()
        .then((px) => "#" + [...px.subarray(0, 3)].map((v) => v.toString(16).padStart(2, "0")).join(""))
        .catch(() => null)
    );
  }
  return tones.get(outputPath);
}

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* One <img>, cut at build time from a photo in the images repo. Every
   bonsai-images photo on the site goes through here.

     file     path inside the images repo, e.g. "blog/repot-01.webp"
     widths   the ladder to cut
     sizes    what the page draws it at
     quality  WebP quality
     alt      already-escaped alt text
     attrs    loading/fetchpriority, as a leading-space string
     strict   true  -> a missing/unreadable source fails a CI build
              false -> degrade to the hatched "missing" frame

   Returns { html, width, height, src, srcset, full, entries, tone }: the tag;
   the largest copy's size; the fallback src and srcset; `full` = largest
   copy's url; `entries` = [{ url, width }]; `tone` = average colour. All null
   when the source could not be had (frame() then draws the hatched box).

   No onerror on the tag: one capturing listener in base.njk's <head> marks
   the frame of any image that fails in the browser. */
async function cdnImg({ file, widths, sizes, quality, alt, attrs, strict }) {
  let sources;
  try {
    const metadata = await cut(file, {
      widths,
      formats: ["webp"],
      sharpWebpOptions: { quality },
    });
    sources = metadata.webp;
  } catch (err) {
    const why = `Could not build a thumbnail for ${file}: ${err.message}`;
    if (strict && process.env.CI) throw new Error(why);
    console.warn(`[images] ${why} — drawing the missing-photo frame`);
    return { html: null, width: null, height: null, src: null, srcset: null, full: null, entries: null, tone: null };
  }

  const srcset = sources.map((s) => `${s.url} ${s.width}w`).join(", ");
  // src for a browser without srcset: the middle width, not the heaviest
  const fallback = sources[Math.floor((sources.length - 1) / 2)];
  const biggest = sources[sources.length - 1];
  const tone = await toneOf(sources[0].outputPath);
  return {
    html:
      `<img src="${fallback.url}" srcset="${srcset}" sizes="${sizes}"` +
      ` width="${biggest.width}" height="${biggest.height}" alt="${alt}"` +
      `${attrs} decoding="async">`,
    width: biggest.width,
    height: biggest.height,
    src: fallback.url,
    srcset,
    full: biggest.url,
    entries: sources.map((s) => ({ url: s.url, width: s.width })),
    tone,
  };
}

/* The frame around a build-cut image (.cdn-frame): draws the tone or the
   stripes behind it, and the hatched box with the filename when there is no
   photo. A photo the build could not cut is marked missing here, in the
   markup, so it shows without JS and nothing is requested. data-file is on
   every frame so a photo that fails later in the browser is labelled too.

     tag    "div", or "a" for a post card's thumb
     cls    extra classes beside cdn-frame
     style  inline style, e.g. the aspect ratio (--tone is appended)
     attrs  anything else, as a leading-space string
     img    what cdnImg() returned
     file   the source path, for the label */
function frame({ tag = "div", cls = "", style = "", attrs = "", img, file }) {
  const missing = !img.html;
  if (!missing && img.tone) style = [style, `--tone: ${img.tone}`].filter(Boolean).join("; ");
  const classes = ["cdn-frame", cls, missing ? "missing" : ""].filter(Boolean).join(" ");
  return (
    `<${tag} class="${classes}"` +
    ` data-file="${esc(file)}"` +
    (style ? ` style="${esc(style)}"` : "") +
    `${attrs}>${missing ? "" : img.html}</${tag}>`
  );
}

/* Lightbox copies of a gallery photo, memoised per build: galleryHref and
   galleryThumb both ask for them. */
const lightboxCuts = new Map();
function lightboxOf(file) {
  if (!lightboxCuts.has(file)) {
    lightboxCuts.set(file, cdnImg({
      file,
      widths: LIGHTBOX_WIDTHS,
      sizes: LIGHTBOX_SIZES,
      quality: LIGHTBOX_QUALITY,
      alt: "",
      attrs: "",
      strict: true,
    }));
  }
  return lightboxCuts.get(file);
}

/* ---- Share previews (og:image) ---------------------------------------------
   For a post with a `thumb`: a 1200px JPEG cut from it (JPEG because every
   scraper accepts it; it is fetched per share, not per visit). Other pages,
   or a thumb not uploaded yet, use the hero. */
const OG_WIDTH = 1200;
const OG_QUALITY = 82;
const HERO_OG = {
  url: "/assets/img/hero.jpg",
  width: 1134,
  height: 1286,
};

function ogTags(absUrl, width, height) {
  return (
    `<meta property="og:image" content="${esc(absUrl)}">\n` +
    `  <meta property="og:image:width" content="${width}">\n` +
    `  <meta property="og:image:height" content="${height}">`
  );
}

/* Strip CSS comments, and nothing else (no minifying), so the output rules
   are exactly the source rules. A small state machine rather than a regex
   because a comment marker can appear inside a string. */
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
  // Adds the /nasty-cat-bonsai/ prefix to root-relative URLs in the HTML.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  /* ---- CSS for visitors ------------------------------------------------------
     main.css is mostly comments; visitors get it without them (render-blocking,
     so every KB counts). fonts.css is folded into the front of it, so a page
     waits on one stylesheet, not two (both live in assets/css/, so the font
     url()s resolve the same). Runs after the build because passthrough-copied
     files skip Eleventy's transforms. */
  eleventyConfig.on("eleventy.after", async ({ dir }) => {
    const cssDir = path.join(dir.output, "assets", "css");
    if (!fs.existsSync(cssDir)) return;
    const main = path.join(cssDir, "main.css");
    const fonts = path.join(cssDir, "fonts.css");
    const before =
      (fs.existsSync(fonts) ? fs.readFileSync(fonts, "utf8") + "\n" : "") +
      fs.readFileSync(main, "utf8");
    const after = stripCssComments(before);
    fs.writeFileSync(main, after);
    if (fs.existsSync(fonts)) fs.rmSync(fonts);
    const saved = before.length - after.length;
    if (saved > 0) {
      console.log(`[css] ${(saved / 1024).toFixed(1)}KB of comments left in the repo, not in the build`);
    }
  });

  /* ---- JS for visitors ---------------------------------------------------------
     Scripts are minified with Terser (comments out, local names shortened); the
     repo keeps the readable sources. A real minifier rather than a comment
     stripper, because comment markers can appear in strings and regexes. A
     script Terser cannot parse fails the build. */
  eleventyConfig.on("eleventy.after", async ({ dir }) => {
    const jsDir = path.join(dir.output, "assets", "js");
    if (!fs.existsSync(jsDir)) return;
    let before = 0;
    let after = 0;
    for (const name of fs.readdirSync(jsDir)) {
      if (!name.endsWith(".js")) continue;
      const file = path.join(jsDir, name);
      const source = fs.readFileSync(file, "utf8");
      const { code } = await minify(source, { compress: true, mangle: true });
      fs.writeFileSync(file, code + "\n");
      before += source.length;
      after += code.length + 1;
    }
    if (before > after) {
      console.log(`[js] ${((before - after) / 1024).toFixed(1)}KB of comments and spacing left in the repo, not in the build`);
    }
  });

  /* ---- Pruning unused photo copies -------------------------------------------
     _site/assets/photos is restored from the last run by the workflows, so
     without this, copies of removed/renamed/replaced photos would be published
     forever (GitHub Pages caps a site at 1GB). After a full build, anything not
     in photosInUse is deleted — which also keeps the Actions cache lean.

     Only in a full one-off build: under --serve/--watch a rebuild may render
     only some pages, and the rest would look unused. Skipped when nothing was
     cut at all (an offline build with an empty gallery). */
  eleventyConfig.on("eleventy.before", () => {
    photosInUse.clear();
    lightboxCuts.clear();
  });

  eleventyConfig.on("eleventy.after", ({ runMode, incremental }) => {
    if (runMode !== "build" || incremental) return;
    if (photosInUse.size === 0 || !fs.existsSync(PHOTOS_DIR)) return;
    let count = 0;
    let bytes = 0;
    for (const name of fs.readdirSync(PHOTOS_DIR)) {
      const file = path.resolve(PHOTOS_DIR, name);
      if (photosInUse.has(file)) continue;
      bytes += fs.statSync(file).size;
      fs.rmSync(file);
      count++;
    }
    if (count > 0) {
      console.log(`[images] removed ${count} copies no page uses (${(bytes / 1048576).toFixed(1)}MB)`);
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

  /* The lightbox's `sizes`, written once on the grid (gallery.njk) rather than
     on every card. */
  eleventyConfig.addGlobalData("lightboxSizes", LIGHTBOX_SIZES);

  /* The manifest, trimmed to the keys gallery.js reads, for the page's
     #gallery-data JSON (alt text is already on each <img>). */
  const LIGHTBOX_KEYS = ["file", "species", "style", "date", "trees", "notes", "ratio"];
  eleventyConfig.addFilter("lightboxItems", (items) =>
    (items || []).map((item) =>
      Object.fromEntries(LIGHTBOX_KEYS.filter((k) => item[k] != null).map((k) => [k, item[k]]))
    )
  );

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

  // Feed only: make root-relative href, src and srcset URLs absolute with
  // the deployed base (site.url, which includes the path prefix) — the
  // feed's HTML never passes through HtmlBasePlugin. "//host" is left alone.
  const absolute = (url, base) => (/^\/(?!\/)/.test(url) ? base + url : url);
  eleventyConfig.addFilter("absoluteHtml", (html, base) =>
    String(html)
      .replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`)
      .replace(/srcset="([^"]*)"/g, (m, list) =>
        `srcset="${list
          .split(",")
          .map((c) => c.trim().replace(/^\S+/, (url) => absolute(url, base)))
          .join(", ")}"`
      )
  );

  /* A photo in a post or on the About page:
       {% cdnimg "blog/repot-01.webp", "Roots after combing out", "Optional caption" %}
     The caption may contain markup (it comes from the site's own source). */
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
    /* The frame takes the photo's own shape (from the largest copy cut), at the
       text column's width — never a fixed ratio, which cropped trees' apex and
       nebari. */
    const ratio =
      img.width && img.height ? `${img.width} / ${img.height}` : UNKNOWN_RATIO;
    const cap = caption ? `<figcaption>${caption}</figcaption>` : "";
    return `<figure class="post-figure">
  ${frame({ style: `aspect-ratio: ${ratio}`, img, file })}
  ${cap}
</figure>`;
  });

  /* A post card's thumbnail on the blog index, frame and link included:
       {% postThumb post.data.thumb, post.url %}
     Decorative (the title is the real link; this anchor is aria-hidden), hence
     the empty alt. */
  eleventyConfig.addAsyncShortcode("postThumb", async function (file, url) {
    /* Fixed 4:3 frame, cropped, so the list of cards stays even; the post
       itself shows the photo uncropped. */
    const img = await cdnImg({
      file,
      widths: POST_THUMB_WIDTHS,
      sizes: POST_THUMB_SIZES,
      quality: THUMB_QUALITY,
      alt: "",
      attrs: ` loading="lazy"`,
      strict: false,
    });
    return frame({
      tag: "a",
      cls: "post-card-thumb",
      attrs: ` href="${esc(url)}" tabindex="-1" aria-hidden="true"`,
      img,
      file,
    });
  });

  /* A post's share-preview tags for the <head>: {% ogImage thumb %} */
  eleventyConfig.addAsyncShortcode("ogImage", async function (file) {
    try {
      const { jpeg } = await cut(file, {
        widths: [OG_WIDTH],
        formats: ["jpeg"],
        sharpJpegOptions: { quality: OG_QUALITY, progressive: true },
      });
      const og = jpeg[jpeg.length - 1];
      return ogTags(site.url + og.url, og.width, og.height);
    } catch (err) {
      console.warn(`[images] No share image for ${file}: ${err.message} — using the hero`);
      return ogTags(site.url + HERO_OG.url, HERO_OG.width, HERO_OG.height);
    }
  });

  /* A gallery card's href: the largest lightbox copy.
       <a class="gallery-card" href="{% galleryHref item %}">
     "#" only in a local build that could not reach the photo (CI fails). */
  eleventyConfig.addAsyncShortcode("galleryHref", async function (item) {
    const large = await lightboxOf(item.file);
    return large.full ? esc(large.full) : "#";
  });

  /* One gallery card's frame and <img>:  {% galleryThumb item, loop.index0 %}
     The first EAGER_CARDS load eagerly, the rest lazily. A photo the build
     cannot read fails the deploy on CI (the previous site stays up) and becomes
     the hatched frame locally, like a broken manifest in _data/gallery.js. */
  eleventyConfig.addAsyncShortcode("galleryThumb", async function (item, index) {
    const alt = esc(
      item.alt ||
        `${item.species} bonsai, ${String(item.style || "").toLowerCase()} style`
    );
    /* The card's thumbnail, plus data-lb-srcset for the lightbox, read by
       gallery.js off this <img>. Lightbox `sizes` are on the grid; the script
       picks its own fallback src. A separate ladder from the thumbnails: sharing
       one srcset would let a 3x phone pick a 1300 copy for a 359px card. */
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
      lightboxOf(item.file),
    ]);

    // Lightbox srcset: the card's largest thumbnail, then the lightbox cuts
    // (eleventy-img never upscales, so a narrow photo can repeat a width —
    // the duplicate is dropped). Without cuts (local build, photo missing),
    // gallery.js falls back to the card's href.
    let lb = "";
    if (large.entries && img.entries) {
      const rung = img.entries[img.entries.length - 1];
      const ladder = [rung, ...large.entries].filter(
        (e, i, all) => i === all.length - 1 || e.width < all[i + 1].width
      );
      lb = ` data-lb-srcset="${esc(
        ladder.map((e) => `${withBase(e.url)} ${e.width}w`).join(", ")
      )}"`;
    }

    /* The card's shape: the manifest's `ratio` if given (to crop on purpose),
       otherwise the photo's own. */
    const shape =
      item.ratio || (img.width && img.height ? `${img.width}/${img.height}` : "3/4");
    return frame({
      style: `aspect-ratio: ${shape}`,
      img: { html: img.html && img.html.replace("<img ", `<img${lb} `), tone: img.tone },
      file: item.file,
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
    pathPrefix: PATH_PREFIX,
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
