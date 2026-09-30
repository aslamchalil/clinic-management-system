/* Demo authentication + role guard (NOT real security). */
(function () {
  var A = {
    async login(username, password) {
      var s = await CMSStore.read(function (db) {
        var u = db.users.find(function (x) { return x.username === username && x.password === password; });
        if (!u) return null;
        var st = db.staff.find(function (x) { return x.user_id === u.user_id; });
        if (!st || !st.is_active) return null;
        var role = db.roles.find(function (r) { return r.role_id === st.role_id; }).role_name;
        var doc = db.doctors.find(function (d) { return d.staff_id === st.staff_id; });
        var prefixes={DOCTOR:"doc",RECEPTIONIST:"re",PHARMACIST:"ph",LAB_TECHNICIAN:"lab",ADMIN:"adm"};
        return { user_id: u.user_id, username: u.username, staff_id: st.staff_id, staff_code:(prefixes[role]||"staff")+st.staff_id, role: role, module: CMSNav.ROLES[role].module,
          doctor_id: doc ? doc.doc_id : null, name: (doc ? "Dr. " : "") + st.first_name + " " + st.last_name };   // UI shows the real name, never the username
      });
      if (!s) throw new Error("Invalid username or password.");
      CMSStore.setSession(s); return s;
    },
    session: function () { return CMSStore.getSession(); },
    home: function (s) { return window.CMS_ROOT + CMSNav.ROLES[s.role].home; },
    logout: function () { CMSStore.clearSession(); location.href = window.CMS_ROOT + "login.html"; },
    /* Page guard: wrong or missing session → redirect. Module "shared" = any signed-in role. */
    guard: function (module) {
      var s = A.session();
      if (!s) { location.replace(window.CMS_ROOT + "login.html"); return null; }
      if (module !== "shared" && s.module !== module) { location.replace(A.home(s) + "?denied=1"); return null; }
      return s;
    },
    can: function (action) { var s = A.session(); return !!s && CMSNav.can(s.role, action); },
    need: function (action) {
      if (!A.can(action)) throw new Error("Your role is not allowed to perform this action.");
    }
  };
  window.CMSAuth = A;
})();
