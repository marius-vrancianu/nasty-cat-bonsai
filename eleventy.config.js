import { HtmlBasePlugin } from "@11ty/eleventy";

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
