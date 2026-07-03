export default {
  name: "Nasty Cat Bonsai",
  // Absolute base of the deployed site (no trailing slash) — used for the RSS feed.
  url: "https://marius-vrancianu.github.io/nasty-cat-bonsai",
  description:
    "A small collection of bonsai, a gallery of the trees, and a running log of what works — and what the cat undoes.",
  author: "Marius Vrancianu",
  // TODO: replace placeholders with real profiles / email.
  email: "hello@example.com",
  social: {
    facebook: "#",
    instagram: "#",
    linkedin: "#",
    github: "https://github.com/marius-vrancianu",
  },
  images: {
    // Manifest listing ONLY the images that belong in the gallery
    // (raw.githubusercontent.com updates within minutes of a push).
    manifest:
      "https://raw.githubusercontent.com/marius-vrancianu/bonsai-images/main/gallery.json",
    // Image bytes are served via jsDelivr's CDN.
    cdn: "https://cdn.jsdelivr.net/gh/marius-vrancianu/bonsai-images@main/",
  },
};
