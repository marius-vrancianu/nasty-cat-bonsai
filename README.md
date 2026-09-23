# Nasty Cat Bonsai

A small, static personal site about bonsai — gallery, blog, and about page —
built with [Eleventy](https://www.11ty.dev/) and served by GitHub Pages at
**https://marius-vrancianu.github.io/nasty-cat-bonsai/**.

> 📖 **New here? Read [GUIDE.md](GUIDE.md)** — the full owner's manual:
> adding gallery photos, writing posts, embedding images/videos, deploying,
> undoing mistakes. This README is just the quick reference.

## How it fits together

- **This repo** holds the site source (`src/`) and builds to static HTML.
- **The [`bonsai-images`](https://github.com/marius-vrancianu/bonsai-images) repo**
  holds all photos — nothing image-heavy is committed here (except the
  homepage hero, which is a core design asset).
  - `gallery/…` — photos that appear in the gallery
  - `blog/…` — photos embedded in blog posts, and post thumbnails (never
    shown in the gallery)

  Upload everything at full size (1600–2000 px on the long side). The
  build cuts the copies each page actually draws — gallery cards, the
  lightbox, post thumbnails and in-post figures alike — and serves those
  from this site, share previews included. No visitor ever downloads an
  original: the deploy workflow checks the images repo out and cuts from
  that (`IMAGES_DIR`, see "Where the photos come from" in
  `eleventy.config.js`), and prunes the copies of photos no page uses.
  - `gallery.json` — the manifest that decides *exactly* what the gallery
    shows, with captions. Blog images are separated simply by not being
    listed here.
- **Comments** are our own — see `comments-worker/`. A name, a comment, an
  optional email, no login and no cookies. Every comment emails you one
  message with Approve / Decline / Spam buttons; nothing appears on the site
  until you tap one. Activated by pasting the deployed worker's URL into
  `comments.apiUrl` in `src/_data/site.js`; leave it empty to switch comments
  off entirely.

## Everyday tasks

### Preview locally

```bash
npm install        # first time only
npm start          # → http://localhost:8080/nasty-cat-bonsai/

# or, building from a local clone of bonsai-images, exactly as a deploy does:
IMAGES_DIR=../bonsai-images npm start
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

{% cdnimg "blog/my-photo.webp", "Alt text", "Optional caption" %}
```

The blog index, post page, and RSS feed update automatically at build time.

### Add a gallery photo

1. Commit the image to `bonsai-images` under `gallery/`.
2. Add an entry for it to `gallery.json` in that repo:

```json
{ "file": "gallery/tree-10.webp", "species": "Chinese Elm",
  "trees": ["Ulmus parvifolia, anno culto 2019"],
  "style": "Broom", "date": "Jul 2026",
  "notes": "Longer caption shown in the lightbox." }
```

   `trees` is optional and always a list. Each unique string in it becomes
   an option in the Gallery's "one tree over the years" dropdown (sorted
   alphabetically, `+`-prefixed lost trees last), so every photo of the
   same tree must carry the *exact* same string — copy-paste it, never
   retype. Group shots list every tree in frame. See [GUIDE.md](GUIDE.md) §1.3.

3. Deploy. The photo list is baked into the page while the site builds, so
   gallery edits go live with the next deploy — not before. (This is what
   makes the gallery load on networks that block `raw.githubusercontent.com`,
   and what lets search engines see the photos at all.)

`ratio` is optional: the deploy measures each photo and shapes its card to
fit. Give one (`"width/height"`, e.g. `"1/1"`) only to crop a card on
purpose. The deploy cuts each photo into the WebP sizes the grid and the
lightbox draw; you upload one full-size file and nothing else. No waiting
between committing `gallery.json` and deploying — the deploy reads the
images repo's latest commit. Replacing a photo under the same name is fine:
copies are named after the file's contents, so the next deploy picks it
up. Full details in [GUIDE.md](GUIDE.md) §1.

### Publish

Pushing to `main` does **not** deploy. When you're happy with a locally
tested state: Actions tab → **Deploy to GitHub Pages** → *Run workflow*.

The other workflow, **Check the hills**, runs on pushes that touch anything
but Markdown, posts or the comments worker, and never publishes: it renders the homepage in Chromium and checks the hill backdrop
still agrees with `tools/gen-hills.py` and the figures in `main.css`
(run it locally with `python3 tools/gen-hills.py --check`, then
`node tools/check-hills.mjs` after a build — see the top of that file).

## Design tokens

Palette, type scale, and spacing live as CSS custom properties at the top of
`src/assets/css/main.css`. Typeface is Proza Libre, **self-hosted** from
`src/assets/fonts/` (SIL Open Font License) — no visitor's browser ever
talks to Google to fetch it. The comments in `main.css` carry the reasoning
behind the palette, including the contrast ratio every dark-theme colour
was solved to; they are stripped from the copy visitors download, which is
also where `fonts.css` is folded into it. The scripts in `src/assets/js/`
are minified with Terser at build time the same way — the repo keeps the
readable versions.

## Still to do before launch

- [x] Deploy the comments worker and paste its URL into `src/_data/site.js` — done
- [ ] Replace the sample posts in `src/posts/` with real ones — delete the
      two sample `.md` files (their missing images go with them). Any test
      comments on them trigger the worker's "post deleted" email within one
      to two weeks; answer **Delete now**. GUIDE §3.7.
- [ ] Rewrite `src/about.md`: replace the placeholder text, and either upload
      `blog/workshop-01.webp` and `blog/maple-collection-02.webp` to
      bonsai-images or change/remove those two photo lines. GUIDE §2.
