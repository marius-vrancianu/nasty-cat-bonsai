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
    linkedin: "https://www.linkedin.com/in/marius-vrancianu",
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
