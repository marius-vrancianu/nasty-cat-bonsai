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
    closeMenu(false);
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

  function addOption(value, name, count) {
    var li = el("li", "tree-filter-option");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.setAttribute("data-value", value);
    li.tabIndex = -1;
    li.appendChild(el("span", "tree-filter-name", name));
    if (count) {
      var badge = el("span", "tree-filter-count", String(count));
      badge.setAttribute("aria-hidden", "true");
      li.appendChild(badge);
      // On screen the count is a bare number in the corner, which keeps
      // each row to one line on a phone; the label spells it out again so
      // the row is still announced the way the old <option> was.
      li.setAttribute("aria-label",
        name + " (" + count + " progression photo" + (count === 1 ? "" : "s") + ")");
    }
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

  function applyFilter(tree) {
    activeTree = trees.indexOf(tree) !== -1 ? tree : "";
    visible = [];
    cards.forEach(function (card, i) {
      var shown = !activeTree || treesOf(items[i]).indexOf(activeTree) !== -1;
      card.hidden = !shown;
      if (shown) visible.push(i);
    });
    // Mirror the state onto the filter control (built further down).
    if (filterValue) filterValue.textContent = activeTree || ALL_TREES;
    options.forEach(function (o) {
      o.node.setAttribute("aria-selected", o.value === activeTree ? "true" : "false");
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
