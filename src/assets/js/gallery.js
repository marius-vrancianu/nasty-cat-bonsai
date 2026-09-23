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

  /* ---- How much of the gallery is on screen ---------------------------
     Two different questions, and conflating them is the way this goes
     wrong:

       visible   which photos pass the tree filter. The LIGHTBOX walks
                 this, all of it, so stepping through a progression never
                 stops at a batch edge.
       shown     how many of those are drawn in the grid. The GRID walks
                 this.

     A card is in the page either way — every one of them is in the HTML,
     and a browser does not fetch a lazy <img> it is not displaying, so a
     card outside the batch costs nothing but a DOM node. This is
     revealing, not loading.

     50 is the batch. The gallery is one column on a phone, which is
     about 27 screens of scroll per batch and roughly six of them for a
     gallery in the hundreds; the alternative was 164 screens in one go.
     A filtered tree is almost never this long, so picking one makes the
     control disappear. */
  var BATCH = 50;
  var shown = BATCH;

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

  /* The photo for the lightbox. The build cuts a copy at the widths this
     actually draws and hangs it off the grid image as data-lb-*; that is
     what opens. It is a few hundred KB against the original's ~700, and —
     the part that is felt more on a cold visit — it comes from this site,
     down the connection the page is already using, rather than opening a
     new one to the CDN.

     The original is still what the card links to, so "open image in new
     tab" and a visitor without JavaScript both still get it. If the build
     could not cut a copy there are no data-lb-* to read and this falls
     back to that same original, which is what it always used. */
  /* The lightbox's copies of one card, as the build left them: the srcset on
     the card's <img>, and the sizes said once for the whole grid. The src a
     browser without srcset would take is picked here — the middle rung, so
     that if it is ever the one fetched it is not the heaviest. */
  var LB_SIZES = grid.getAttribute("data-lb-sizes") || "";

  function lightboxSource(card) {
    var g = card.querySelector("img");
    var srcset = g && g.getAttribute("data-lb-srcset");
    if (!srcset) return null;
    var urls = srcset.split(",").map(function (c) { return c.trim().split(/\s+/)[0]; });
    return { srcset: srcset, sizes: LB_SIZES, src: urls[Math.floor((urls.length - 1) / 2)] };
  }

  function frame(item, card) {
    var f = el("div", "cdn-frame");
    var gridImg = card.querySelector("img");
    var img = el("img");
    var lb = lightboxSource(card);

    /* The card's own thumbnail, stretched and blurred under the photo
       until it lands. currentSrc rather than src: that is the candidate
       the browser actually chose out of the srcset, so it is the file it
       certainly holds — asking for any other would start a download,
       which is the opposite of the point. A card whose thumbnail has not
       loaded gives an empty string and no placeholder, which is where
       this started. */
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
    // This is the one thing the reader is waiting for, so it goes ahead of
    // whatever grid thumbnails are still trickling in behind the overlay.
    img.setAttribute("fetchpriority", "high");

    // Revealed on arrival, and on failure too — the frame then shows the
    // hatched box, and leaving the blur up over it would only muddle it.
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

  /* The neighbours, so the next step is instant. This waits for the photo
     on screen to finish first, which is the whole point of it being a
     function: fired immediately — as it used to be — it put three
     downloads in flight at once and the two nobody had asked for competed
     with the one somebody was waiting for. At ~700KB each that was 2.1MB
     racing itself on the first click of a cold visit. */
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

  // The photo's shape as width/height: the manifest's ratio ("3/4",
  // "1592/2000") when it gives one, otherwise the size the build wrote on
  // the card's <img>, which is the photo's own. `ratio` is optional now.
  function ratioOf(i) {
    var parts = String(items[i].ratio || "").split("/");
    var r = parseFloat(parts[0]) / parseFloat(parts[1]);
    if (isFinite(r) && r > 0) return r;
    var g = cards[i].querySelector("img");
    r = g ? g.getAttribute("width") / g.getAttribute("height") : NaN;
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

    /* Fetch the neighbours only once this photo has arrived, so they are
       never in the way of it. On error too: a photo that cannot load must
       not leave stepping ahead unprepared for good. */
    var shown = body.firstChild.querySelector("img");
    if (shown.complete) {
      preloadNeighbours(i);
    } else {
      var ahead = function () { preloadNeighbours(i); };
      shown.addEventListener("load", ahead, { once: true });
      shown.addEventListener("error", ahead, { once: true });
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

    /* Focus goes back to the photo just closed, not to whatever held it
       when the lightbox opened. After stepping through a progression
       those are different cards, and the one on screen a moment ago is
       the one to return to; revealThrough() has already drawn the grid
       out that far, so it is there to receive it.

       It also covers the case that had no answer before: arriving
       straight on #photo=..., where nothing was ever focused and
       document.activeElement is the body. Focusing the body is focusing
       nothing, which dropped a keyboard reader at the top of the page. */
    var card = wasOn === null ? null : cards[wasOn];
    if (card && !card.hidden) card.focus();
    else if (lastFocused && lastFocused.focus && document.contains(lastFocused)) {
      lastFocused.focus();
    }
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

  /* The control is a button plus a listbox of our own (markup in
     gallery.njk), not a <select>. A <select>'s popup is drawn by the
     browser: its highlight is the OS accent — blue in Chrome, grey in
     Edge — which no stylesheet can reach, and Android opens it as a
     full-screen dialog. This one is markup, so it takes the theme's
     accent and stays a menu under the button everywhere.

     What it owes the control it replaces: keyboard operation (arrows,
     Home/End, Enter, Escape, type-ahead), a screen-reader announcement
     that still reads the photo count out loud, and picking an option by
     writing the hash rather than by filtering directly — syncFromHash
     does the filtering for every route into it. */

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

  // A row is the tree, then its photo count spelled out the way the old
  // <option> spelled it. Both the menu rows and the closed button are
  // built through here, so the two always read the same — and since the
  // count is real text rather than a decoration, it is also what a screen
  // reader announces, with no aria-label standing in for it.
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

  // Focus really moves to the option, rather than being pointed at with
  // aria-activedescendant: TalkBack and VoiceOver follow real focus far
  // more reliably. The class is what the stylesheet draws, since a
  // programmatic focus doesn't reliably count as :focus-visible.
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
    // Focus is on an option about to be hidden, and hiding the element
    // under it drops focus to the top of the page — so park it on the
    // button first, whether or not the caller asked for the button back.
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

  // Jump to the next option starting with what was typed. A second letter
  // inside the timeout extends the search rather than restarting it, and
  // the "+" on a lost tree is ignored — nobody types it looking for one.
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

  /* Who is drawn, decided in one place. Both the filter and the batch
     window have an opinion about a card, so they are answered together
     and `hidden` is written once — two owners of one attribute would
     take turns undoing each other. */
  function render() {
    var want = [];
    var i;
    for (i = 0; i < cards.length; i++) want[i] = true; // hidden unless shown
    var limit = Math.min(shown, visible.length);
    for (var k = 0; k < limit; k++) want[visible[k]] = false;
    for (i = 0; i < cards.length; i++) {
      // Reading .hidden is a property read, not a layout read, so this
      // costs nothing and saves writing to cards that already agree.
      if (cards[i].hidden !== want[i]) cards[i].hidden = want[i];
    }
    updateMore();
  }

  function applyFilter(tree) {
    var next = trees.indexOf(tree) !== -1 ? tree : "";
    // A different tree is a different gallery, so it starts at the top.
    // The same tree is not: this runs on every hash change, and resetting
    // here would throw away a Show more the moment a photo was opened.
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

  /* Draw at least as far as one photo, for the two routes that can land
     past the batch: a link to #photo=<file> deep in the gallery, and the
     lightbox stepping beyond the edge, which must leave a real card
     behind it to hand focus back to on close. Only ever reveals more. */
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
      /* Focus only moves when the button goes away with it. While it is
         still there, staying put is what a reader expects — the count
         beside it is a live region and says what happened. When the last
         batch lands the button hides, and focus would fall to the top of
         the page, so it is handed to the first card just revealed. */
      if (moreBtn.hidden && firstNew !== undefined && cards[firstNew]) {
        cards[firstNew].focus();
      }
    });
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
        // A link straight to a photo past the batch draws the grid out to
        // it first, so there is a card behind the lightbox to close onto.
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
