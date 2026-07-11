/* Build-time gallery data. Fetches gallery.json from the bonsai-images
   repo while the site is being built, so the Gallery page is rendered as
   static HTML: no runtime dependency on raw.githubusercontent.com (which
   some corporate networks block) and the photo list is indexable by
   search engines. The manifest format is documented in GUIDE.md §1. */
import fs from "node:fs";
import Fetch from "@11ty/eleventy-fetch";
import site from "./site.js";

export default async function () {
  try {
    // Local preview of a manifest edit before pushing it to bonsai-images:
    //   GALLERY_MANIFEST=path/to/gallery.json npm run build
    const data = process.env.GALLERY_MANIFEST
      ? JSON.parse(fs.readFileSync(process.env.GALLERY_MANIFEST, "utf8"))
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
        `Could not load the gallery manifest (${site.images.manifest}): ${err.message}` +
          ` — if you just edited gallery.json, check it for a stray comma.`
      );
    }
    console.warn("[gallery] manifest unavailable, building an empty gallery:", err.message);
    return [];
  }
}
