/* Unified login page logic (frontend demo). */
CMS.ready(async function () {
  if (CMSAuth.session()) return location.replace(CMSAuth.home(CMSAuth.session()));
  var form = document.getElementById("loginForm"), u = document.getElementById("username"), p = document.getElementById("password");
  var list = document.getElementById("demoAccounts");
  var rows = await CMSStore.read(function (db) {
    return db.users.map(function (x) {
      var st = db.staff.find(function (s) { return s.user_id === x.user_id; }), role = db.roles.find(function (r) { return r.role_id === st.role_id; }).role_name;
      var isDoc = role === "DOCTOR"; return { role: role, name: (isDoc ? "Dr. " : "") + st.first_name + " " + st.last_name, user: x.username, pass: x.password };
    });
  });
  rows.sort(function (a, b) { return Object.keys(CMSNav.ROLES).indexOf(a.role) - Object.keys(CMSNav.ROLES).indexOf(b.role); });
  list.innerHTML = rows.map(function (r, i) {
    return '<button type="button" class="btn btn-sm btn-outline-primary" data-i="' + i + '"><span class="fw-bold">' + CMSUI.esc(r.name) + '</span><br><small>' + CMSUI.esc(CMSNav.ROLES[r.role].label) + " · " + CMSUI.esc(r.user) + "</small></button>";
  }).join("");
  list.onclick = function (e) { var b = e.target.closest("[data-i]"); if (b) { var r = rows[b.dataset.i]; u.value = r.user; p.value = r.pass; } };
  document.getElementById("togglePassword").onclick = function () {
    var show = p.type === "password"; p.type = show ? "text" : "password";
    document.getElementById("passwordIcon").className = "bi " + (show ? "bi-eye-slash" : "bi-eye");
  };
  form.onsubmit = async function (e) {
    e.preventDefault();
    try { var s = await CMSAuth.login(u.value.trim(), p.value); location.href = CMSAuth.home(s); }
    catch (err) { CMSUI.alert(err.message, "danger"); }
  };
});
