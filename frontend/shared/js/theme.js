/* Light / dark mode. Any element with [data-cms-theme-toggle] becomes a toggle. */
(function () {
  var KEY = "cms_theme_v1";
  function get() { return document.documentElement.getAttribute("data-bs-theme") || "light"; }
  function set(t) {
    document.documentElement.setAttribute("data-bs-theme", t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    paint();
  }
  function paint() {
    document.querySelectorAll("[data-cms-theme-toggle] i").forEach(function (i) {
      i.className = "bi " + (get() === "dark" ? "bi-sun" : "bi-moon-stars");
    });
  }
  window.CMSTheme = { get: get, set: set, toggle: function () { set(get() === "dark" ? "light" : "dark"); }, paint: paint };
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-cms-theme-toggle]")) CMSTheme.toggle();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint); else paint();
})();
