/* CMSStore — browser-only persistence (localStorage).
   THIS FILE IS THE ONLY PLACE THAT KNOWS DATA LIVES IN localStorage.
   Everything is async so it can later be replaced by Django REST calls
   without rewriting the pages:
     CMSStore.read(fn)  → GET   (fn receives the whole db, read-only)
     CMSStore.tx(fn)    → POST/PATCH (fn receives {db, insert, log}); all-or-nothing:
                          if fn throws, nothing is saved (like transaction.atomic()). */
(function () {
  "use strict";
  var K = { data: "cms_demo_data_v1", act: "cms_demo_activity_v1", sess: "cms_demo_session_v1" };
  var IDS = {
    roles: "role_id", departments: "department_id", specializations: "spec_id", users: "user_id", staff: "staff_id",
    doctors: "doc_id", doctor_sessions: "session_id", patients: "patient_id", appointments: "appointment_id",
    registration_bills: "bill_id", tokens: "token_id", consultations: "consult_id", prescriptions: "prescription_id",
    master_medicines: "medicine_id", dosages: "dosage_id", prescription_items: "prescription_item_id",
    pharmacy_stock: "stock_id", pharmacy_bills: "pharmacy_bill_id", pharmacy_bill_items: "item_bill_id",
    master_lab_tests: "test_id", lab_requests: "lab_request_id", lab_bills: "lab_bill_id",
    lab_bill_items: "lab_bill_item_id", lab_results: "result_id"
  };
  function seed() {
    var s = window.CMS_BUILD_SEED(CMSClock.today());
    localStorage.setItem(K.data, JSON.stringify(s.data));
    localStorage.setItem(K.act, JSON.stringify(s.activity));
  }
  function load() { if (!localStorage.getItem(K.data)) seed(); return JSON.parse(localStorage.getItem(K.data)); }
  function loadAct() { if (!localStorage.getItem(K.act)) seed(); return JSON.parse(localStorage.getItem(K.act)); }
  function nextId(db, col) { var f = IDS[col]; return db[col].reduce(function (m, r) { return Math.max(m, r[f]); }, 0) + 1; }
  function actor() { var s = getSession(); return s ? s.username : "system"; }

  function getSession() { try { return JSON.parse(localStorage.getItem(K.sess)); } catch (e) { return null; } }

  window.CMSStore = {
    IDS: IDS,
    read: async function (fn) { return fn(load()); },
    tx: async function (fn) {
      var db = load(), acts = [];
      var ctx = {
        db: db,
        insert: function (col, rec) { rec[IDS[col]] = nextId(db, col); db[col].push(rec); return rec; },
        log: function (type, patient_id, message) { acts.push({ type: type, patient_id: patient_id || null, message: message || "", actor: actor(), created_at: CMSClock.stamp() }); }
      };
      var result = fn(ctx);                                   // throws → nothing saved
      localStorage.setItem(K.data, JSON.stringify(db));
      if (acts.length) {
        var all = loadAct(), id = all.reduce(function (m, a) { return Math.max(m, a.activity_id); }, 0);
        acts.forEach(function (a) { a.activity_id = ++id; all.push(a); });
        localStorage.setItem(K.act, JSON.stringify(all));
      }
      return result;
    },
    activity: async function (patient_id) {
      var a = loadAct();
      if (patient_id != null) a = a.filter(function (x) { return x.patient_id === Number(patient_id); });
      return a.slice().sort(function (x, y) { return y.activity_id - x.activity_id; });
    },
    getSession: getSession,
    setSession: function (s) { localStorage.setItem(K.sess, JSON.stringify(s)); },
    clearSession: function () { localStorage.removeItem(K.sess); },
    /* "Reset Demo Data": restore seed, wipe every generated record, activity, session and clock. */
    resetAll: function () {
      Object.keys(K).forEach(function (k) { localStorage.removeItem(K[k]); });
      CMSClock.reset();
      seed();
    }
  };
})();
