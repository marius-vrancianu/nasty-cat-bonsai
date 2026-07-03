# Nasty Cat Bonsai

A small, static personal site about bonsai — gallery, blog, and about page —
built with [Eleventy](https://www.11ty.dev/) and served by GitHub Pages at
**https://marius-vrancianu.github.io/nasty-cat-bonsai/**.

## How it fits together

- **This repo** holds the site source (`src/`) and builds to static HTML.
- **The [`bonsai-images`](https://github.com/marius-vrancianu/bonsai-images) repo**
  holds all photos, served via CDN — nothing image-heavy is committed here
  (except the homepage hero, which is a core design asset).
  - `gallery/…` — photos that appear in the gallery
  - `blog/…` — photos embedded in blog posts (never shown in the gallery)
  - `gallery.json` — the manifest that decides *exactly* what the gallery
    shows, with captions. Blog images are separated simply by not being
    listed here.
- **Comments** are Giscus (GitHub Discussions) — see the setup note in
  `src/_includes/layouts/post.njk`.

## Everyday tasks

### Preview locally

```bash
npm install        # first time only
npm start          # → http://localhost:8080/nasty-cat-bonsai/
```

### Write a blog post

Add `src/posts/my-post-title.md`:

```markdown
---
title: My Post Title
date: 2026-07-03
excerpt: One or two sentences shown on the blog index and in the RSS feed.
thumb: blog/my-post-thumb.webp   # path inside bonsai-images (optional)
---
Body text in Markdown.

{% raw %}{% cdnimg "blog/my-photo.webp", "Alt text", "Optional caption" %}{% endraw %}
```

The blog index, post page, and RSS feed update automatically at build time.

### Add a gallery photo

1. Commit the image to `bonsai-images` under `gallery/`.
2. Add an entry for it to `gallery.json` in that repo:

```json
{ "file": "gallery/tree-10.webp", "species": "Chinese Elm",
  "style": "Broom", "date": "Jul 2026", "ratio": "4/3",
  "notes": "Longer caption shown in the lightbox." }
```

No site rebuild needed — the gallery reads the manifest in the browser.
(Note: image *bytes* go through jsDelivr, which caches `@main` URLs for up
to a week; the manifest is read from `raw.githubusercontent.com`, which
updates within ~5 minutes.)

### Publish

Pushing to `main` does **not** deploy. When you're happy with a locally
tested state: Actions tab → **Deploy to GitHub Pages** → *Run workflow*.

## Design tokens

Palette, type scale, and spacing live as CSS custom properties at the top of
`src/assets/css/main.css`. Typeface is Proza Libre (Google Fonts).

## TODO after first deploy

- [ ] Replace placeholder social links + email in `src/_data/site.js`
- [ ] Enable Discussions + Giscus (instructions in `src/_includes/layouts/post.njk`)
- [ ] Replace sample posts and upload real photos to `bonsai-images`
