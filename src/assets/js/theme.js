/* Opt-in dark theme. Light is the default for everyone; choosing dark via
   the sun/moon toggle sets data-theme="dark" on <html> and is remembered
   per browser (localStorage). A tiny inline script in <head> re-applies
   the saved choice before first paint to avoid a light flash. */
(function () {
  "use strict";

  var KEY = "theme";

  function current() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function apply(theme) {
    if (theme === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }

    document.querySelectorAll(".theme-toggle").forEach(function (btn) {
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      btn.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      );
    });

    // Keep the Cusdis comments widget in step, if present.
    var cusdis = document.getElementById("cusdis_thread");
    if (cusdis) {
      cusdis.dataset.theme = theme;
      if (window.CUSDIS && window.CUSDIS.setTheme) window.CUSDIS.setTheme(theme);
    }
  }

  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    btn.hidden = false; // JS is running, so the toggle is functional
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
})();
