/* Opt-in analytics. Google Analytics is not loaded at all until the visitor
   accepts the consent banner; the choice is remembered per browser
   (localStorage) so the banner only shows until it's answered. Declining —
   or never answering — keeps the page free of Google requests entirely,
   and a "Cookie settings" control in the footer reopens the banner so a
   past choice can be changed. */
(function () {
  "use strict";

  var KEY = "analyticsConsent";
  var banner = document.querySelector(".consent-banner");
  if (!banner) return;

  var measurementId = banner.dataset.measurementId;
  var loaded = false;

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function store(choice) {
    try {
      localStorage.setItem(KEY, choice);
    } catch (e) {
      /* private mode etc. — the choice still applies for this page view */
    }
  }

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      dataLayer.push(arguments);
    }
    window.gtag = gtag;

    // Analytics only — advertising signals stay off regardless of consent.
    gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
    gtag("js", new Date());
    gtag("config", measurementId);

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.appendChild(s);
  }

  // Best-effort removal of GA cookies after a withdrawal. github.io is on
  // the Public Suffix List, so GA's cookies are host-only and deletable here.
  function clearAnalyticsCookies() {
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (name === "_ga" || name.indexOf("_ga_") === 0) {
        document.cookie =
          name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      }
    });
  }

  function choose(choice) {
    store(choice);
    banner.hidden = true;
    if (choice === "granted") {
      loadAnalytics();
    } else {
      clearAnalyticsCookies();
    }
  }

  banner.querySelector(".consent-accept").addEventListener("click", function () {
    choose("granted");
  });
  banner.querySelector(".consent-decline").addEventListener("click", function () {
    choose("denied");
  });

  document.querySelectorAll(".cookie-settings").forEach(function (btn) {
    btn.hidden = false; // JS is running, so the control is functional
    btn.addEventListener("click", function () {
      banner.hidden = false;
    });
  });

  var choice = stored();
  if (choice === "granted") {
    loadAnalytics();
  } else if (choice !== "denied") {
    banner.hidden = false;
  }
})();
