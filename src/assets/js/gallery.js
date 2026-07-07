/* Gallery: renders the photo grid from the bonsai-images repo manifest
   (gallery.json) and provides a keyboard-navigable lightbox.

   Manifest format — an array of items, gallery images only:
   [
     { "file": "gallery/tree-01.webp",   // path inside bonsai-images repo
       "species": "Japanese Maple",
       "style": "Informal upright",
       "date": "Mar 2024",
       "ratio": "3/4",                   // aspect ratio of the photo
       "alt": "optional alt text",
       "notes": "optional longer caption for the lightbox" }
   ]
*/
(function () {
  "use strict";

  var grid = document.getElementById("gallery");
  if (!grid) return;

  var MANIFEST_URL = grid.dataset.manifest;
  var CDN_BASE = grid.dataset.cdn;

  var items = [];
  var current = null;
  var lastFocused = null;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function frame(item, lazy) {
    var f = el("div", "cdn-frame");
    f.style.aspectRatio = item.ratio || "3/4";
    var img = el("img");
    img.src = CDN_BASE + item.file;
    img.alt = item.alt || (item.species + " bonsai, " + (item.style || "").toLowerCase() + " style");
    if (lazy) img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", function () {
      f.classList.add("missing");
      f.setAttribute("data-file", item.file);
    });
    f.appendChild(img);
    return f;
  }

  function render(list, note) {
    items = list;
    grid.textContent = "";
    if (note) {
      var status = el("p", "gallery-status", note);
      grid.parentElement.insertBefore(status, grid);
    }
    list.forEach(function (item, i) {
      var card = el("button", "gallery-card");
      card.type = "button";
      card.setAttribute("aria-haspopup", "dialog");
      card.appendChild(frame(item, true));
      var cap = el("div", "gallery-card-caption");
      cap.appendChild(el("div", "gallery-card-species", item.species));
      cap.appendChild(el("div", "gallery-card-meta", (item.style || "") + " · " + (item.date || "")));
      card.appendChild(cap);
      card.addEventListener("click", function () { open(i); });
      grid.appendChild(card);
    });
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
    var f = frame(item, false);
    f.style.aspectRatio = ""; // the lightbox sizes explicitly via fit()
    body.appendChild(f);
    var cap = el("div", "lightbox-caption");
    cap.appendChild(el("div", "lightbox-species", item.species));
    cap.appendChild(el("div", "lightbox-meta", (item.style || "") + " · " + (item.date || "")));
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

  function step(delta) {
    if (current === null) return;
    show((current + delta + items.length) % items.length);
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

  /* ---- Load manifest ------------------------------------------------ */

  fetch(MANIFEST_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      var list = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(list) || list.length === 0) throw new Error("empty manifest");
      render(list);
    })
    .catch(function () {
      grid.parentElement.insertBefore(
        el("p", "gallery-status", "The gallery couldn’t load right now — please refresh in a minute. (If you just edited gallery.json, check it for a stray comma.)"),
        grid
      );
    });
})();
