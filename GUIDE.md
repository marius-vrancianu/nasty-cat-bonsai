# Nasty Cat Bonsai — Owner's Guide

Everything you need to run this site yourself, assuming you've never touched
front-end code. Every task below is done **entirely in the browser on
github.com** — no tools to install, nothing on your PC.

---

## 0. The big picture (read this once)

Your site is made of **two GitHub repositories** ("repos" — think of each as
a versioned folder in the cloud):

| Repo | What it holds | When you touch it |
| --- | --- | --- |
| [`nasty-cat-bonsai`](https://github.com/marius-vrancianu/nasty-cat-bonsai) | The website itself: page text, blog posts, design (CSS), templates | Writing posts, editing the About page, changing design |
| [`bonsai-images`](https://github.com/marius-vrancianu/bonsai-images) | All your photos + the gallery's caption file | Adding/updating photos |

Two golden rules:

1. **Saving a change ("committing") does NOT publish it.** The live site at
   <https://marius-vrancianu.github.io/nasty-cat-bonsai/> only changes when
   you run the deploy workflow (section 5). Commit as much as you like —
   nothing goes live until you press the button.
   - This includes the gallery: the photo list (`gallery.json` in
     `bonsai-images`) is read once, **during the deploy**, and baked into
     the page — so gallery edits also go live via the deploy button
     (details in section 1.4).
2. **Every change is reversible.** Git keeps full history; section 6.3 shows
   the two-click undo.

### The three GitHub moves you'll use everywhere

You only ever need these; all sections below reference them.

**A. Edit a file**
1. In the repo, click through folders to the file (e.g. `src` → `about.md`).
2. Click the **pencil icon** (✏️, top-right of the file view).
3. Make your edits in the text box.
4. Click the green **Commit changes...** button → a dialog appears →
   write a short description of what you did → keep
   "Commit directly to the `main` branch" selected → **Commit changes**.

**B. Upload a file**
1. In the repo, navigate **into the folder** where the file belongs
   (e.g. open `gallery/` inside `bonsai-images`).
2. Click **Add file** (top right) → **Upload files**.
3. Drag your file(s) in, write a short commit message → **Commit changes**.

**C. Create a new file**
1. Navigate to the folder it belongs in.
2. Click **Add file** → **Create new file**.
3. Type the file name at the top, the content below → **Commit changes...**

---

## 1. Gallery: adding photos, titles, subtitles, descriptions

The Gallery page shows **exactly** the photos listed in one file:
`gallery.json` in the `bonsai-images` repo. A photo that isn't listed there
never appears, no matter where it's uploaded. That's the whole system.

### 1.1 Prepare the photo (on your PC)

- **Format:** WebP is ideal, JPEG is fine. To convert/compress for free, use
  <https://squoosh.app> in your browser (drag photo in, pick WebP, quality
  ~75, save).
- **Size:** resize so the longest side is **1600–2000 px**. Phone photos
  straight off the camera are 5–10× bigger than needed and slow the page.
- **Name:** lowercase, no spaces, descriptive: `maple-repot-2026.webp`,
  `tree-10.webp`. **Never reuse a name that already exists** (see 1.4 why).

### 1.2 Upload it

Use move **B** to upload the file into the `gallery/` folder of the
**`bonsai-images`** repo.

### 1.3 List it (title, subtitle, description)

Use move **A** to edit `gallery.json` (it's in the root of `bonsai-images`).
The file is a list of entries between `[` and `]`; each entry looks like:

```json
{
  "file": "gallery/maple-repot-2026.webp",
  "species": "Japanese Maple",
  "trees": ["Acer palmatum, anno culto 2024"],
  "style": "Informal upright",
  "date": "Jul 2026",
  "ratio": "3/4",
  "alt": "Japanese maple in a blue glazed pot",
  "notes": "Repotted this spring; the nebari is finally flaring."
}
```

What each field does on the site:

| Field | Where it shows | Notes |
| --- | --- | --- |
| `file` | — | Path of the image inside the repo. Must match exactly. |
| `species` | **Title** — teal/rust heading on the card and lightbox | |
| `trees` | **Tree identity** — powers the "one tree over the years" dropdown at the top of the Gallery | Optional. Always a list, even for one tree: `"trees": ["Ficus benjamina, anno culto 2012"]`. Every photo of the same tree must carry the *exact same* string (copy-paste it). A photo with several trees in frame (exhibitions, group shots) lists them all and shows up under each |
| `style` + `date` | **Subtitle** — the small "Informal upright · Jul 2026" line | |
| `notes` | **Description** — longer text, shown only in the lightbox (after clicking) | Optional |
| `ratio` | Shape of the card: `"3/4"` = portrait, `"4/3"` = landscape, `"1/1"` = square | Match your photo's orientation |
| `alt` | Screen-reader / SEO description of what's *in* the photo | Optional but good practice |

**The progression dropdown.** Each unique string across the `trees` lists
becomes an option in the Gallery's dropdown (with its photo count);
picking one shows only that tree's photos, in the same order they have in
this file, and the lightbox arrows stay within that tree. The choice is
reflected in the URL (`…/gallery/#tree=…`), so you can share a link
straight to one tree's history. Photos without a `trees` field simply
never match a dropdown option — fine while you're catching up on tagging.

To **add** a photo: copy an existing entry (from `{` to `}`), paste it after
another entry, edit the values. **Watch the commas**: every entry is
separated from the next by a comma, but the *last* entry has no comma after
it. This is the #1 way to break the file — if the deploy workflow fails
with an error mentioning the gallery manifest, you have a stray/missing
comma (the live site stays untouched until you fix it and deploy again).
Paste the file's content into <https://jsonlint.com> to find the exact spot.

- **Reorder** the gallery = reorder the entries.
- **Remove** a photo from the gallery = delete its entry (the file can stay).
- **Change titles/captions** any time = just edit the entry.

### 1.4 When will I see it? (deploy + cache rules)

- `gallery.json` changes (add/remove/reorder photos, edit captions):
  **after the next deploy** — the photo list is baked into the site while
  it's being built, so run the deploy workflow (section 5) when you're done
  editing. (This is what makes the gallery load reliably everywhere and be
  indexable by search engines.)
- **New** image files: on the CDN within minutes, so they show as soon as
  the deploy that lists them is live.
- **Replacing an existing file under the same name: up to 7 days** (the CDN
  caches aggressively). This is why you never overwrite — upload the fixed
  photo under a new name (`maple-repot-2026-b.webp`) and update `file` in
  `gallery.json` instead.
- Hard-refresh your browser (**Ctrl+F5**) when checking.

---

## 2. The About page

The text lives in the **`nasty-cat-bonsai`** repo at `src/about.md`.
Use move **A** to edit it. It's Markdown — plain text with light formatting
(cheat sheet in section 3.3).

**Embedding a photo:** upload the image to the `blog/` folder of
`bonsai-images` (move B — yes, the `blog/` folder is the home for *all*
non-gallery images, About included; they'll never leak into the Gallery
because they're not in `gallery.json`). Then put this line in `about.md`
where you want the photo:

```
{% cdnimg "blog/workbench.webp", "My repotting workbench", "Optional caption under the photo" %}
```

The three parts: file path, alt text (description for screen readers —
required), caption (optional — shows under the image in teal; leave it out
entirely if not wanted).

After editing, **deploy** (section 5) to publish.

---

## 3. Blog posts

### 3.1 Creating a post

Use move **C** in the `nasty-cat-bonsai` repo: create a new file inside
`src/posts/`. The **file name becomes the URL**:
`my-first-repotting.md` → `.../blog/my-first-repotting/`.
Use lowercase-with-dashes, end in `.md`.

Every post starts with a header block ("front matter") between `---` lines,
then the article text:

```markdown
---
title: My First Repotting
date: 2026-07-15
excerpt: One or two sentences shown on the blog index and in the RSS feed.
thumb: blog/my-first-repotting-thumb.webp
tags: [repotting, maples]
---
The article text starts here, in Markdown.

## A section heading

More text. **Bold**, *italic*, [a link](https://example.com).
```

- `date` must be `YYYY-MM-DD`. The blog index sorts newest-first by this
  date automatically — you never edit the index page itself. The RSS feed
  updates automatically too.
- `tags` is optional: short lowercase labels shown as clickable chips on
  the blog index and under the post title. Clicking one filters the blog
  to that tag (the URL becomes `…/blog/#tag=repotting`, so a tag view is
  shareable). Reuse the same spellings across posts so tags stay useful.
  **Never use the tag `posts`** — that name is reserved by the site's
  machinery.
- The blog's search box needs no maintenance: it searches the full text
  of every post and its index is rebuilt automatically on each deploy.
- Don't post-date into the future expecting it to self-publish — the site
  only changes when you deploy.

### 3.2 Thumbnails

`thumb:` is the small image on the blog index card. Upload it to
`bonsai-images/blog/` (move B), ~800 px wide, ideally landscape (the card
crops to 4:3), then reference it as above. If you omit `thumb:`, the card
shows the striped placeholder pattern — fine while drafting.

### 3.3 Formatting text (Markdown cheat sheet)

| You type | You get |
| --- | --- |
| `## Heading` | Section heading (accent color, like "Timing the repot") |
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `> quoted text` | The teal italic pull-quote style |
| `- item` (one per line) | Bulleted list |
| `1. item` | Numbered list |
| `[text](https://url)` | Link |
| Blank line | New paragraph (required — a single line break is ignored) |

That's intentionally the whole palette — fonts, sizes, and colors are
global so every post looks consistent (see 6.2 to change them site-wide).

### 3.4 Embedding images

Same as the About page — upload to `bonsai-images/blog/`, then:

```
{% cdnimg "blog/roots-closeup.webp", "Root ball after combing", "More feeder roots than expected." %}
```

### 3.5 Embedding YouTube videos

Take the video ID from the YouTube URL — the part after `v=`:
`youtube.com/watch?v=`**`dQw4w9WgXcQ`** (in a `youtu.be/...` short link,
it's the part right after the slash). Then:

```
{% youtube "dQw4w9WgXcQ", "Short description of the video" %}
```

You get a full-width, responsive player (privacy-friendly: YouTube sets no
cookies until the visitor presses play).

### 3.6 Publishing and updating

New post or edit → commit → **deploy** (section 5). To fix a typo later:
edit the file (move A), commit, deploy again. To unpublish a post: delete
the file (open it → click the **trash icon** next to the pencil → commit)
and deploy.

---

## 4. Uploading files — summary table

| What | Which repo | Which folder |
| --- | --- | --- |
| Gallery photo | `bonsai-images` | `gallery/` (+ entry in `gallery.json`) |
| Blog/About photo, post thumbnail | `bonsai-images` | `blog/` |
| Blog post | `nasty-cat-bonsai` | `src/posts/` |
| Page text (About, etc.) | `nasty-cat-bonsai` | `src/` |
| Design (CSS) | `nasty-cat-bonsai` | `src/assets/css/main.css` |

---

## 5. Deploying (publishing) the site

Any change in the **`nasty-cat-bonsai`** repo — posts, About, CSS, templates
— needs a deploy to go live, and so does the gallery list (`gallery.json`
in `bonsai-images`): each deploy bakes the current photo list into the
site. Merely uploading image files doesn't need one — they only appear
once `gallery.json` lists them and that change is deployed.

1. Open <https://github.com/marius-vrancianu/nasty-cat-bonsai>.
2. Click the **Actions** tab (top of the page).
3. In the left sidebar, click **Deploy to GitHub Pages**.
4. On the right, click the **Run workflow ▾** button → keep branch `main` →
   press the green **Run workflow**.
5. A new run appears in the list within a few seconds (refresh if not).
   Click it to watch. **Green check ✓** = live (allow a minute + Ctrl+F5).

**If it fails with a red ✗:** click the run → click the failed job → read
the last lines. If it says **"Deployment failed, try again later"**, that's
a temporary GitHub hiccup — it happens now and then; just run the workflow
again (it has never failed twice in a row here). Any other error: it will
almost always be a typo in a file you just edited (a broken front-matter
`---` block, or a stray comma in `gallery.json` — the error message names
the gallery manifest in that case) — recheck your last commit, or see 6.3
to undo it.

The GitHub mobile app can also trigger this workflow, so you can publish
from the couch.

---

## 6. Everything else you'll eventually wonder about

### 6.1 Comments (Cusdis)

Visitor comments are **held for your approval** and appear on the site only
after you approve them. Moderate at <https://cusdis.com/dashboard> (log in
with the account you created). Do enable email notifications in the
dashboard settings, or you'll never know someone commented. Comments are
stored by Cusdis, not in GitHub — deleting them happens in that dashboard
too.

### 6.2 Changing the design (colors, fonts, spacing)

All design knobs live in **one file**: `src/assets/css/main.css` in
`nasty-cat-bonsai`. The palette is defined once at the top as variables and
used everywhere:

- Light theme: the first `:root { ... }` block (`--washi` paper, `--ink`
  text, `--rust` accent, `--teal` secondary).
- Dark theme: the `:root[data-theme="dark"] { ... }` block right below it.

Change a value there, commit, deploy — the whole site follows. The
typeface is Proza Libre, loaded from Google Fonts in
`src/_includes/layouts/base.njk`; to swap fonts, replace the Google Fonts
`<link>` there and the `--font` variable in the CSS.

Below the variables, the CSS is organized in commented sections (homepage,
gallery, blog...). It's safe to experiment: deploy is manual and undo is
two clicks.

### 6.3 Undo — reverting a bad commit

1. In the repo, click the **commit count** ("N commits", right above the
   file list) to see the history.
2. Find the bad commit, click it to review what changed
   (green = added, red = removed).
3. To undo it: click the **⋯ menu** (top-right of the commit page) →
   **Revert changes** → GitHub creates the "opposite" commit → confirm.
   (If Revert offers to open a pull request: create it, then on the PR page
   press **Merge pull request** → **Confirm** — that lands the undo on
   `main`.)
4. Deploy (section 5) to publish the undo.

### 6.4 Social links & email

Defined once in `src/_data/site.js` (`nasty-cat-bonsai`) — edit, commit,
deploy. Homepage and all footers update together.

### 6.5 Changing the homepage hero image

The hero is served as **five files** in `src/assets/img/`: the original
`hero.jpg` plus four compressed copies the browser prefers when it can
(`hero.avif`, `hero.webp`, and 800px-wide `hero-800.avif` /
`hero-800.webp` for phones). To swap the hero, replace **all five** (move
B into `src/assets/img/`, same names — GitHub will overwrite). Make the
compressed copies for free at <https://squoosh.app>: drag the new image
in, export once as AVIF (quality ~60) and once as WebP (quality ~80),
then repeat with the width resized to 800 px. Replacing only `hero.jpg`
would leave most visitors seeing the old picture.

**Important:** the homepage geometry (the mat/stroke and the position of
the nav) is computed from this image's exact proportions (1134×1286). A
same-proportioned image drops right in; a different shape needs three
constants updated in `main.css` (search for `0.8818` — the comments there
show the math) and the `width`/`height`/`sizes` values on the homepage
`<picture>` in `src/index.njk`.

### 6.6 Theme toggle

The moon/sun button top-right. Every visitor starts in light; dark is a
per-visitor choice remembered by their browser. There's nothing to
maintain; it just works.

### 6.7 What not to touch (unless you mean it)

- `eleventy.config.js`, `package.json`, `package-lock.json`,
  `src/_data/gallery.js`, `.github/workflows/deploy.yml` — the build
  machinery.
- `src/_includes/` — page templates (HTML skeletons). Editable, but a typo
  here breaks every page at once, so change one thing at a time and deploy
  after each.
- The `_site/` folder never appears in the repo — it's generated during
  deploy. If you see build output locally, don't upload it.

### 6.8 Optional: previewing on your PC before deploying

Not required (that's what manual deploy + easy revert are for), but if you
want a true local preview: install Node.js LTS from <https://nodejs.org>,
then in a terminal:

```
git clone https://github.com/marius-vrancianu/nasty-cat-bonsai
cd nasty-cat-bonsai
npm install
npm start
```

Open <http://localhost:8080/nasty-cat-bonsai/>. It live-reloads as you edit
files. (As an RPA developer you'll be fine — but genuinely, the
edit-on-GitHub workflow covers everything.)

### 6.9 The old `marius-vrancianu.github.io` repo

Your user-site repo is currently unused (it holds an early staging copy of
this site on a side branch, plus open PR #1). Safe to close that PR and
delete the branch. Keep the repo — if you ever want a personal landing page
at the root URL `marius-vrancianu.github.io`, that's where it goes.

### 6.10 URLs, RSS, favicon

- New posts get `…/nasty-cat-bonsai/blog/<file-name>/` automatically.
- RSS feed: `…/nasty-cat-bonsai/feed.xml` (the footer's RSS icon) — updates
  itself from your posts on every deploy, and carries the full article
  text (with images) so subscribers can read entirely in their feed
  reader.
- Search engines get a `sitemap.xml` and `robots.txt`, both generated on
  every deploy — nothing to maintain. (Optional: submit the sitemap once
  at <https://search.google.com/search-console> to see what people search
  for to find you.)
- Sharing a link (Facebook, WhatsApp, etc.) shows a preview card: posts
  use their `thumb:` image and `excerpt:`, everything else the hero. Set
  both in a post's front matter to control how it looks when shared.
- The browser-tab icon is a 🐈 emoji, set in
  `src/_includes/layouts/base.njk` (searchable as `favicon`) — swap the
  emoji there if the cat ever calms down.
