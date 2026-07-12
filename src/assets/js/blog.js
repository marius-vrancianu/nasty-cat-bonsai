/* Blog index: tag filter + full-text search, both progressive.
   The post list is fully rendered at build time; this script only shows
   and hides cards. Tag chips are plain links to /blog/#tag=... — no click
   handlers, the hashchange event does the work — so a chip on a post page
   navigates here and pre-filters. Search lazily fetches /search.json
   (title, tags, excerpt, full text per post) on the first keystroke and
   requires every typed word to appear somewhere in a post. State lives in
   the hash as #tag=...&q=...: tag clicks push history, typing replaces it. */
(function () {
  "use strict";

  var list = document.querySelector(".post-list");
  var searchWrap = document.querySelector(".blog-search");
  var input = document.getElementById("post-search");
  var indexUrlEl = document.getElementById("search-index-url");
  var status = document.querySelector(".blog-filter-status");
  if (!list || !searchWrap || !input || !indexUrlEl || !status) return;

  var cards = Array.prototype.slice.call(list.querySelectorAll(".post-card"));
  var cardTags = cards.map(function (card) {
    var raw = card.getAttribute("data-tags") || "";
    return raw ? raw.split("||") : [];
  });
  var cardUrls = cards.map(function (card) {
    var a = card.querySelector(".post-card-title");
    return a ? a.getAttribute("href") : "";
  });

  /* ---- Search index (lazy) ------------------------------------------ */

  var haystacks = null; // url -> lowercased searchable text
  var indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(indexUrlEl.href)
        .then(function (r) { return r.json(); })
        .then(function (posts) {
          haystacks = {};
          posts.forEach(function (p) {
            haystacks[p.url] =
              (p.title + " " + p.tags.join(" ") + " " + p.excerpt + " " + p.text).toLowerCase();
          });
        })
        .catch(function () { haystacks = null; });
    }
    return indexPromise;
  }

  function matchesQuery(cardIndex, terms) {
    if (!terms.length) return true;
    if (!haystacks) return true; // index unavailable: don't hide anything
    // built pages prefix urls (/nasty-cat-bonsai/...); the index doesn't
    var hay = null;
    for (var url in haystacks) {
      if (cardUrls[cardIndex].slice(-url.length) === url) { hay = haystacks[url]; break; }
    }
    if (hay === null) return true;
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }

  /* ---- Hash state ---------------------------------------------------- */

  function parseHash() {
    var state = { tag: "", q: "" };
    location.hash.slice(1).split("&").forEach(function (part) {
      var eq = part.indexOf("=");
      if (eq === -1) return;
      var key = part.slice(0, eq);
      var val = decodeURIComponent(part.slice(eq + 1));
      if (key === "tag") state.tag = val;
      if (key === "q") state.q = val;
    });
    return state;
  }

  function hashFor(tag, q) {
    var parts = [];
    if (tag) parts.push("tag=" + encodeURIComponent(tag));
    if (q) parts.push("q=" + encodeURIComponent(q));
    return parts.length ? "#" + parts.join("&") : "";
  }

  /* ---- Applying the filter ------------------------------------------- */

  function apply(state) {
    if (input.value.trim() !== state.q) input.value = state.q;
    var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);

    function run() {
      var shown = 0;
      cards.forEach(function (card, i) {
        var ok =
          (!state.tag || cardTags[i].indexOf(state.tag) !== -1) &&
          matchesQuery(i, terms);
        card.hidden = !ok;
        if (ok) shown++;
      });
      renderStatus(state, shown);
    }

    if (terms.length && !haystacks) {
      loadIndex().then(run);
    } else {
      run();
    }
  }

  function renderStatus(state, shown) {
    if (!state.tag && !state.q) {
      status.hidden = true;
      return;
    }
    status.textContent =
      shown + (shown === 1 ? " post" : " posts") +
      (state.tag ? " tagged “" + state.tag + "”" : "") +
      (state.q ? " matching “" + state.q + "”" : "") + " · ";
    var clear = document.createElement("a");
    clear.href = location.pathname + location.search;
    clear.textContent = "show all";
    clear.addEventListener("click", function (e) {
      e.preventDefault();
      input.value = "";
      history.pushState("", "", location.pathname + location.search);
      apply(parseHash());
    });
    status.appendChild(clear);
    status.hidden = false;
  }

  /* ---- Events -------------------------------------------------------- */

  // Covers tag-chip clicks (plain hash links), back/forward, deep links.
  window.addEventListener("hashchange", function () { apply(parseHash()); });
  window.addEventListener("popstate", function () { apply(parseHash()); });

  input.addEventListener("input", function () {
    var state = parseHash();
    state.q = input.value.trim();
    // typing must not spam the history — replace instead of push
    history.replaceState("", "", location.pathname + location.search + hashFor(state.tag, state.q));
    apply(state);
  });

  searchWrap.hidden = false;
  apply(parseHash());
})();
