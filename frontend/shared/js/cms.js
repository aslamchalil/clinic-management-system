/* CMS LOADER — every page includes ONLY this script in <head>.
   It applies the saved theme, then loads CSS + shared JS in the right order.
   Usage:  <script src="../shared/js/cms.js"></script>  (root pages: shared/js/cms.js) */
(function () {
  var src = document.currentScript.getAttribute("src");
  var root = src.replace("shared/js/cms.js", "");
  window.CMS_ROOT = root;
  try {
    var t = localStorage.getItem("cms_theme_v1") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-bs-theme", t);
  } catch (e) {}
  var css = ["assets/vendor/bootstrap/css/bootstrap.min.css",
    "assets/vendor/bootstrap-icons/bootstrap-icons.min.css",
    "shared/css/theme.css", "shared/css/components.css", "shared/css/responsive.css"];
  var js = ["assets/vendor/bootstrap/js/bootstrap.bundle.min.js",
    "shared/js/theme.js", "shared/js/mock-data.js", "shared/js/clock.js",
    "shared/js/store.js", "shared/js/ui.js", "shared/js/navigation.js",
    "shared/js/auth.js", "shared/js/workflow.js", "shared/js/common.js", "shared/js/print.js", "shared/js/patient-search.js", "shared/js/layout.js"];
  document.write('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Montserrat:wght@600;700&family=Lato:wght@400;700&display=swap">');
  css.forEach(function (c) { document.write('<link rel="stylesheet" href="' + root + c + '">'); });
  // Scripts are added in order (async=false keeps execution order). Module code should use CMS.ready(fn):
  // until layout.js loads, calls are queued; layout.js then runs them once the shell is built.
  var queue = [];
  window.CMS = { _q: queue, ready: function (fn) { queue.push(fn); } };
  js.forEach(function (j) {
    var el = document.createElement("script"); el.src = root + j; el.async = false; document.head.appendChild(el);
  });
})();
