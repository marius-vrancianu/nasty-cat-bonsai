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

  /* The stored choice — the same thing the inline script in <head> reads
     before first paint. With no storage to read (private mode, storage
     blocked) the document itself is the only record there is, so it stands. */
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

  /* Back and Forward can restore a page from the browser's back/forward
     cache exactly as it was left — DOM, scripts and all — without running a
     line of this file again. A theme chosen on a later page therefore never
     reached the restored one: switch to dark on any inner page, press Back,
     and the home page came back in daylight, because that document had
     never heard of the choice.

     `pageshow` is the one event that fires on that path, and `persisted`
     is what tells a restore apart from an ordinary load — on an ordinary
     load the inline script in <head> has already done this, before first
     paint, and doing it again here would be for nothing.

     This reads the stored choice rather than deciding anything, so it
     cannot disagree with the toggle: both sides of the switch go through
     apply(), and localStorage stays the one record of what was picked. */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) apply(saved());
  });
})();
