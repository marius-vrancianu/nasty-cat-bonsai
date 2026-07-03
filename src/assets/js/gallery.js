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

  // Shown if the manifest isn't reachable yet (e.g. the bonsai-images repo
  // doesn't exist or has no gallery.json) so the page still demonstrates
  // the layout with patterned placeholders.
  var SAMPLE_ITEMS = [
    { species: "Japanese Maple", style: "Informal upright", date: "Mar 2024", ratio: "3/4", file: "gallery/tree-01.webp", notes: "Repotted this spring into a slightly shallower pot; canopy still filling back in after a hard prune last fall." },
    { species: "Trident Maple", style: "Broom", date: "Nov 2023", ratio: "4/3", file: "gallery/tree-02.webp", notes: "Grown from a cutting six years ago. Ramification is finally starting to read as a broom from a distance." },
    { species: "Shimpaku Juniper", style: "Slant", date: "Jan 2024", ratio: "3/4", file: "gallery/tree-03.webp", notes: "First wiring pass on the main trunk line. Still deciding on final apex placement." },
    { species: "Trident Maple", style: "Informal upright", date: "Jun 2023", ratio: "1/1", file: "gallery/tree-04.webp", notes: "Summer defoliation to encourage finer ramification going into next season." },
    { species: "Japanese Black Pine", style: "Formal upright", date: "Aug 2023", ratio: "3/5", file: "gallery/tree-05.webp", notes: "Candle-pinched in early summer. Needles should thin out nicely by fall." },
    { species: "Chinese Elm", style: "Broom", date: "Feb 2024", ratio: "4/3", file: "gallery/tree-06.webp", notes: "Nebari is coming along after a root-spread repot two years ago." },
    { species: "Japanese Maple", style: "Cascade", date: "Oct 2023", ratio: "3/5", file: "gallery/tree-07.webp", notes: "The tree that ended up on the floor. Recovering well, all things considered." },
    { species: "Satsuki Azalea", style: "Informal upright", date: "May 2023", ratio: "1/1", file: "gallery/tree-08.webp", notes: "Bloomed for the first time since I acquired it. Colors ran truer than expected." },
    { species: "Trident Maple", style: "Twin trunk", date: "Dec 2023", ratio: "4/3", file: "gallery/tree-09.webp", notes: "Working on balancing canopy weight between the two trunks." }
  ];

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

  function show(i) {
    current = i;
    var item = items[i];
    body.textContent = "";
    body.appendChild(frame(item, false));
    var cap = el("div", "lightbox-caption");
    cap.appendChild(el("div", "lightbox-species", item.species));
    cap.appendChild(el("div", "lightbox-meta", (item.style || "") + " · " + (item.date || "")));
    if (item.notes) cap.appendChild(el("div", "lightbox-notes", item.notes));
    body.appendChild(cap);
  }

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
      render(SAMPLE_ITEMS, "Showing sample layout — the gallery manifest (gallery.json in the bonsai-images repo) isn’t available yet.");
    });
})();
