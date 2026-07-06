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

  // Size the image+caption unit so the WHOLE of it spans the viewport
  // height minus a 5% margin top and bottom, with the caption exactly as
  // wide as the photo. Caption height depends on its width and vice
  // versa, so start from the widest allowed width and shrink until it
  // settles — starting wide means the caption can only grow as the width
  // comes down, so the loop converges and can never collapse (unlike
  // measuring at the initial, possibly zero-width, layout).
  function fit() {
    if (current === null) return;
    var f = body.firstChild;
    var cap = body.lastChild;
    var r = ratioOf(items[current]);
    var maxW = Math.min(window.innerWidth * 0.94, 1100);
    var totalH = window.innerHeight * 0.9;
    var minImgH = window.innerHeight * 0.25; // photo never smaller than this
    var w = maxW;
    var imgH;
    for (var pass = 0; pass < 4; pass++) {
      body.style.width = w + "px";
      imgH = Math.max(totalH - cap.offsetHeight, minImgH);
      var next = Math.min(imgH * r, maxW);
      if (Math.abs(next - w) < 1) { w = next; break; }
      w = next;
    }
    // On extreme viewports keep the card at a readable width; the body
    // scrolls internally if the caption doesn't fit.
    w = Math.max(w, Math.min(320, maxW));
    body.style.width = w + "px";
    f.style.height = Math.min(w / r, imgH) + "px";
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

  window.addEventListener("resize", fit);

  function open(i) {
    lastFocused = document.activeElement;
    box.hidden = false;
    show(i);
    closeBtn.focus();
  }

  function close() {
    box.hidden = true;
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
