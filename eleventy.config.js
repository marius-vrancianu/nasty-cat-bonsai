import { HtmlBasePlugin } from "@11ty/eleventy";
import Image from "@11ty/eleventy-img";
import site from "./src/_data/site.js";

/* ---- Gallery thumbnails --------------------------------------------------
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

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export default function (eleventyConfig) {
  // Rewrites root-relative URLs (/assets/..., /blog/...) to include the
  // /nasty-cat-bonsai/ path prefix in the built output.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

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

  // Inline image served from the bonsai-images CDN repo, for use in posts:
  //   {% cdnimg "blog/repot-01.webp", "Roots after combing out", "Optional caption" %}
  eleventyConfig.addShortcode("cdnimg", function (file, alt, caption) {
    const cdn = "https://cdn.jsdelivr.net/gh/marius-vrancianu/bonsai-images@main/";
    const cap = caption ? `<figcaption>${caption}</figcaption>` : "";
    return `<figure class="post-figure">
  <div class="cdn-frame"><img src="${cdn}${file}" alt="${alt}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('missing');this.parentElement.setAttribute('data-file','${file}')"></div>
  ${cap}
</figure>`;
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
    const missing =
      `this.parentElement.classList.add('missing');` +
      `this.parentElement.setAttribute('data-file','${esc(item.file)}')`;
    const priority =
      index < 4
        ? ` fetchpriority="high"`
        : ` loading="lazy"`;

    let sources;
    try {
      const metadata = await Image(site.images.source + item.file, {
        widths: THUMB_WIDTHS,
        formats: ["webp"],
        sharpWebpOptions: { quality: THUMB_QUALITY },
        outputDir: "_site/assets/gallery/",
        urlPath: "/assets/gallery/",
        cacheOptions: { duration: "30d" },
      });
      sources = metadata.webp;
    } catch (err) {
      const why = `Could not build a thumbnail for ${item.file}: ${err.message}`;
      if (process.env.CI) throw new Error(why);
      console.warn(`[gallery] ${why} — falling back to the full-size original`);
      return `<img src="${esc(site.images.cdn + item.file)}" alt="${alt}"` +
        `${priority} decoding="async" onerror="${missing}">`;
    }

    const srcset = sources.map((s) => `${s.url} ${s.width}w`).join(", ");
    // The fallback for a browser without srcset, which in practice is none
    // of them: the middle width, rather than the largest, so that if this
    // ever is the one fetched it is not the heaviest.
    const fallback = sources[Math.floor((sources.length - 1) / 2)];
    const biggest = sources[sources.length - 1];
    return (
      `<img src="${fallback.url}" srcset="${srcset}" sizes="${THUMB_SIZES}"` +
      ` width="${biggest.width}" height="${biggest.height}" alt="${alt}"` +
      `${priority} decoding="async" onerror="${missing}">`
    );
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
