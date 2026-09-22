export default {
  name: "Nasty Cat Bonsai",
  // Absolute base of the deployed site (no trailing slash) — used for the RSS feed.
  url: "https://marius-vrancianu.github.io/nasty-cat-bonsai",
  description:
    "A small collection of bonsai, a gallery of the trees, and a running log of what works — and what the cat undoes.",
  author: "Marius Vrancianu",
  email: "marius.v.vrancianu@gmail.com",
  social: {
    facebook: "https://www.facebook.com/nasty.cat.bonsai",
    instagram: "https://www.instagram.com/nasty.cat.bonsai",
  },
  analytics: {
    // Google Analytics 4 measurement ID (Admin → Data streams → your stream).
    // The gtag snippet is only rendered when this is filled in.
    gaMeasurementId: "G-DPMW9G3Q5P",
  },
  comments: {
    // Our own comment worker — see comments-worker/README.md. This is the
    // URL `wrangler deploy` prints, with no trailing slash.
    //
    // Comments stay hidden on posts until this is filled in, so leaving it
    // empty is a clean way to switch them off entirely.
    apiUrl: "https://nasty-cat-comments.marius-v-vrancianu.workers.dev",
  },
  images: {
    // Manifest listing ONLY the images that belong in the gallery, for a
    // local preview (raw.githubusercontent.com updates within minutes of a
    // push). The workflows read gallery.json from their checkout instead.
    manifest:
      "https://raw.githubusercontent.com/marius-vrancianu/bonsai-images/main/gallery.json",
    // Where a LOCAL PREVIEW reads the photos from, to cut every copy the
    // pages draw. The workflows do not use it: they check out bonsai-images
    // and point IMAGES_DIR at it (see "Where the photos come from" in
    // eleventy.config.js). Nobody's browser ever sees this host — every
    // picture a visitor gets is a copy served from the site itself — so
    // raw.githubusercontent.com being blocked on some corporate networks
    // does not matter here.
    source: "https://raw.githubusercontent.com/marius-vrancianu/bonsai-images/main/",
  },
};
