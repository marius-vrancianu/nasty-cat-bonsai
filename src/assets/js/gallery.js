/* Gallery: lightbox, per-tree filter and "Show more". The grid is rendered
   at build time (src/gallery.njk); each card links to its photo's largest
   build-cut copy, so the gallery works and is indexable without JS. This
   script turns clicks into a lightbox with keyboard (desktop) and swipe
   (touch: left/right to step, down to close) navigation.

   URL state lives in the hash: #tree=<tree>&photo=<file>. Opening a photo
   pushes one history entry (Back closes it); stepping replaces it. */
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

  /* ---- Filter vs. batch --------------------------------------------------
     Two separate questions:
       visible  which photos pass the tree filter — the LIGHTBOX walks all of
                these, so stepping never stops at a batch edge;
       shown    how many of those the GRID draws (BATCH at a time).
     Every card is in the HTML; a hidden card's lazy <img> is never fetched, so
     "Show more" reveals rather than loads.

     BATCH = 50 keeps phone scrolling manageable (one column there). Keep it
     large: the CSS masonry re-deals every column when cards are revealed, so
     smaller batches mean more cards jumping around. A single tree rarely
     reaches 50, so the button usually disappears when one is picked. */
  var BATCH = 50;
  var shown = BATCH;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // `trees` is an array (several for group shots); tolerate a bare string.
  function treesOf(item) {
    return Array.isArray(item.trees) ? item.trees : item.trees ? [item.trees] : [];
  }

  /* The lightbox srcset from the card's <img>, the sizes (written once on the
     grid), and a fallback src: the middle rung, so it is never the heaviest. */
  var LB_SIZES = grid.getAttribute("data-lb-sizes") || "";

  function lightboxSource(card) {
    var g = card.querySelector("img");
    var srcset = g && g.getAttribute("data-lb-srcset");
    if (!srcset) return null;
    var urls = srcset.split(",").map(function (c) { return c.trim().split(/\s+/)[0]; });
    return { srcset: srcset, sizes: LB_SIZES, src: urls[Math.floor((urls.length - 1) / 2)] };
  }

  /* The lightbox photo: the build-cut copies listed on the card's <img>
     (data-lb-srcset), ~200KB from this site. Without them (a local build
     that could not read the photo) it falls back to the card's href. */
  function frame(item, card) {
    var f = el("div", "cdn-frame");
    var gridImg = card.querySelector("img");
    var img = el("img");
    var lb = lightboxSource(card);

    /* The card's thumbnail, blurred under the photo until it lands (CSS
       --lqip). currentSrc: the candidate the browser actually downloaded, so no
       new request. Empty if the thumbnail has not loaded (deep link). */
    var thumb = gridImg && (gridImg.currentSrc || gridImg.getAttribute("src"));
    if (thumb) {
      f.style.setProperty("--lqip", 'url("' + thumb.replace(/"/g, "%22") + '")');
    }

    if (lb) {
      // sizes before srcset before src: the browser picks its candidate
      // as soon as it has srcset, and needs sizes in hand to pick well.
      img.sizes = lb.sizes;
      img.srcset = lb.srcset;
      img.src = lb.src;
    } else {
      img.src = card.href;
    }
    img.alt = gridImg ? gridImg.alt : item.species;
    img.decoding = "async";
    // The photo the reader is waiting for goes ahead of grid thumbnails.
    img.setAttribute("fetchpriority", "high");

    // Reveal on arrival, and on failure (the hatched box; no blur over it).
    var reveal = function () { f.classList.add("is-loaded"); };
    img.addEventListener("load", reveal, { once: true });
    img.addEventListener("error", function () {
      f.classList.add("missing");
      f.setAttribute("data-file", item.file);
      reveal();
    }, { once: true });

    f.appendChild(img);
    // A cached photo can be complete before a listener could ever fire.
    if (img.complete && img.naturalWidth > 0) reveal();
    return f;
  }

  /* Preload the neighbours so the next step is instant — only after the
     current photo has loaded, so they never compete with it. */
  function preloadNeighbours(i) {
    var pos = visible.indexOf(i);
    if (pos === -1 || visible.length < 2) return;
    [1, -1].forEach(function (delta) {
      var n = visible[(pos + delta + visible.length) % visible.length];
      if (n === i) return;
      var lb = lightboxSource(cards[n]);
      var pre = new Image();
      if (lb) {
        pre.sizes = lb.sizes;
        pre.srcset = lb.srcset;
        pre.src = lb.src;
      } else {
        pre.src = cards[n].href;
      }
    });
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

  // Width/height of the photo: the manifest's `ratio` ("3/4", "1592/2000")
  // if given, else the size the build wrote on the card's <img>.
  function ratioOf(i) {
    var parts = String(items[i].ratio || "").split("/");
    var r = parseFloat(parts[0]) / parseFloat(parts[1]);
    if (isFinite(r) && r > 0) return r;
    var g = cards[i].querySelector("img");
    r = g ? g.getAttribute("width") / g.getAttribute("height") : NaN;
    return isFinite(r) && r > 0 ? r : 0.75;
  }

  // Side-by-side when there is room: photo at full viewport height minus a
  // margin of 5% of its longest side (also the gap to the caption at its lower
  // right). Otherwise (portrait phones) a stacked card: photo above caption,
  // fitted to the viewport height. The close button sits beside the photo's
  // top-right corner on desktop, just above it on touch devices.
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
    var r = ratioOf(current);
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

    // Stacked: the photo takes its maximum width-limited size; the caption gets
    // the remaining height and scrolls if longer.
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
    // Stepping past the batch draws the grid out to here, so closing on
    // this photo lands on a card that exists.
    revealThrough(i);
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

    /* Neighbours once this photo has arrived — or failed, so stepping ahead is
       still prepared. */
    var shown = body.firstChild.querySelector("img");
    if (shown.complete) {
      preloadNeighbours(i);
    } else {
      var ahead = function () { preloadNeighbours(i); };
      shown.addEventListener("load", ahead, { once: true });
      shown.addEventListener("error", ahead, { once: true });
    }
  }

  // Refit only on real resizes: mobile URL-bar animations jitter innerHeight.
  window.addEventListener("resize", function () {
    if (box.hidden) return;
    if (window.innerWidth !== lastVW || Math.abs(window.innerHeight - lastVH) > 150) {
      fit();
    } else {
      requestAnimationFrame(positionClose);
    }
  });

  function openLightbox(i) {
    closeMenu(false);
    lastFocused = document.activeElement;
    document.documentElement.classList.add("lightbox-open");
    box.hidden = false;
    show(i);
    closeBtn.focus();
  }

  function closeLightbox() {
    var wasOn = current;
    box.hidden = true;
    document.documentElement.classList.remove("lightbox-open");
    current = null;
    openedByPush = false; // any close path invalidates the pending Back

    /* Return focus to the card of the photo just closed (after stepping, that
       is not the one originally clicked; revealThrough() has drawn it). Also
       covers a deep link, where nothing held focus before. */
    var card = wasOn === null ? null : cards[wasOn];
    if (card && !card.hidden) card.focus();
    else if (lastFocused && lastFocused.focus && document.contains(lastFocused)) {
      lastFocused.focus();
    }
  }

  // Close (X, Esc, backdrop tap, swipe down). Opened on this page: Back closes
  // it and drops the hash. Opened from a deep link: no history entry to go
  // back to, so the hash is stripped in place.
  function requestClose() {
    if (openedByPush) {
      openedByPush = false;
      history.back(); // hashchange -> syncFromHash -> closeLightbox
    } else {
      replaceHash(activeTree, "");
      closeLightbox();
    }
  }

  // Arrows move within the filtered set, so one tree's progression never
  // jumps to another tree.
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
  // Swipe left/right steps, swipe down closes; the photo follows the finger.
  // CSS hides the arrows on touch, and .lightbox has touch-action: none.

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
  // Photos sharing a `trees` string are one tree over time; group shots list
  // several trees and appear under each. One dropdown option per unique tree.

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

  /* A button + listbox of our own (markup in gallery.njk), not a <select>: the
     native popup uses the OS accent and opens full-screen on Android. It must
     keep what the <select> gave: keyboard operation (arrows, Home/End, Enter,
     Escape, type-ahead), the photo count read aloud, and picking by writing the
     hash — syncFromHash does the filtering for every route. */

  var ALL_TREES = "All trees";
  var filterRoot = document.querySelector(".tree-filter");
  var filterBtn = document.getElementById("tree-filter-button");
  var filterValue = document.getElementById("tree-filter-value");
  var filterList = document.getElementById("tree-filter-list");
  var options = [];      // [{ value, name, node }]; options[0] is "All trees"
  var activeIdx = -1;    // the option holding focus while the menu is open
  var menuOpen = false;
  var typed = "";        // type-ahead buffer
  var typedAt = 0;

  // A row: the tree, then its photo count as real text (so it is read aloud).
  // Menu rows and the closed button share this, so they always match.
  function fillRow(node, name, count) {
    node.textContent = "";
    node.appendChild(el("span", "tree-filter-name", name));
    if (count) {
      node.appendChild(el("span", "tree-filter-count",
        "(" + count + " progression photo" + (count === 1 ? "" : "s") + ")"));
    }
  }

  function addOption(value, name, count) {
    var li = el("li", "tree-filter-option");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.setAttribute("data-value", value);
    li.tabIndex = -1;
    fillRow(li, name, count);
    filterList.appendChild(li);
    options.push({ value: value, name: name, node: li });
  }

  function indexOfValue(value) {
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === value) return i;
    }
    return -1;
  }

  // Real focus moves to the option (not aria-activedescendant — TalkBack and
  // VoiceOver follow real focus more reliably). The class draws it, since
  // programmatic focus is not reliably :focus-visible.
  function markActive(i) {
    activeIdx = i;
    options.forEach(function (o, k) {
      o.node.classList.toggle("is-active", k === i);
    });
    if (i !== -1) {
      // preventScroll + scrollIntoView("nearest"): focus on its own would
      // centre the option, which yanks the page about on a long list.
      options[i].node.focus({ preventScroll: true });
      options[i].node.scrollIntoView({ block: "nearest" });
    }
  }

  function openMenu() {
    if (menuOpen || !options.length) return;
    menuOpen = true;
    filterList.hidden = false;
    filterBtn.setAttribute("aria-expanded", "true");
    var i = indexOfValue(activeTree);
    markActive(i === -1 ? 0 : i);
  }

  function closeMenu(refocus) {
    if (!menuOpen) return;
    menuOpen = false;
    // Park focus on the button before hiding the option that holds it, or it
    // drops to the top of the page.
    if (refocus || filterList.contains(document.activeElement)) filterBtn.focus();
    filterList.hidden = true;
    filterBtn.setAttribute("aria-expanded", "false");
    markActive(-1);
  }

  // Picking only writes the hash; syncFromHash does the rest, exactly as
  // it does for a card click, a deep link or the Back button.
  function choose(value) {
    closeMenu(true);
    if (value) {
      location.hash = hashString(value, "");
    } else if (location.hash) {
      // strip the hash without leaving a dangling "#"
      history.pushState("", "", location.pathname + location.search);
      syncFromHash();
    }
  }

  // Type-ahead: a second letter within 700ms extends the search; the "+" of
  // lost trees is ignored.
  function typeAhead(ch) {
    var now = Date.now();
    typed = (now - typedAt > 700 ? "" : typed) + ch.toLowerCase();
    typedAt = now;
    var from = typed.length > 1 ? activeIdx : activeIdx + 1;
    for (var n = 0; n < options.length; n++) {
      var k = (from + n + options.length) % options.length;
      if (options[k].name.replace(/^\+/, "").toLowerCase().indexOf(typed) === 0) {
        markActive(k);
        return;
      }
    }
  }

  /* Which cards are drawn, decided in one place: the filter and the batch both
     have a say, so `hidden` is written once here rather than by two owners. */
  function render() {
    var want = [];
    var i;
    for (i = 0; i < cards.length; i++) want[i] = true; // hidden unless shown
    var limit = Math.min(shown, visible.length);
    for (var k = 0; k < limit; k++) want[visible[k]] = false;
    for (i = 0; i < cards.length; i++) {
      // a property read, not a layout read — cheap
      if (cards[i].hidden !== want[i]) cards[i].hidden = want[i];
    }
    updateMore();
  }

  function applyFilter(tree) {
    var next = trees.indexOf(tree) !== -1 ? tree : "";
    // A new tree resets the batch; the same tree must not (this runs on every
    // hash change, including opening a photo).
    if (next !== activeTree) shown = BATCH;
    activeTree = next;

    visible = [];
    cards.forEach(function (card, i) {
      if (!activeTree || treesOf(items[i]).indexOf(activeTree) !== -1) visible.push(i);
    });
    render();

    // Mirror the state onto the filter control (built further down).
    if (filterValue) fillRow(filterValue, activeTree || ALL_TREES, counts[activeTree]);
    options.forEach(function (o) {
      o.node.setAttribute("aria-selected", o.value === activeTree ? "true" : "false");
    });
  }

  /* Draw the grid out to at least this photo: for a deep link past the batch,
     and for the lightbox stepping past it (focus returns to a real card). */
  function revealThrough(index) {
    var pos = visible.indexOf(index);
    if (pos === -1 || pos < shown) return;
    shown = Math.ceil((pos + 1) / BATCH) * BATCH;
    render();
  }

  /* ---- Show more ------------------------------------------------------ */

  var moreWrap = document.querySelector(".gallery-more");
  var moreBtn = moreWrap && moreWrap.querySelector(".gallery-more-button");
  var moreCount = moreWrap && moreWrap.querySelector(".gallery-more-count");

  function updateMore() {
    if (!moreWrap) return;
    var total = visible.length;
    // Nothing to reveal: the whole of this selection already fits.
    if (total <= BATCH) {
      moreWrap.hidden = true;
      return;
    }
    var drawn = Math.min(shown, total);
    moreWrap.hidden = false;
    moreBtn.hidden = drawn >= total;
    moreCount.textContent =
      "Showing " + drawn + " of " + total +
      (activeTree ? " photos of this tree" : " photos");
  }

  if (moreBtn) {
    moreBtn.addEventListener("click", function () {
      var firstNew = visible[shown]; // the card the next batch starts at
      shown += BATCH;
      render();
      /* Focus stays on the button (the count is a live region) — unless the last
         batch hid it, then it goes to the first newly revealed card. */
      if (moreBtn.hidden && firstNew !== undefined && cards[firstNew]) {
        cards[firstNew].focus();
      }
    });
  }

  // The hash is the single source of truth: card clicks, deep links,
  // back/forward, hand-edited URLs.
  function syncFromHash() {
    var h = parseHash();
    applyFilter(h.tree);
    if (h.photo) {
      var idx = -1;
      for (var k = 0; k < items.length; k++) {
        if (items[k].file === h.photo) { idx = k; break; }
      }
      if (idx !== -1) {
        // a deep link past the batch draws the grid out to it first
        revealThrough(idx);
        if (box.hidden) openLightbox(idx);
        else if (current !== idx) show(idx);
        return;
      }
    }
    if (!box.hidden) closeLightbox();
  }

  window.addEventListener("hashchange", syncFromHash);
  window.addEventListener("popstate", syncFromHash);

  if (filterRoot && trees.length) {
    addOption("", ALL_TREES, 0);
    trees.forEach(function (t) { addOption(t, t, counts[t]); });

    filterBtn.addEventListener("click", function () {
      if (menuOpen) closeMenu(true);
      else openMenu();
    });

    // Enter and Space reach the click handler above on their own; the
    // arrows are the ones a button does nothing with.
    filterBtn.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      var wasOpen = menuOpen;
      openMenu();
      if (!wasOpen && e.key === "ArrowUp" && !activeTree) markActive(options.length - 1);
    });

    filterList.addEventListener("click", function (e) {
      var li = e.target.closest(".tree-filter-option");
      if (li) choose(li.getAttribute("data-value"));
    });

    // Focus sits on an option while the menu is open, so these arrive here.
    filterList.addEventListener("keydown", function (e) {
      var last = options.length - 1;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        markActive(activeIdx >= last ? 0 : activeIdx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        markActive(activeIdx <= 0 ? last : activeIdx - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        markActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        markActive(last);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (activeIdx !== -1) choose(options[activeIdx].value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true);
      } else if (e.key === "Tab") {
        // Hand focus back to the button first, so the browser's own Tab
        // continues from the control rather than from the top of the page.
        closeMenu(true);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        typeAhead(e.key);
      }
    });

    // Anywhere else — a tap on the grid, a click on the page — dismisses it.
    document.addEventListener("pointerdown", function (e) {
      if (menuOpen && !filterRoot.contains(e.target)) closeMenu(false);
    });
    filterRoot.addEventListener("focusout", function (e) {
      if (menuOpen && !filterRoot.contains(e.relatedTarget)) closeMenu(false);
    });

    filterRoot.parentElement.hidden = false;
  }

  syncFromHash();
})();
