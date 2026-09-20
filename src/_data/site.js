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
    // Manifest listing ONLY the images that belong in the gallery
    // (raw.githubusercontent.com updates within minutes of a push).
    manifest:
      "https://raw.githubusercontent.com/marius-vrancianu/bonsai-images/main/gallery.json",
    // Image bytes are served via jsDelivr's CDN. This is what a VISITOR
    // fetches: the full-size original, opened from the lightbox and from a
    // post's {% cdnimg %}.
    cdn: "https://cdn.jsdelivr.net/gh/marius-vrancianu/bonsai-images@main/",
    // Where the BUILD reads the same bytes from, to cut the gallery grid's
    // thumbnails. Nobody's browser ever sees this host — only the GitHub
    // Actions runner does — so raw.githubusercontent.com being blocked on
    // some corporate networks (the reason the manifest is baked in at
    // build time, see _data/gallery.js) does not matter here, and it is
    // the origin rather than a cache, so a replaced photo is never stale.
    source: "https://raw.githubusercontent.com/marius-vrancianu/bonsai-images/main/",
  },
};
