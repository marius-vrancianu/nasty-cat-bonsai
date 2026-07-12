/* Lazy comments. The Cusdis widget script is third-party (cusdis.com),
   and most readers never comment — so it isn't loaded with the page.
   Instead it loads when the reader scrolls within ~600px of the Comments
   section, early enough that the thread is usually ready by the time it
   scrolls into view. Browsers without IntersectionObserver just load it
   immediately, like before. */
(function () {
  "use strict";

  var thread = document.getElementById("cusdis_thread");
  if (!thread) return;

  var loaded = false;

  function load() {
    if (loaded) return;
    loaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://cusdis.com/js/cusdis.es.js";
    document.body.appendChild(s);
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
