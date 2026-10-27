/* CMSWorkflow — ALL business rules live here (limits, payment gates, status changes).
   Modules call these functions; they never edit records directly.
   Every write is all-or-nothing (CMSStore.tx) and checks the signed-in role (CMSAuth.need).
   When the Django API arrives, each function becomes one API call and the rule moves to the backend. */
(function () {
  "use strict";
  var S = CMSStore, C = CMSClock, A = CMSAuth;
  var REG_FEE = 50, SLOT_MIN = 30, MAX_APPT = 10, MAX_TOKENS = 30;
  var FREQ = { "Once daily": 1, "Twice daily": 2, "Three times daily": 3, "Four times daily": 4, "At bedtime": 1 };
  var METHODS = ["CASH", "CARD", "UPI"];

  function fail(m) { throw new Error(m); }
  function find(list, f, id) { return list.find(function (x) { return x[f] === Number(id); }); }
  function label(s) { return CMSUI.label(s); }
  function docSessions(db, doc) { return db.doctor_sessions.filter(function (s) { return s.doctor_id === Number(doc) && s.is_active; }); }
  function currentSession(db, doc) {
    var m = C.minutes(C.time());
    var s = docSessions(db, doc).find(function (x) { return m >= C.minutes(x.start_time) && m < C.minutes(x.end_time); });
    return s ? s.session : null;
  }
  function docName(db, id) { return CMSUI.doctorName(db, id); }
  function days(d) { var m = String(d).match(/\d+/); return m ? +m[0] : 1; }
  function suggestedQty(item) { return (FREQ[item.frequency] || 1) * days(item.duration); }   // frequency × duration
  function patientOfPrescription(db, prescription_id) {
    var p = find(db.prescriptions, "prescription_id", prescription_id), c = p && find(db.consultations, "consult_id", p.consultation_id);
    return c ? c.patient_id : null;
  }
  function needMethod(m) { if (METHODS.indexOf(m) < 0) fail("Choose a payment method: Cash, Card or UPI."); }

  /* Pharmacy: PrescriptionItem has no link to PharmacyBillItem in the finalized models, so a bill line is
     matched to the patient's oldest still-PENDING item for the same medicine (created before the bill). */
  function matchItem(db, bill, bi) {
    return db.prescription_items.filter(function (it) {
      var pr = find(db.prescriptions, "prescription_id", it.prescription_id);
      return it.dispensed_status === "PENDING" && it.medicine_id === bi.medicine_id && pr && pr.created_at <= bill.bill_date &&
        patientOfPrescription(db, it.prescription_id) === bill.patient_id;
    }).sort(function (a, b) { return a.prescription_item_id - b.prescription_item_id; })[0] || null;
  }
  function itemState(db, it) {
    if (it.dispensed_status === "DISPENSED") return "DISPENSED";
    var pr = find(db.prescriptions, "prescription_id", it.prescription_id), pid = patientOfPrescription(db, it.prescription_id), state = "PENDING";
    db.pharmacy_bills.forEach(function (b) {
      if (b.patient_id !== pid || b.payment_status === "CANCELLED" || b.bill_date < pr.created_at) return;
      var has = db.pharmacy_bill_items.some(function (x) { return x.pharmacy_bill_id === b.pharmacy_bill_id && x.medicine_id === it.medicine_id; });
      if (has) state = b.payment_status === "PAID" ? "PAID" : (state === "PAID" ? state : "BILLED");
    });
    return state;   // PENDING → BILLED → PAID (ready to dispense) → DISPENSED
  }

  /* Token gate used by every doctor action: exists, mine, today, current session, unused, has patient. */
  function validateToken(db, token_id, doctor_id) {
    var t = find(db.tokens, "token_id", token_id);
    if (!t) fail("Token not found.");
    if (t.doctor_id !== doctor_id) fail("This token belongs to another doctor.");
    if (t.token_date !== C.today()) fail("This token is not for today.");
    var cs = currentSession(db, doctor_id);
    if (t.session !== cs) fail("This token is for the " + label(t.session) + " session, which is not the current session (" + (cs ? label(cs) : "none running") + ").");
    if (t.status === "COMPLETED" || t.status === "CANCELLED") fail("This token has already been used or cancelled.");
    if (!find(db.patients, "patient_id", t.patient_id)) fail("No patient is linked to this token.");
    return t;
  }
  function myDoctor() { var s = A.session(); if (!s || !s.doctor_id) fail("Only a signed-in doctor can do this."); return s.doctor_id; }
  function myStaff(role) { var s = A.session(); if (!s || s.role !== role) fail("This action needs the " + label(role) + " role."); return s.staff_id; }

  var W = {
    REG_FEE: REG_FEE, SLOT_MIN: SLOT_MIN, MAX_APPT: MAX_APPT, MAX_TOKENS: MAX_TOKENS, FREQUENCIES: Object.keys(FREQ), METHODS: METHODS,
    suggestedQty: suggestedQty, itemState: itemState, slotEnd: function (t) { return C.addMinutes(t, SLOT_MIN); },
    currentSession: function (doc) { return S.read(function (db) { return currentSession(db, doc); }); },
    timeline: function (patient_id) { return S.activity(patient_id); },
    availability: function (doctor_id, date) {
      return S.read(function (db) {
        return {
          appointments: db.appointments.filter(function (a) { return a.doctor_id === +doctor_id && a.appointment_date === date && a.status !== "CANCELLED"; }).length, maxAppointments: MAX_APPT,
          tokens: db.tokens.filter(function (t) { return t.doctor_id === +doctor_id && t.token_date === date && t.status !== "CANCELLED"; }).length, maxTokens: MAX_TOKENS
        };
      });
    },
    /* result outside min/max of its master test? (null when no range) */
    isAbnormal: function (db, result) {
      var rq = find(db.lab_requests, "lab_request_id", result.lab_request_id), t = rq && find(db.master_lab_tests, "test_id", rq.test_id), v = parseFloat(result.result_value);
      if (!t || t.min_value == null || t.max_value == null || isNaN(v)) return null;
      return v < t.min_value || v > t.max_value;
    },
    isBillDispensed: function (db, bill) {
      return db.pharmacy_bill_items.filter(function (x) { return x.pharmacy_bill_id === bill.pharmacy_bill_id; })
        .every(function (bi) { return !matchItem(db, bill, bi); });
    },

    /* ---------------- RECEPTIONIST ---------------- */
    registerPatient: function (f) {
      A.need("patient.register");
      return S.tx(function (c) {
        var name = (f.full_name || "").trim(), phone = (f.phone_number || "").trim();
        if (!name || !f.dob || !f.gender) fail("Name, date of birth and gender are required.");
        if (!/^\d{10}$/.test(phone)) fail("Enter a 10-digit phone number.");
        if (f.dob > C.today()) fail("Date of birth cannot be in the future.");
        if (c.db.patients.some(function (p) { return p.phone_number === phone && p.full_name.toLowerCase() === name.toLowerCase(); })) fail("This patient is already registered.");
        var p = c.insert("patients", { full_name: name, dob: f.dob, gender: f.gender, phone_number: phone, email: f.email || "", address: f.address || "", blood_group: f.blood_group || "", emergency_contact: f.emergency_contact || "", is_active: true, created_at: C.stamp() });
        c.log("Patient Registered", p.patient_id, name + " registered");
        return p;
      });
    },
    bookAppointment: function (f) {
      A.need("appointment.book");
      return S.tx(function (c) {
        var db = c.db, doc = find(db.doctors, "doc_id", f.doctor_id), today = C.today();
        if (!find(db.patients, "patient_id", f.patient_id) || !doc || !doc.is_active) fail("Choose a patient and an active doctor.");
        if (!f.appointment_date || !f.appointment_time_slot) fail("Choose a date and time slot.");
        if (f.appointment_date < today) fail("Appointments cannot be booked in the past.");
        if (f.appointment_date === today && C.minutes(W.slotEnd(f.appointment_time_slot)) <= C.minutes(C.time())) fail("That slot has already ended.");
        var live = db.appointments.filter(function (a) { return a.doctor_id === doc.doc_id && a.appointment_date === f.appointment_date && a.status !== "CANCELLED"; });
        if (live.length >= MAX_APPT) fail("This doctor already has " + MAX_APPT + " appointments on that day.");
        if (live.some(function (a) { return a.patient_id === +f.patient_id && a.status === "BOOKED"; })) fail("This patient already has a booked appointment with this doctor that day.");
        var adv = Number(f.advance_amount || 0);
        var a = c.insert("appointments", { patient_id: +f.patient_id, doctor_id: doc.doc_id, appointment_date: f.appointment_date, appointment_time_slot: f.appointment_time_slot, status: "BOOKED", advance_amount: adv, advance_payment_status: adv > 0 ? (f.advance_paid ? "PAID" : "PENDING") : "PENDING", created_at: C.stamp() });
        c.log("Appointment Booked", a.patient_id, "Appointment with " + docName(db, doc.doc_id) + " at " + a.appointment_time_slot + " on " + a.appointment_date);
        return a;   // NOTE: no token is created here
      });
    },
    cancelAppointment: function (id) {
      A.need("appointment.cancel");
      return S.tx(function (c) {
        var a = find(c.db.appointments, "appointment_id", id);
        if (!a || a.status !== "BOOKED") fail("Only booked appointments can be cancelled.");
        if (c.db.tokens.some(function (t) { return t.appointment_id === a.appointment_id && t.status !== "CANCELLED"; })) fail("A token was already issued for this appointment.");
        a.status = "CANCELLED"; if(a.advance_payment_status === "PAID") a.advance_payment_status = "REFUNDED"; c.log("Appointment Cancelled", a.patient_id, "Appointment #" + a.appointment_id + (a.advance_payment_status === "REFUNDED" ? " · advance refunded" : "") ); return a;
      });
    },
    /* System rule (runs on every page load, no role needed): slot ended without a token → NO_SHOW.
       No token is consumed. No refund handling in this frontend phase. */
    processNoShows: async function () {
      var due = await S.read(function (db) { return db.appointments.filter(function (a) { return noShow(db, a); }).map(function (a) { return a.appointment_id; }); });
      if (!due.length) return 0;
      return S.tx(function (c) {
        c.db.appointments.forEach(function (a) { if (noShow(c.db, a)) { a.status = "NO_SHOW"; if(a.advance_payment_status === "PAID") a.advance_payment_status = "REFUNDED"; c.log("Appointment No-show", a.patient_id, "Slot " + a.appointment_time_slot + " ended without arrival" + (a.advance_payment_status === "REFUNDED" ? " · advance refunded" : "")); } });
        return due.length;
      });
      function noShow(db, a) {
        if (a.status !== "BOOKED") return false;
        if (db.tokens.some(function (t) { return t.appointment_id === a.appointment_id && t.status !== "CANCELLED"; })) return false;
        return a.appointment_date < C.today() || (a.appointment_date === C.today() && C.minutes(W.slotEnd(a.appointment_time_slot)) <= C.minutes(C.time()));
      }
    },
    createRegistrationBill: function (f) {
      A.need("bill.create");
      return S.tx(function (c) {
        var db = c.db, doc = find(db.doctors, "doc_id", f.doctor_id);
        if (!find(db.patients, "patient_id", f.patient_id) || !doc || !doc.is_active) fail("Choose a patient and an active doctor.");
        var open = db.registration_bills.find(function (b) {
          return b.patient_id === +f.patient_id && b.doctor_id === doc.doc_id && b.bill_date.slice(0, 10) === C.today() && (b.payment_status === "PENDING" ||
            (b.payment_status === "PAID" && !db.tokens.some(function (t) { return t.bill_id === b.bill_id; })));
        });
        if (open) fail("Bill #" + open.bill_id + " for this patient and doctor is still open. " + (open.payment_status === "PAID" ? "It is paid — generate the token." : "Collect payment first."));
        var b = c.insert("registration_bills", { patient_id: +f.patient_id, doctor_id: doc.doc_id, registration_fee: REG_FEE, consultation_fee: doc.consultation_fee, total_amount: REG_FEE + doc.consultation_fee, payment_status: "PENDING", payment_method: null, bill_date: C.stamp() });
        c.log("Registration Bill Created", b.patient_id, "Bill #" + b.bill_id + " · ₹" + b.total_amount);
        return b;
      });
    },
    payRegistrationBill: function (bill_id, method) {
      A.need("bill.pay"); needMethod(method);
      return S.tx(function (c) {
        var b = find(c.db.registration_bills, "bill_id", bill_id);
        if (!b || b.payment_status !== "PENDING") fail("Only pending bills can be paid.");
        b.payment_status = "PAID"; b.payment_method = method; c.log("Payment Completed", b.patient_id, "Bill #" + b.bill_id + " paid by " + method); return b;
      });
    },
    /* Token only after PAID. Numbers are sequential per doctor + day + session, in the order tokens are issued after payment. */
    generateToken: function (f) {
      A.need("token.generate");
      return S.tx(function (c) {
        var db = c.db, b = find(db.registration_bills, "bill_id", f.bill_id), today = C.today();
        if (!b) fail("Bill not found.");
        if (b.payment_status !== "PAID") fail("Payment is not confirmed. A token can only be generated after the bill is PAID.");
        if (db.tokens.some(function (t) { return t.bill_id === b.bill_id; })) fail("A token was already generated for this bill.");
        var ses = docSessions(db, b.doctor_id).find(function (s) { return s.session === f.session; });
        if (!ses) fail("This doctor has no " + label(f.session || "") + " session.");
        if (C.minutes(C.time()) >= C.minutes(ses.end_time)) fail("The " + label(ses.session) + " session ended at " + ses.end_time + ".");
        var todays = db.tokens.filter(function (t) { return t.doctor_id === b.doctor_id && t.token_date === today && t.status !== "CANCELLED"; });
        if (todays.length >= MAX_TOKENS) fail("Token limit reached: " + MAX_TOKENS + " tokens per doctor per day.");
        if (todays.some(function (t) { return t.patient_id === b.patient_id && t.session === ses.session && (t.status === "WAITING" || t.status === "CALLED"); })) fail("This patient already has an active token for this doctor and session today.");
        var apt = null;
        if (f.appointment_id) {
          apt = find(db.appointments, "appointment_id", f.appointment_id);
          if (!apt || apt.status !== "BOOKED" || apt.patient_id !== b.patient_id || apt.doctor_id !== b.doctor_id || apt.appointment_date !== today) fail("That appointment is not a valid booked appointment for this patient, doctor and day.");
        }
        var num = db.tokens.filter(function (t) { return t.doctor_id === b.doctor_id && t.token_date === today && t.session === ses.session; }).reduce(function (m, t) { return Math.max(m, t.token_number); }, 0) + 1;
        var t = c.insert("tokens", { patient_id: b.patient_id, doctor_id: b.doctor_id, bill_id: b.bill_id, appointment_id: apt ? apt.appointment_id : null, token_number: num, token_date: today, session: ses.session, status: "WAITING", created_at: C.stamp() });
        c.log("Token Generated", t.patient_id, "Token " + num + " · " + label(ses.session) + " · " + docName(db, t.doctor_id) + (apt ? "" : " (walk-in)"));
        return t;
      });
    },

    /* ---------------- DOCTOR ---------------- */
    callToken: function (token_id) {
      A.need("token.call"); var doc = myDoctor();
      return S.tx(function (c) {
        var t = validateToken(c.db, token_id, doc);
        if (t.status === "WAITING") {
          if (c.db.tokens.some(function (x) { return x.doctor_id === doc && x.token_date === C.today() && x.status === "CALLED"; })) fail("Finish the patient already called before calling another.");
          t.status = "CALLED"; c.log("Token Called", t.patient_id, "Token " + t.token_number + " called");
        }
        return t;
      });
    },
    /* The ONLY way a doctor reaches a patient file: a valid token. */
    openToken: function (token_id) {
      var doc = myDoctor();
      return S.read(function (db) {
        var t = validateToken(db, token_id, doc), pid = t.patient_id;
        var cons = db.consultations.filter(function (x) { return x.patient_id === pid; });
        var cids = cons.map(function (x) { return x.consult_id; });
        return { token: t, patient: find(db.patients, "patient_id", pid), appointment: t.appointment_id ? find(db.appointments, "appointment_id", t.appointment_id) : null, consultations: cons,
          lab_requests: db.lab_requests.filter(function (r) { return cids.indexOf(r.consultation_id) > -1; }), lab_results: db.lab_results };
      });
    },
    /* One atomic save: Consultation + Prescription + PrescriptionItems + LabRequests. Read-only afterwards (no edit/delete API exists). */
    saveConsultation: function (f) {
      A.need("consultation.save"); var doc = myDoctor();
      return S.tx(function (c) {
        var db = c.db, t = validateToken(db, f.token_id, doc), items = f.items || [], labs = f.labs || [];
        if (t.status !== "CALLED") fail("Call the patient first (token must be CALLED).");
        if (db.consultations.some(function (x) { return x.token_id === t.token_id; })) fail("This token already has a consultation.");
        if (!(f.symptoms || "").trim() || !(f.diagnosis || "").trim()) fail("Symptoms and diagnosis are required.");
        var seenM = {}, seenT = {};
        items.forEach(function (i) {
          var m = find(db.master_medicines, "medicine_id", i.medicine_id), d = find(db.dosages, "dosage_id", i.dosage_id);
          if (!m || !m.is_active) fail("Select a valid medicine.");
          if (!d || d.medicine_id !== m.medicine_id) fail("The dosage does not belong to " + m.name + ".");
          if (!FREQ[i.frequency]) fail("Choose a frequency for " + m.name + ".");
          if (!(days(i.duration) > 0) || !/\d/.test(String(i.duration))) fail("Enter a duration (e.g. 5 days) for " + m.name + ".");
          if (seenM[m.medicine_id]) fail(m.name + " is listed twice."); seenM[m.medicine_id] = 1;
        });
        labs.forEach(function (l) {
          var ts = find(db.master_lab_tests, "test_id", l.test_id);
          if (!ts || !ts.is_active) fail("Select a valid lab test.");
          if (seenT[ts.test_id]) fail(ts.test_name + " is requested twice."); seenT[ts.test_id] = 1;
        });
        var con = c.insert("consultations", { token_id: t.token_id, patient_id: t.patient_id, doctor_id: doc, symptoms: f.symptoms.trim(), diagnosis: f.diagnosis.trim(), remarks: f.remarks || "", created_at: C.stamp() });
        c.log("Consultation Completed", t.patient_id, "Consultation #" + con.consult_id + " · " + docName(db, doc));
        var pr = null;
        if (items.length) {
          pr = c.insert("prescriptions", { consultation_id: con.consult_id, created_at: C.stamp() });
          items.forEach(function (i) { c.insert("prescription_items", { prescription_id: pr.prescription_id, medicine_id: +i.medicine_id, dosage_id: +i.dosage_id, frequency: i.frequency, duration: String(i.duration), instructions: i.instructions || "", dispensed_status: "PENDING", is_active: true }); });
          c.log("Prescription Created", t.patient_id, items.length + " medicine(s) prescribed");
        }
        labs.forEach(function (l) {
          c.insert("lab_requests", { consultation_id: con.consult_id, test_id: +l.test_id, order_date: C.today(), priority: l.priority === "URGENT" ? "URGENT" : "NORMAL", status: "REQUESTED", is_active: true });
          c.log("Lab Test Requested", t.patient_id, CMSUI.testName(db, +l.test_id) + (l.priority === "URGENT" ? " (urgent)" : ""));
        });
        t.status = "COMPLETED";
        if (t.appointment_id) find(db.appointments, "appointment_id", t.appointment_id).status = "COMPLETED";
        return { consultation: con, prescription: pr };
      });
    },

    /* ---------------- PHARMACY ---------------- */
    createPharmacyBill: function (f) {
      A.need("pharmacy.bill"); var staff = myStaff("PHARMACIST");
      return S.tx(function (c) {
        var db = c.db, pid = patientOfPrescription(db, f.prescription_id), lines = f.lines || [];
        if (pid == null) fail("Prescription not found.");
        if (!lines.length) fail("Select at least one medicine to bill.");
        var total = 0, rows = lines.map(function (l) {
          var it = find(db.prescription_items, "prescription_item_id", l.prescription_item_id);
          if (!it || it.prescription_id !== +f.prescription_id) fail("Item does not belong to this prescription.");
          if (itemState(db, it) !== "PENDING") fail(CMSUI.medicineName(db, it.medicine_id) + " is already billed or dispensed.");
          var q = Number(l.quantity), st = db.pharmacy_stock.find(function (s) { return s.medicine_id === it.medicine_id; });
          if (!Number.isInteger(q) || q < 1) fail("Enter a whole-number quantity for " + CMSUI.medicineName(db, it.medicine_id) + ".");
          if (!st || st.quantity < q) fail("Insufficient stock for " + CMSUI.medicineName(db, it.medicine_id) + " (available " + (st ? st.quantity : 0) + ").");
          var line = q * st.selling_price; total += line;
          return { medicine_id: it.medicine_id, quantity_dispensed: q, unit_selling_price: st.selling_price, line_amount: line };
        });
        var b = c.insert("pharmacy_bills", { patient_id: pid, pharmacist_id: staff, bill_date: C.stamp(), total_amount: total, payment_status: "PENDING", payment_method: null });
        rows.forEach(function (r) { r.pharmacy_bill_id = b.pharmacy_bill_id; c.insert("pharmacy_bill_items", r); });
        c.log("Pharmacy Bill Created", pid, "Pharmacy bill #" + b.pharmacy_bill_id + " · ₹" + total);
        return b;
      });
    },
    payPharmacyBill: function (id, method) {
      A.need("pharmacy.pay"); needMethod(method);
      return S.tx(function (c) {
        var b = find(c.db.pharmacy_bills, "pharmacy_bill_id", id);
        if (!b || b.payment_status !== "PENDING") fail("Only pending pharmacy bills can be paid.");
        b.payment_status = "PAID"; b.payment_method = method; c.log("Pharmacy Bill Paid", b.patient_id, "Pharmacy bill #" + id + " paid by " + method); return b;
      });
    },
    /* Payment → dispense → stock deduction → item DISPENSED. Blocked unless PAID. */
    dispense: function (pharmacy_bill_id) {
      A.need("pharmacy.dispense");
      return S.tx(function (c) {
        var db = c.db, b = find(db.pharmacy_bills, "pharmacy_bill_id", pharmacy_bill_id);
        if (!b) fail("Pharmacy bill not found.");
        if (b.payment_status !== "PAID") fail("Payment is not confirmed. Medicine can only be dispensed after the bill is PAID.");
        var lines = db.pharmacy_bill_items.filter(function (x) { return x.pharmacy_bill_id === b.pharmacy_bill_id; });
        var todo = lines.map(function (bi) { return { bi: bi, it: matchItem(db, b, bi) }; }).filter(function (x) { return x.it; });
        if (!todo.length) fail("This bill has already been dispensed.");
        todo.forEach(function (x) {
          var st = db.pharmacy_stock.find(function (s) { return s.medicine_id === x.bi.medicine_id; });
          if (!st || st.quantity < x.bi.quantity_dispensed) fail("Insufficient stock for " + CMSUI.medicineName(db, x.bi.medicine_id) + " (available " + (st ? st.quantity : 0) + ").");
        });
        todo.forEach(function (x) {
          db.pharmacy_stock.find(function (s) { return s.medicine_id === x.bi.medicine_id; }).quantity -= x.bi.quantity_dispensed;
          x.it.dispensed_status = "DISPENSED";
        });
        c.log("Medicine Dispensed", b.patient_id, todo.length + " item(s) dispensed on bill #" + b.pharmacy_bill_id);
        return todo.length;
      });
    },
    updateStock: function (f) {
      A.need("stock.update");
      return S.tx(function (c) {
        var st = c.db.pharmacy_stock.find(function (s) { return s.medicine_id === +f.medicine_id; });
        if (!st) fail("No stock record for this medicine.");
        var add = Number(f.add_quantity || 0); if (!Number.isInteger(add) || add < 0) fail("Enter a whole-number quantity to add.");
        st.quantity += add; if (f.selling_price != null && f.selling_price !== "") st.selling_price = Number(f.selling_price);
        return st;
      });
    },

    /* ---------------- LAB ---------------- */
    createLabBill: function (f) {
      A.need("lab.bill");
      return S.tx(function (c) {
        var db = c.db, ids = f.lab_request_ids || [];
        if (!ids.length) fail("Select at least one lab request.");
        var pid = null, total = 0, reqs = ids.map(function (id) {
          var r = find(db.lab_requests, "lab_request_id", id);
          if (!r || !r.is_active || r.status !== "REQUESTED") fail("Lab request #" + id + " is not waiting to be billed.");
          var p = find(db.consultations, "consult_id", r.consultation_id).patient_id;
          if (pid != null && p !== pid) fail("One lab bill can only contain one patient's requests.");
          pid = p; total += find(db.master_lab_tests, "test_id", r.test_id).test_price; return r;
        });
        var b = c.insert("lab_bills", { patient_id: pid, bill_date: C.stamp(), total_amount: total, payment_status: "PENDING", payment_method: null });
        reqs.forEach(function (r) {
          var price = find(db.master_lab_tests, "test_id", r.test_id).test_price;
          c.insert("lab_bill_items", { lab_bill_id: b.lab_bill_id, lab_request_id: r.lab_request_id, quantity: 1, unit_price: price, line_amount: price });
          r.status = "BILLED";
        });
        c.log("Lab Bill Created", pid, "Lab bill #" + b.lab_bill_id + " · ₹" + total); return b;
      });
    },
    payLabBill: function (id, method) {
      A.need("lab.pay"); needMethod(method);
      return S.tx(function (c) {
        var db = c.db, b = find(db.lab_bills, "lab_bill_id", id);
        if (!b || b.payment_status !== "PENDING") fail("Only pending lab bills can be paid.");
        b.payment_status = "PAID"; b.payment_method = method;
        db.lab_bill_items.filter(function (x) { return x.lab_bill_id === id; }).forEach(function (x) { find(db.lab_requests, "lab_request_id", x.lab_request_id).status = "PAID"; });
        c.log("Lab Bill Paid", b.patient_id, "Lab bill #" + id + " paid by " + method); return b;
      });
    },
    startProcessing: function (lab_request_id) {
      A.need("lab.process");
      return S.tx(function (c) { var r = paidRequest(c.db, lab_request_id); r.status = "IN_PROGRESS"; c.log("Lab Processing Started", patientOfRequest(c.db, r), CMSUI.testName(c.db, r.test_id) + " in progress"); return r; });
    },
    saveResult: function (f) {
      A.need("lab.result"); var tech = myStaff("LAB_TECHNICIAN");
      return S.tx(function (c) {
        var db = c.db, r = find(db.lab_requests, "lab_request_id", f.lab_request_id);
        if (!r) fail("Lab request not found.");
        if (r.status !== "IN_PROGRESS") fail("Start processing before entering a result (status is " + label(r.status) + ").");
        var bill = billFor(db, r.lab_request_id);
        if (!bill || bill.payment_status !== "PAID") fail("The lab bill for this test is not PAID.");
        if (!String(f.result_value || "").trim()) fail("Enter the result value.");
        var t = find(db.master_lab_tests, "test_id", r.test_id);
        var range = f.reference_range || (t.min_value != null ? t.min_value + " – " + t.max_value : "");
        var res = c.insert("lab_results", { lab_request_id: r.lab_request_id, technician_id: tech, bill_id: bill.lab_bill_id, result_value: String(f.result_value).trim(), unit: f.unit || "", reference_range: range, result_date: C.stamp(), report: f.report || "" });
        r.status = "COMPLETED"; c.log("Lab Result Added", patientOfRequest(db, r), t.test_name + " result recorded"); return res;
      });
    },

    /* ---------------- ADMIN ---------------- */
    adminSave: function (col, rec) {
      A.need("admin.manage");
      var UNIQUE = { roles: "role_name", departments: "department_name", specializations: "spec_name" };
      return S.tx(function (c) {
        var idf = S.IDS[col], u = UNIQUE[col];
        if (!idf || ["users", "patients", "tokens", "consultations"].indexOf(col) > -1) fail("This collection cannot be edited from the admin module.");
        if (u && c.db[col].some(function (x) { return x[u].toLowerCase() === String(rec[u]).trim().toLowerCase() && x[idf] !== rec[idf]; })) fail("That name already exists.");
        if (rec[idf]) { var cur = find(c.db[col], idf, rec[idf]); if (!cur) fail("Record not found."); Object.assign(cur, rec); return cur; }
        delete rec[idf]; if (rec.is_active == null) rec.is_active = true; return c.insert(col, rec);
      });
    },
    adminCreateDoctor: function (f) {
      A.need("admin.manage");
      return S.tx(function (c) {
        var db = c.db;
        if (!f.username || !f.password) fail("Username and password are required.");
        if (db.users.some(function (u) { return u.username === f.username; })) fail("That username is already taken.");
        if (!f.first_name || !f.last_name || !f.department_id || !f.specialization_id) fail("Name, department and specialization are required.");
        if (db.doctors.some(function (d) { return d.license_no === f.license_no; })) fail("That licence number is already registered.");
        var role = db.roles.find(function (r) { return r.role_name === "DOCTOR"; });
        var u = c.insert("users", { username: f.username, password: f.password });
        var st = c.insert("staff", { user_id: u.user_id, role_id: role.role_id, department_id: +f.department_id, first_name: f.first_name, last_name: f.last_name, dob: f.dob || "", gender: f.gender || "", phone_number: f.phone_number || "", email: f.email || "", is_active: true });
        var d = c.insert("doctors", { staff_id: st.staff_id, specialization_id: +f.specialization_id, consultation_fee: Number(f.consultation_fee || 0), qualification: f.qualification || "", exp_year: Number(f.exp_year || 0), license_no: f.license_no || "", is_active: true });
        var seenSession={}; (f.sessions || []).forEach(function (s) {
          if(["MORNING","EVENING"].indexOf(s.session)<0 || seenSession[s.session]) fail("Each doctor can have only one "+label(s.session)+" session.");
          if(!s.start_time || !s.end_time || C.minutes(s.start_time)>=C.minutes(s.end_time)) fail("Session start time must be before end time.");
          seenSession[s.session]=1; c.insert("doctor_sessions", { doctor_id: d.doc_id, session: s.session, start_time: s.start_time, end_time: s.end_time, is_active: true });
        });
        if(!(f.sessions||[]).length) fail("Create at least one doctor session.");
        return d;
      });
    }
  };

  function billFor(db, lab_request_id) {
    var bi = db.lab_bill_items.find(function (x) { return x.lab_request_id === lab_request_id; });
    return bi ? find(db.lab_bills, "lab_bill_id", bi.lab_bill_id) : null;
  }
  function patientOfRequest(db, r) { return find(db.consultations, "consult_id", r.consultation_id).patient_id; }
  function paidRequest(db, id) {
    var r = find(db.lab_requests, "lab_request_id", id);
    if (!r) fail("Lab request not found.");
    var b = billFor(db, id);
    if (!b || b.payment_status !== "PAID") fail("This test cannot be processed until its lab bill is PAID.");
    if (r.status !== "PAID") fail("Only paid requests can be started (status is " + label(r.status) + ").");
    return r;
  }
  /* Every action returns a Promise (sync throws become rejections) — same shape as future API calls. */
  var SYNC = ["suggestedQty", "itemState", "slotEnd", "isAbnormal", "isBillDispensed"];
  Object.keys(W).forEach(function (k) {
    if (typeof W[k] !== "function" || SYNC.indexOf(k) > -1) return;
    var fn = W[k]; W[k] = async function () { return fn.apply(W, arguments); };
  });
  window.CMSWorkflow = W;
})();
