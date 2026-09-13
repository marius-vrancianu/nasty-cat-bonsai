/* Opt-in dark theme. Light is the default for everyone; choosing dark sets
   data-theme="dark" on <html> and is remembered per browser (localStorage).
   A tiny inline script in <head> re-applies the saved choice before first
   paint to avoid a light flash.

   TWO KINDS OF SWITCH ask for the same thing, so neither is named here: any
   element carrying data-theme-toggle is one. On the inner pages it is the
   sun/moon icon in the corner; on the home page it is the celestial body in
   the backdrop itself, which is a drawing first and a control second.

   That difference is why this enables as well as reveals. The icon ships
   `hidden` — without JavaScript there is nothing for it to do, so it is not
   there at all. The orb cannot do that: it is part of the picture and has to
   be drawn either way. It ships `disabled` and aria-hidden instead, which
   keeps it out of the tab order and out of a screen reader's way while it is
   only a drawing. Both are undone below, which is the same statement in two
   grammars: JavaScript is running, so this is a control now. */
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

    buttons.forEach(function (btn) {
      var label =
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      btn.setAttribute("aria-label", label);
      /* The orb carries no icon anyone could recognise as a control — it is a
         sun — so it gets the label as a tooltip too. The icon in the corner
         looks like a button already and is left alone. */
      if (btn.classList.contains("orb")) btn.title = label;
    });

    // Mobile browser chrome tint follows the theme (values mirror --washi).
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = theme === "dark" ? "#222222" : "#e3dbca";
    }

    // Keep the Cusdis comments widget in step, if present.
    var cusdis = document.getElementById("cusdis_thread");
    if (cusdis) {
      cusdis.dataset.theme = theme;
      if (window.CUSDIS && window.CUSDIS.setTheme) window.CUSDIS.setTheme(theme);
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
})();
