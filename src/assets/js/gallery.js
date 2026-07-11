/* Gallery lightbox. The photo grid itself is rendered at build time from
   the bonsai-images manifest (see src/_data/gallery.js); each card is a
   plain link to the full image, so the gallery works — and is indexable —
   without JavaScript. This script upgrades those links into a
   keyboard-navigable lightbox, reading item metadata (ratio, species,
   notes) from the inline JSON blob rendered next to the grid. */
(function () {
  "use strict";

  var grid = document.getElementById("gallery");
  var dataEl = document.getElementById("gallery-data");
  if (!grid || !dataEl) return;

  var items;
  try {
    items = JSON.parse(dataEl.textContent);
  } catch (e) {
    return; // leave the cards as plain links
  }
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".gallery-card"));
  if (!Array.isArray(items) || items.length !== cards.length) return;

  var current = null;
  var lastFocused = null;
  var visible = items.map(function (_, i) { return i; });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // `tree` in the manifest is a string for single-tree photos or an array
  // for photos with several trees in frame; normalize to an array.
  function treesOf(item) {
    return Array.isArray(item.tree) ? item.tree : item.tree ? [item.tree] : [];
  }

  // Full-size photo for the lightbox; src and alt are taken from the
  // card's grid image, which the build already pointed at the CDN.
  function frame(item, card) {
    var f = el("div", "cdn-frame");
    var gridImg = card.querySelector("img");
    var img = el("img");
    img.src = card.href;
    img.alt = gridImg ? gridImg.alt : item.species;
    img.decoding = "async";
    img.addEventListener("error", function () {
      f.classList.add("missing");
      f.setAttribute("data-file", item.file);
    });
    f.appendChild(img);
    return f;
  }

  /* ---- Lightbox ---------------------------------------------------- */

  var box = el("div", "lightbox");
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Image viewer");

  var closeBtn = el("button", "lightbox-close", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  var prevBtn = el("button", "lightbox-prev", "‹");
  prevBtn.type = "button";
  prevBtn.setAttribute("aria-label", "Previous image");
  var nextBtn = el("button", "lightbox-next", "›");
  nextBtn.type = "button";
  nextBtn.setAttribute("aria-label", "Next image");
  var body = el("div", "lightbox-body");

  box.appendChild(closeBtn);
  box.appendChild(prevBtn);
  box.appendChild(body);
  box.appendChild(nextBtn);
  document.body.appendChild(box);

  // Parse a manifest ratio like "3/4" or "1592/2000" into width/height.
  function ratioOf(item) {
    var parts = String(item.ratio || "3/4").split("/");
    var r = parseFloat(parts[0]) / parseFloat(parts[1]);
    return isFinite(r) && r > 0 ? r : 0.75;
  }

  // Preferred layout: the photo sits on the left, stretched to the full
  // viewport height minus a margin of 5% of its longest side, which is
  // also the gap to the browser edges and to the caption block that sits
  // at the photo's lower right. When the viewport is too narrow for
  // that arrangement (portrait phones), fall back to a stacked card:
  // photo above caption, the whole unit fitted to the viewport height.
  // Float the close button just above the photo's top-right corner.
  function positionClose() {
    var f = body.firstChild;
    if (!f || box.hidden) return;
    var fr = f.getBoundingClientRect();
    var br = closeBtn.getBoundingClientRect();
    var top = Math.max(fr.top - br.height, 2);
    var left = Math.min(Math.max(fr.right - br.width, 2), window.innerWidth - br.width - 2);
    closeBtn.style.top = top + "px";
    closeBtn.style.left = left + "px";
    closeBtn.style.right = "auto";
  }

  var lastVW = 0;
  var lastVH = 0;

  function fit() {
    if (current === null) return;
    var f = body.firstChild;
    var cap = body.lastChild;
    var r = ratioOf(items[current]);
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    lastVW = vw;
    lastVH = vh;

    box.classList.remove("lb-side");
    box.style.padding = "";
    body.style.width = "";
    body.style.gap = "";
    f.style.width = "";
    f.style.height = "";
    cap.style.width = "";
    cap.style.maxHeight = "";

    // Side-by-side: solve H + 2·(5% of longest side) = viewport height.
    var H = vh / (r < 1 ? 1.1 : 1 + 0.1 * r);
    var W = H * r;
    var m = 0.05 * Math.max(W, H);
    var capW = Math.min(420, vw - W - 3 * m);
    if (capW >= 240) {
      box.classList.add("lb-side");
      box.style.padding = m + "px";
      body.style.gap = m + "px";
      f.style.width = W + "px";
      f.style.height = H + "px";
      cap.style.width = capW + "px";
      cap.style.maxHeight = H + "px";
      requestAnimationFrame(positionClose);
      return;
    }

    // Stacked card, photo-first: the photo always takes its maximum
    // width-limited size; the caption gets whatever height remains and
    // scrolls internally when the text is longer.
    var maxW = Math.min(vw * 0.94, 1100);
    var totalH = vh * 0.9;
    var minCapH = 90; // always leave room for at least title + subtitle
    var imgH = Math.min(maxW / r, totalH - minCapH);
    var w = Math.max(imgH * r, Math.min(320, maxW)); // readable card width
    body.style.width = w + "px";
    f.style.height = imgH + "px";
    cap.style.maxHeight = (totalH - imgH) + "px";
    requestAnimationFrame(positionClose);
  }

  function show(i) {
    current = i;
    var item = items[i];
    body.textContent = "";
    body.appendChild(frame(item, cards[i]));
    var cap = el("div", "lightbox-caption");
    cap.appendChild(el("div", "lightbox-species", item.species));
    cap.appendChild(el("div", "lightbox-meta", (item.style || "") + " · " + (item.date || "")));
    treesOf(item).forEach(function (t) {
      cap.appendChild(el("div", "lightbox-tree", t));
    });
    if (item.notes) cap.appendChild(el("div", "lightbox-notes", item.notes));
    body.appendChild(cap);
    fit();
  }

  // Refit only on real viewport changes (rotation, window resize) — mobile
  // browsers fire small innerHeight jitters when their URL bar animates,
  // which must not resize the open lightbox.
  window.addEventListener("resize", function () {
    if (box.hidden) return;
    if (window.innerWidth !== lastVW || Math.abs(window.innerHeight - lastVH) > 150) {
      fit();
    } else {
      requestAnimationFrame(positionClose);
    }
  });

  function open(i) {
    lastFocused = document.activeElement;
    document.documentElement.classList.add("lightbox-open");
    box.hidden = false;
    show(i);
    closeBtn.focus();
  }

  function close() {
    box.hidden = true;
    document.documentElement.classList.remove("lightbox-open");
    current = null;
    if (lastFocused) lastFocused.focus();
  }

  // Arrows move through the filtered set only, so browsing one tree's
  // progression never jumps to another tree.
  function step(delta) {
    if (current === null || !visible.length) return;
    var pos = visible.indexOf(current);
    if (pos === -1) pos = 0;
    show(visible[(pos + delta + visible.length) % visible.length]);
  }

  closeBtn.addEventListener("click", close);
  prevBtn.addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
  nextBtn.addEventListener("click", function (e) { e.stopPropagation(); step(1); });
  box.addEventListener("click", function (e) {
    if (e.target === box || e.target === body) close();
  });

  window.addEventListener("keydown", function (e) {
    if (box.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "Tab") {
      // keep focus inside the dialog (three buttons)
      var focusables = [closeBtn, prevBtn, nextBtn];
      var idx = focusables.indexOf(document.activeElement);
      e.preventDefault();
      var next = e.shiftKey
        ? focusables[(idx - 1 + focusables.length) % focusables.length]
        : focusables[(idx + 1) % focusables.length];
      next.focus();
    }
  });

  cards.forEach(function (card, i) {
    card.setAttribute("aria-haspopup", "dialog");
    card.addEventListener("click", function (e) {
      e.preventDefault();
      open(i);
    });
  });

  /* ---- Per-tree progression filter ---------------------------------- */
  // Entries sharing the same `tree` string in gallery.json are photos of
  // one tree over the years; `tree` may also be an array for photos with
  // several trees in frame (exhibitions, group shots), which then appear
  // under each listed tree. The dropdown shows each unique value; picking
  // one hides every card not featuring that tree and mirrors the choice
  // into the URL hash (#tree=...) so a tree's view is linkable and the
  // back button undoes the filter.

  var select = document.getElementById("tree-filter");
  var trees = [];
  var counts = {};
  items.forEach(function (it) {
    treesOf(it).forEach(function (t) {
      if (trees.indexOf(t) === -1) trees.push(t);
      counts[t] = (counts[t] || 0) + 1;
    });
  });
  // Alphabetical, with "+"-marked (lost) trees grouped at the end.
  trees.sort(function (a, b) {
    var aLost = a.charAt(0) === "+";
    var bLost = b.charAt(0) === "+";
    if (aLost !== bLost) return aLost ? 1 : -1;
    return a.replace(/^\+/, "").localeCompare(b.replace(/^\+/, ""));
  });

  function applyFilter(tree) {
    var active = trees.indexOf(tree) !== -1 ? tree : "";
    visible = [];
    cards.forEach(function (card, i) {
      var shown = !active || treesOf(items[i]).indexOf(active) !== -1;
      card.hidden = !shown;
      if (shown) visible.push(i);
    });
    if (select) select.value = active;
    return active;
  }

  function treeFromHash() {
    var m = location.hash.match(/^#tree=(.+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  if (select && trees.length) {
    var all = el("option", null, "All trees");
    all.value = "";
    select.appendChild(all);
    trees.forEach(function (t) {
      var n = counts[t];
      var o = el("option", null, t + " (" + n + " progression photo" + (n === 1 ? "" : "s") + ")");
      o.value = t;
      select.appendChild(o);
    });

    select.addEventListener("change", function () {
      var active = applyFilter(select.value);
      if (active) {
        location.hash = "tree=" + encodeURIComponent(active);
      } else if (location.hash) {
        // strip the hash without leaving a dangling "#"
        history.pushState("", "", location.pathname + location.search);
      }
    });
    // Covers load-with-hash, back/forward, and hand-edited hashes.
    window.addEventListener("hashchange", function () { applyFilter(treeFromHash()); });
    window.addEventListener("popstate", function () { applyFilter(treeFromHash()); });
    applyFilter(treeFromHash());

    select.parentElement.hidden = false;
  }
})();
