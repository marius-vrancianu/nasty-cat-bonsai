/* Lazy comments. The Cusdis widget script is third-party (cusdis.com),
   and most readers never comment — so it isn't loaded with the page.
   Instead it loads when the reader scrolls within ~600px of the Comments
   section, early enough that the thread is usually ready by the time it
   scrolls into view. Browsers without IntersectionObserver just load it
   immediately, like before.

   The widget renders into an iframe built with srcdoc — same-origin by
   definition — so once it exists we inject a small stylesheet that gives
   the form fields the site's accent strokes (rust in light, teal in
   dark; Cusdis' own gray borders disappear against the washi paper).
   The widget toggles a .dark wrapper class internally, so the injected
   CSS reacts to theme switches by itself. */
(function () {
  "use strict";

  var thread = document.getElementById("cusdis_thread");
  if (!thread) return;

  var loaded = false;

  // Keep the colors in sync with --rust in main.css (light and dark).
  var SKIN =
    "input, textarea { border-color: #9a2104 !important; border-radius: 3px; }" +
    "button { background: transparent !important; border: 1px solid #9a2104 !important;" +
    " border-radius: 3px; color: #9a2104 !important; }" +
    ".dark input, .dark textarea { border-color: #2d9c7c !important; }" +
    ".dark button { border-color: #2d9c7c !important; color: #2d9c7c !important; }";

  function injectSkin(iframe) {
    try {
      var doc = iframe.contentDocument;
      if (!doc || !doc.head || doc.getElementById("nasty-cat-skin")) return;
      var style = doc.createElement("style");
      style.id = "nasty-cat-skin";
      style.textContent = SKIN;
      doc.head.appendChild(style);
    } catch (e) {
      /* if the iframe is ever not same-origin, leave the widget as-is */
    }
  }

  function watchForIframe() {
    var iframe = thread.querySelector("iframe");
    if (iframe) {
      // re-inject on every load: cusdis reassigns srcdoc when re-rendering
      iframe.addEventListener("load", function () { injectSkin(iframe); });
      injectSkin(iframe);
      return true;
    }
    return false;
  }

  function load() {
    if (loaded) return;
    loaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://cusdis.com/js/cusdis.es.js";
    document.body.appendChild(s);

    if (!watchForIframe() && "MutationObserver" in window) {
      var mo = new MutationObserver(function () {
        if (watchForIframe()) mo.disconnect();
      });
      mo.observe(thread, { childList: true });
    }
  }

  if (!("IntersectionObserver" in window)) {
    load();
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        io.disconnect();
        load();
        return;
      }
    }
  }, { rootMargin: "600px 0px" });

  io.observe(thread);
})();
