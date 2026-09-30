/* Reference page: shows how a module reads shared data and runs a workflow action. */
CMS.ready(async function () {
  var stat = function (icon, label, value, tone) {
    return '<div class="col-6 col-lg-3"><div class="cms-card cms-stat"><div class="cms-stat-icon ' + (tone || "") + '"><i class="bi bi-' + icon + '"></i></div><div><p class="cms-stat-label">' + label + '</p><div class="cms-stat-value">' + value + "</div></div></div></div>";
  };
  var db = await CMSStore.read(function (d) { return d; });               // ALWAYS read through the store
  document.getElementById("ds-stats").innerHTML =
    stat("people", "Patients", db.patients.length) + stat("ticket-perforated", "Tokens today", db.tokens.filter(function (t) { return t.token_date === CMSClock.today(); }).length, "is-success") +
    stat("receipt", "Pending bills", db.registration_bills.filter(function (b) { return b.payment_status === "PENDING"; }).length, "is-warning") + stat("x-octagon", "No-shows", db.appointments.filter(function (a) { return a.status === "NO_SHOW"; }).length, "is-danger");
  document.getElementById("ds-badges").innerHTML = ["PENDING", "WAITING", "CALLED", "PAID", "COMPLETED", "DISPENSED", "IN_PROGRESS", "URGENT", "CANCELLED", "NO_SHOW"].map(CMSUI.badge).join("");
  document.getElementById("ds-empty").innerHTML = CMSUI.empty("inbox", "Nothing waiting", "New prescriptions from doctors will appear here.");
  function rows() {
    var q = document.getElementById("ds-search").value.toLowerCase(), g = document.getElementById("ds-gender").value;
    var list = db.patients.filter(function (p) { return (!q || p.full_name.toLowerCase().indexOf(q) > -1) && (!g || p.gender === g); });
    document.getElementById("ds-rows").innerHTML = list.length ? list.map(function (p) {
      return "<tr><td>#" + p.patient_id + "</td><td class='fw-bold'>" + CMSUI.esc(p.full_name) + "</td><td>" + CMSUI.age(p.dob) + "</td><td>" + CMSUI.esc(p.phone_number) + "</td><td>" + CMSUI.badge(p.is_active ? "ACTIVE" : "INACTIVE") + "</td></tr>";
    }).join("") : "<tr><td colspan='5'>" + CMSUI.empty("search", "No patients match", "Try a different name.") + "</td></tr>";
  }
  document.getElementById("ds-search").oninput = rows; document.getElementById("ds-gender").onchange = rows; rows();
  document.getElementById("ds-ok").onclick = function () { CMSUI.toast("Changes saved"); };
  // CMSUI.run shows the workflow rule that blocked an action as a red alert:
  document.getElementById("ds-err").onclick = function () { CMSUI.run(CMSWorkflow.generateToken({ bill_id: 999, session: "MORNING" })); };
});
