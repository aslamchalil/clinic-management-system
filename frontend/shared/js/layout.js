/* Shared application shell: topbar + role sidebar + page header + footer.
   A page only needs:  <body data-module="doctor" data-page="token-queue" data-title="Token Queue" data-subtitle="…">
                       <main id="cms-content"> …its own content… </main>
   Module code runs inside CMS.ready(function (session) { … }). */
(function () {
  "use strict";
  var queue = (window.CMS && window.CMS._q) || [], fired = false, session = null;
  window.CMS = { ready: function (fn) { fired ? fn(session) : queue.push(fn); } };
  var esc = function (v) { return CMSUI.esc(v); };

  function initials(n) { return n.replace(/^Dr\.\s*/, "").split(" ").map(function (w) { return w[0]; }).slice(0, 2).join(""); }

  function shellHtml(s, b) {
    var role = CMSNav.ROLES[s.role], base = window.CMS_ROOT + role.module + "/";
    var links = role.nav.map(function (n) {
      return '<li class="nav-item"><a class="nav-link' + (n[2] === b.dataset.page ? " active" : "") + '" href="' + base + n[2] + '.html"' + (n[2] === b.dataset.page ? ' aria-current="page"' : "") + '><i class="bi bi-' + n[1] + '"></i>' + esc(n[0]) + "</a></li>";
    }).join("");
    return '<header class="cms-topbar">' +
      '<button class="cms-icon-btn d-lg-none" id="cms-menu-btn" aria-label="Open menu"><i class="bi bi-list"></i></button>' +
      '<a class="cms-brand" href="' + CMSAuth.home(s) + '"><i class="bi bi-heart-pulse"></i><span>CMS Hospital Thiruvananthapuram</span></a>' +
      '<div class="ms-auto d-flex align-items-center gap-2">' +
      '<div class="dropdown"><button class="cms-clock-chip" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-label="Demo clock"><i class="bi bi-clock"></i><span id="cms-clock-label"></span></button>' +
      '<div class="dropdown-menu dropdown-menu-end p-3" style="min-width:290px">' +
      '<div class="fw-bold mb-1">Demo clock</div><p class="small text-secondary mb-2">Shared by every module. Use it to demonstrate sessions, slot expiry and no-shows.</p>' +
      '<div class="row g-2 mb-2"><div class="col-7"><input type="date" id="cms-clock-date" class="form-control form-control-sm"></div><div class="col-5"><input type="time" id="cms-clock-time" class="form-control form-control-sm"></div></div>' +
      '<div class="d-flex flex-wrap gap-1 mb-2"><button class="btn btn-sm btn-primary" id="cms-clock-apply">Apply</button>' +
      '<button class="btn btn-sm btn-outline-primary" data-clock="morning">Morning 10:00</button><button class="btn btn-sm btn-outline-primary" data-clock="evening">Evening 17:00</button>' +
      '<button class="btn btn-sm btn-outline-primary" data-clock="+30">+30 min</button><button class="btn btn-sm btn-outline-primary" data-clock="nextday">Next day</button></div>' +
      '<hr class="my-2"><button class="btn btn-sm btn-outline-danger w-100" id="cms-reset"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset Demo Data</button></div></div>' +
      '<button class="cms-icon-btn" data-cms-theme-toggle aria-label="Toggle light or dark mode"><i class="bi bi-moon-stars"></i></button>' +
      '<div class="dropdown"><button class="cms-user-btn" data-bs-toggle="dropdown"><span class="cms-avatar">' + esc(initials(s.name)) + '</span>' +
      '<span class="text-start d-none d-md-block lh-sm"><span class="d-block fw-bold small">' + esc(s.name) + '</span><span class="small text-secondary">' + esc(role.label) + ' · ' + esc(s.staff_code || ("staff" + s.staff_id)) + '</span></span></button>' +
      '<ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item" id="cms-logout"><i class="bi bi-box-arrow-right me-2"></i>Log out</button></li></ul></div>' +
      "</div></header>" +
      '<aside class="cms-sidebar" id="cms-sidebar"><div class="cms-role">' + esc(role.label) + ' workspace</div><ul class="nav flex-column">' + links + "</ul></aside>" +
      '<div class="cms-backdrop" id="cms-backdrop"></div><div id="cms-toasts" class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index:2000"></div>';
  }

  function paintClock() { document.getElementById("cms-clock-label").textContent = CMSClock.label() + " · " + CMSUI.label(CMSClock.period()); }
  function bind() {
    var b = document.body, $ = function (id) { return document.getElementById(id); };
    $("cms-menu-btn").onclick = function () { b.classList.toggle("cms-menu-open"); };
    $("cms-backdrop").onclick = function () { b.classList.remove("cms-menu-open"); };
    $("cms-logout").onclick = CMSAuth.logout;
    var n = CMSClock.now(); $("cms-clock-date").value = n.date; $("cms-clock-time").value = n.time;
    document.querySelectorAll("[data-clock]").forEach(function (el) {
      el.onclick = function () {
        var k = el.dataset.clock, d = CMSClock.today();
        if (k === "morning") CMSClock.set(d, "10:00"); else if (k === "evening") CMSClock.set(d, "17:00");
        else if (k === "+30") CMSClock.advanceMinutes(30); else if (k === "nextday") { CMSClock.addDays(1); CMSClock.set(CMSClock.today(), "09:30"); }
        location.reload();
      };
    });
    $("cms-clock-apply").onclick = function () { if ($("cms-clock-date").value && $("cms-clock-time").value) { CMSClock.set($("cms-clock-date").value, $("cms-clock-time").value); location.reload(); } };
    $("cms-reset").onclick = function () {
      if (confirm("Reset Demo Data?\n\nThis removes every patient, appointment, bill, token, consultation, prescription, lab and pharmacy record you created, clears the activity history and the demo clock, and signs you out.")) {
        CMSStore.resetAll(); location.href = window.CMS_ROOT + "login.html";
      }
    };
    var searchBtn=$("cms-patient-search-btn"); if(searchBtn){ searchBtn.onclick=function(){ var map={receptionist:"reception-patient-search",doctor:"doctor-patient-search",pharmacy:"pharmacy-patient-search",lab:"lab-patient-search"}; var target=document.getElementById(map[b.dataset.module]); if(target){ target.scrollIntoView({behavior:"smooth",block:"start"}); var input=document.getElementById(map[b.dataset.module]+"-input"); if(input) setTimeout(function(){input.focus();},250); } }; } paintClock(); CMSTheme.paint();
  }

  async function start() {
    var b = document.body;
    if (b.dataset.public || !b.dataset.module) { fired = true; queue.forEach(function (fn) { fn(null); }); return; }   // public pages (login)
    session = CMSAuth.guard(b.dataset.module);            // wrong role → redirected to own dashboard
    if (!session) return;
    var main = document.getElementById("cms-content");
    document.title = (b.dataset.title || "Clinic") + " · Clinic Management System";
    document.body.insertAdjacentHTML("afterbegin", shellHtml(session, b));
    var wrap = document.createElement("div"); wrap.className = "cms-body";
    wrap.innerHTML = '<div class="cms-inner"><div id="alert-container"></div><div class="cms-page-header d-flex align-items-start justify-content-between gap-3"><div><h1 class="cms-page-title">' + esc(b.dataset.title || "") + '</h1>' +
      (b.dataset.subtitle ? '<p class="cms-page-subtitle">' + esc(b.dataset.subtitle) + "</p>" : "") + '</div>' +
      ((b.dataset.page === "dashboard" && ["receptionist","doctor","pharmacy","lab"].indexOf(b.dataset.module) > -1) ? '<button type="button" class="btn btn-outline-primary cms-header-search" id="cms-patient-search-btn"><i class="bi bi-search me-1"></i>Search Patient</button>' : "") + '</div></div>' +
      '<footer class="cms-footer">© 2026 CMS Hospital Thiruvananthapuram · Frontend demo (localStorage)</footer>';
    main.parentNode.insertBefore(wrap, main); wrap.querySelector(".cms-inner").appendChild(main);
    bind();
    try { await CMSWorkflow.processNoShows(); } catch (e) { console.error(e); }
    if (/[?&]denied=1/.test(location.search)) CMSUI.alert("You don't have access to that page. Showing your own dashboard.", "warning");
    b.classList.add("cms-ready"); fired = true;
    queue.forEach(function (fn) { fn(session); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
