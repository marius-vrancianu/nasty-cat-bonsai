/* Gallery lightbox. The photo grid itself is rendered at build time from
   the bonsai-images manifest (see src/_data/gallery.js); each card is a
   plain link to the full image, so the gallery works — and is indexable —
   without JavaScript. This script upgrades those links into a lightbox
   with keyboard navigation (desktop), swipe navigation (touch: left/right
   to step, down to close — the arrow buttons are hidden by CSS there),
   and a per-tree progression filter.

   URL state lives in the hash: #tree=<tree>&photo=<file>. Opening a
   photo pushes one history entry (Back closes it); stepping through
   photos replaces the entry, so the history never fills up. */
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
  var activeTree = "";
  var openedByPush = false; // whether Back should close the lightbox

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // `trees` in the manifest is always an array — one string for most
  // photos, several for group/exhibition shots. Tolerate a bare string
  // (a likely hand-editing slip) by wrapping it.
  function treesOf(item) {
    return Array.isArray(item.trees) ? item.trees : item.trees ? [item.trees] : [];
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

  /* ---- URL hash state ------------------------------------------------ */

  function parseHash() {
    var state = { tree: "", photo: "" };
    location.hash.slice(1).split("&").forEach(function (part) {
      var eq = part.indexOf("=");
      if (eq === -1) return;
      var key = part.slice(0, eq);
      var val = decodeURIComponent(part.slice(eq + 1));
      if (key === "tree") state.tree = val;
      if (key === "photo") state.photo = val;
    });
    return state;
  }

  function hashString(tree, photo) {
    var parts = [];
    if (tree) parts.push("tree=" + encodeURIComponent(tree));
    if (photo) parts.push("photo=" + encodeURIComponent(photo));
    return parts.length ? "#" + parts.join("&") : "";
  }

  function replaceHash(tree, photo) {
    history.replaceState("", "", location.pathname + location.search + hashString(tree, photo));
  }

  /* ---- Lightbox ------------------------------------------------------ */

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
  //
  // The close button sits beside the photo's top-right corner on desktop
  // and just above it on touch devices (where the photo often spans the
  // full width and there is no room at the side).
  var touchUI = window.matchMedia("(hover: none) and (pointer: coarse)");

  function positionClose() {
    var f = body.firstChild;
    if (!f || box.hidden) return;
    var fr = f.getBoundingClientRect();
    var br = closeBtn.getBoundingClientRect();
    var top;
    var left;
    if (touchUI.matches) {
      top = Math.max(fr.top - br.height, 2);
      left = Math.max(fr.right - br.width, 2);
    } else {
      top = Math.max(fr.top - 4, 2);
      left = fr.right + 6;
    }
    closeBtn.style.top = top + "px";
    closeBtn.style.left = Math.min(left, window.innerWidth - br.width - 2) + "px";
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

    // Keep the URL pointing at the photo on screen — replace, not push,
    // so stepping through a tree doesn't fill the browser history.
    replaceHash(activeTree, item.file);

    // Decode ahead: fetch the neighbours in the current filtered set so
    // the next swipe/arrow shows instantly.
    var pos = visible.indexOf(i);
    if (pos !== -1 && visible.length > 1) {
      [1, -1].forEach(function (d) {
        var n = visible[(pos + d + visible.length) % visible.length];
        if (n !== i) new Image().src = cards[n].href;
      });
    }
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

  function openLightbox(i) {
    lastFocused = document.activeElement;
    document.documentElement.classList.add("lightbox-open");
    box.hidden = false;
    show(i);
    closeBtn.focus();
  }

  function closeLightbox() {
    box.hidden = true;
    document.documentElement.classList.remove("lightbox-open");
    current = null;
    openedByPush = false; // any close path invalidates the pending Back
    if (lastFocused) lastFocused.focus();
  }

  // Close on user intent (X, Esc, backdrop tap, swipe down). If the
  // lightbox was opened on this page, Back both closes it and removes the
  // photo hash; on a direct deep link there is no such entry, so the hash
  // is stripped in place instead.
  function requestClose() {
    if (openedByPush) {
      openedByPush = false;
      history.back(); // hashchange -> syncFromHash -> closeLightbox
    } else {
      replaceHash(activeTree, "");
      closeLightbox();
    }
  }

  // Arrows move through the filtered set only, so browsing one tree's
  // progression never jumps to another tree.
  function step(delta) {
    if (current === null || !visible.length) return;
    var pos = visible.indexOf(current);
    if (pos === -1) pos = 0;
    show(visible[(pos + delta + visible.length) % visible.length]);
  }

  closeBtn.addEventListener("click", requestClose);
  prevBtn.addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
  nextBtn.addEventListener("click", function (e) { e.stopPropagation(); step(1); });
  box.addEventListener("click", function (e) {
    if (e.target === box || e.target === body) requestClose();
  });

  window.addEventListener("keydown", function (e) {
    if (box.hidden) return;
    if (e.key === "Escape") requestClose();
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

  /* ---- Touch gestures ------------------------------------------------ */
  // Swipe left/right steps through the (filtered) photos, swipe down
  // closes; the photo follows the finger for feedback. CSS hides the
  // arrow buttons on coarse-pointer devices, and .lightbox has
  // touch-action: none so the browser leaves these gestures to us.

  var touch = { active: false, x: 0, y: 0, dx: 0, dy: 0 };

  box.addEventListener("touchstart", function (e) {
    if (box.hidden || e.touches.length !== 1) {
      touch.active = false;
      return;
    }
    touch.active = true;
    touch.x = e.touches[0].clientX;
    touch.y = e.touches[0].clientY;
    touch.dx = 0;
    touch.dy = 0;
  }, { passive: true });

  box.addEventListener("touchmove", function (e) {
    if (!touch.active) return;
    touch.dx = e.touches[0].clientX - touch.x;
    touch.dy = e.touches[0].clientY - touch.y;
    if (Math.abs(touch.dx) > Math.abs(touch.dy)) {
      body.style.transform = "translateX(" + touch.dx + "px)";
      box.style.opacity = "";
    } else if (touch.dy > 0) {
      body.style.transform = "translateY(" + touch.dy + "px)";
      box.style.opacity = String(Math.max(1 - touch.dy / 400, 0.4));
    }
  }, { passive: true });

  box.addEventListener("touchend", function () {
    if (!touch.active) return;
    touch.active = false;
    body.style.transform = "";
    box.style.opacity = "";
    if (Math.abs(touch.dx) > 60 && Math.abs(touch.dx) > Math.abs(touch.dy) * 1.5) {
      step(touch.dx < 0 ? 1 : -1);
    } else if (touch.dy > 90 && touch.dy > Math.abs(touch.dx) * 1.5) {
      requestClose();
    }
  });

  /* ---- Cards open via the hash ---------------------------------------- */

  cards.forEach(function (card, i) {
    card.setAttribute("aria-haspopup", "dialog");
    card.addEventListener("click", function (e) {
      e.preventDefault();
      openedByPush = true;
      // pushes one history entry; syncFromHash opens the lightbox
      location.hash = hashString(activeTree, items[i].file);
    });
  });

  /* ---- Per-tree progression filter ------------------------------------ */
  // Entries listing the same string in their `trees` array are photos of
  // one tree over the years; photos with several trees in frame
  // (exhibitions, group shots) list them all and appear under each. The
  // dropdown shows each unique value; picking one hides every card not
  // featuring that tree.

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
    activeTree = trees.indexOf(tree) !== -1 ? tree : "";
    visible = [];
    cards.forEach(function (card, i) {
      var shown = !activeTree || treesOf(items[i]).indexOf(activeTree) !== -1;
      card.hidden = !shown;
      if (shown) visible.push(i);
    });
    if (select) select.value = activeTree;
  }

  // Single source of truth: the hash. Covers card clicks, tag/tree deep
  // links, back/forward, and hand-edited URLs.
  function syncFromHash() {
    var h = parseHash();
    applyFilter(h.tree);
    if (h.photo) {
      var idx = -1;
      for (var k = 0; k < items.length; k++) {
        if (items[k].file === h.photo) { idx = k; break; }
      }
      if (idx !== -1) {
        if (box.hidden) openLightbox(idx);
        else if (current !== idx) show(idx);
        return;
      }
    }
    if (!box.hidden) closeLightbox();
  }

  window.addEventListener("hashchange", syncFromHash);
  window.addEventListener("popstate", syncFromHash);

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
      if (select.value) {
        location.hash = hashString(select.value, "");
      } else if (location.hash) {
        // strip the hash without leaving a dangling "#"
        history.pushState("", "", location.pathname + location.search);
        syncFromHash();
      }
    });

    select.parentElement.hidden = false;
  }

  syncFromHash();
})();
