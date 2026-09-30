/* CMSUI — shared display helpers. No business rules here (see workflow.js). */
(function () {
  "use strict";
  var GOOD = ["PAID", "COMPLETED", "DISPENSED", "ACTIVE"], WARN = ["PENDING", "WAITING", "REQUESTED", "BILLED", "IN_PROGRESS", "BOOKED", "CALLED"],
    BAD = ["CANCELLED", "NO_SHOW", "INACTIVE"];
  var U = {
    esc: function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
    money: function (v) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(v || 0)); },
    date: function (iso) { if (!iso) return "—"; var d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); },
    dateTime: function (iso) { return iso ? U.date(iso) + ", " + iso.slice(11, 16) : "—"; },
    age: function (dob) { var t = CMSClock.today().split("-"), b = dob.split("-"), a = +t[0] - +b[0]; if (+t[1] < +b[1] || (+t[1] === +b[1] && +t[2] < +b[2])) a--; return a; },
    label: function (s) { return String(s).replace(/_/g, " ").toLowerCase().replace(/^\w/, function (c) { return c.toUpperCase(); }); },
    badge: function (status) {
      var c = GOOD.includes(status) ? "success" : BAD.includes(status) ? "danger" : WARN.includes(status) ? (status === "CALLED" ? "info" : "warning") : status === "URGENT" ? "danger" : "neutral";
      return '<span class="cms-status cms-status--' + c + '">' + U.esc(U.label(status)) + "</span>";
    },
    /* lookups — pass the db you received from CMSStore.read */
    staffName: function (db, staff_id) { var s = db.staff.find(function (x) { return x.staff_id === staff_id; }); return s ? s.first_name + " " + s.last_name : "—"; },
    staffCode: function (db, staff_id) {
      var s=db.staff.find(function(x){return x.staff_id===Number(staff_id);});
      if(!s)return "—";
      var r=db.roles.find(function(x){return x.role_id===s.role_id;}), p={DOCTOR:"doc",RECEPTIONIST:"re",PHARMACIST:"ph",LAB_TECHNICIAN:"lab",ADMIN:"adm"};
      return (p[r&&r.role_name]||"staff")+String(s.staff_id);
    },
    doctorName: function (db, doc_id) { var d = db.doctors.find(function (x) { return x.doc_id === doc_id; }); return d ? "Dr. " + U.staffName(db, d.staff_id) : "—"; },
    patientName: function (db, id) { var p = db.patients.find(function (x) { return x.patient_id === id; }); return p ? p.full_name : "—"; },
    medicineName: function (db, id, dosage_id) {
      var m = db.master_medicines.find(function (x) { return x.medicine_id === id; }), d = dosage_id && db.dosages.find(function (x) { return x.dosage_id === dosage_id; });
      return m ? m.name + (d ? " " + d.dosage_value + d.unit : "") : "—";
    },
    testName: function (db, id) { var t = db.master_lab_tests.find(function (x) { return x.test_id === id; }); return t ? t.test_name : "—"; },
    empty: function (icon, title, text) { return '<div class="cms-empty"><i class="bi bi-' + icon + '"></i><h6>' + U.esc(title) + "</h6><p>" + U.esc(text || "") + "</p></div>"; },
    loading: function () { return '<div class="cms-empty"><div class="spinner-border spinner-border-sm text-primary"></div><p class="mt-2">Loading…</p></div>'; },
    toast: function (msg, type) {
      var box = document.getElementById("cms-toasts"); if (!box) return alert(msg);
      var el = document.createElement("div"); type = type || "success";
      el.className = "toast align-items-center text-bg-" + type + " border-0"; el.setAttribute("role", "status");
      el.innerHTML = '<div class="d-flex"><div class="toast-body">' + U.esc(msg) + '</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>';
      box.appendChild(el); var t = new bootstrap.Toast(el, { delay: 3500 }); el.addEventListener("hidden.bs.toast", function () { el.remove(); }); t.show();
    },
    alert: function (msg, type) {
      var c = document.getElementById("alert-container"); if (!c) return U.toast(msg, type === "danger" ? "danger" : "success");
      c.innerHTML = '<div class="alert alert-' + (type || "info") + ' alert-dismissible fade show" role="alert">' + U.esc(msg) + '<button class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>';
    },
    /* run a workflow action; success → toast, failure → red alert with the rule that blocked it */
    async run(promise, okMsg) {
      try { var r = await promise; if (okMsg) U.toast(okMsg); return r; }
      catch (e) { U.alert(e.message || String(e), "danger"); window.scrollTo({ top: 0, behavior: "smooth" }); return undefined; }
    }
  };
  window.CMSUI = U;
})();
