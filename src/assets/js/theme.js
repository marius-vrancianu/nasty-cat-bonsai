/* Opt-in dark theme. Light is the default; choosing dark sets
   data-theme="dark" on <html> and stores it in localStorage. An inline script
   in base.njk's <head> re-applies it before first paint (no light flash).

   Any element with data-theme-toggle is a switch: the sun/moon icon on inner
   pages, and the orb in the home page's backdrop. Without JS neither can do
   anything, so the icon ships `hidden` and the orb (which must still be drawn)
   ships `disabled` + aria-hidden. Both are undone below. */
(function () {
  "use strict";

  var KEY = "theme";

  function current() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  /* The stored choice (what the <head> script reads). Without storage
     (private mode), the document's current state stands. */
  function saved() {
    try {
      return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch (e) {
      return current();
    }
  }

  function apply(theme) {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }

    buttons.forEach(function (btn) {
      var label =
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      btn.setAttribute("aria-label", label);
      /* The orb does not look like a control, so it also gets a tooltip. */
      if (btn.classList.contains("orb")) btn.title = label;
    });

    // Mobile browser chrome tint follows the theme (values mirror --washi).
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = theme === "dark" ? "#222222" : "#e3dbca";
    }
  }

  var buttons = Array.prototype.slice.call(
    document.querySelectorAll("[data-theme-toggle]")
  );

  buttons.forEach(function (btn) {
    // JS is running, so these are controls rather than pictures of controls.
    btn.hidden = false;
    btn.disabled = false;
    btn.removeAttribute("aria-hidden");
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {
        /* private mode etc. — theme still applies for this page view */
      }
    });
  });

  apply(current());

  /* Back/Forward can restore a page from the bfcache without re-running any
     script, so a theme chosen on a later page would not reach it. `pageshow`
     with `persisted` catches exactly that case (on a normal load the <head>
     script already applied it) and re-applies the stored choice. */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) apply(saved());
  });
})();
