/* Build-time gallery data. Reads gallery.json from the bonsai-images
   repo while the site is being built — from the checkout the workflows
   make (IMAGES_DIR, see eleventy.config.js), or over the network for a
   local preview — so the Gallery page is rendered as
   static HTML: no runtime dependency on raw.githubusercontent.com (which
   some corporate networks block) and the photo list is indexable by
   search engines. The manifest format is documented in GUIDE.md §1. */
import fs from "node:fs";
import path from "node:path";
import Fetch from "@11ty/eleventy-fetch";
import site from "./site.js";

export default async function () {
  // Local preview of a manifest edit before pushing it to bonsai-images:
  //   GALLERY_MANIFEST=path/to/gallery.json npm run build
  // Otherwise the checkout the workflows make, if there is one.
  const local =
    process.env.GALLERY_MANIFEST ||
    (process.env.IMAGES_DIR && path.join(process.env.IMAGES_DIR, "gallery.json"));
  try {
    const data = local
      ? JSON.parse(fs.readFileSync(local, "utf8"))
      : await Fetch(site.images.manifest, {
          duration: "1h", // local rebuilds within the hour reuse .cache/
          type: "json",
        });
    const list = Array.isArray(data) ? data : data && data.items;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("manifest did not parse to a non-empty array");
    }
    return list;
  } catch (err) {
    // On CI a bad or unreachable manifest must fail the deploy — the
    // previous good version of the site then stays live. Locally, degrade
    // to an empty gallery so the rest of the site still builds offline.
    if (process.env.CI) {
      throw new Error(
        `Could not load the gallery manifest (${local || site.images.manifest}): ${err.message}` +
          ` — if you just edited gallery.json, check it for a stray comma.`
      );
    }
    console.warn("[gallery] manifest unavailable, building an empty gallery:", err.message);
    return [];
  }
}
