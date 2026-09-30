/* Role → module, menu and allowed ACTIONS.  Frontend demo permissions only —
   the Django backend must enforce the real authorization later. */
(function () {
  var R = {
    ADMIN: { label: "Administrator", module: "admin", home: "admin/dashboard.html",
      actions: ["admin.manage"],
      nav: [["Dashboard", "speedometer2", "dashboard"], ["Staff", "people", "staff"], ["Doctors", "person-badge", "doctors"], ["Departments", "diagram-3", "departments"],
        ["Specializations", "award", "specializations"], ["Medicines", "capsule", "medicines"], ["Dosages", "eyedropper", "dosages"], ["Lab Tests", "clipboard2-pulse", "lab-tests"], ["Activity", "activity", "activity"]] },
    RECEPTIONIST: { label: "Receptionist", module: "receptionist", home: "receptionist/dashboard.html",
      actions: ["patient.register", "appointment.book", "appointment.cancel", "bill.create", "bill.pay", "token.generate"],
      nav: [["Dashboard", "speedometer2", "dashboard"], ["Patients", "people", "patients"], ["Register Patient", "person-plus", "patient-register"], ["Appointments", "calendar-check", "appointments"],
        ["Billing", "receipt", "billing"], ["Tokens", "ticket-perforated", "tokens"]] },
    DOCTOR: { label: "Doctor", module: "doctor", home: "doctor/dashboard.html",
      actions: ["token.call", "consultation.save"],
      nav: [["Dashboard", "speedometer2", "dashboard"], ["Today's Appointments", "calendar-check", "appointments"], ["Token Queue", "ticket-perforated", "token-queue"], ["Consultation", "journal-medical", "consultation"],
        ["Consultation History", "clock-history", "history"], ["Prescriptions", "prescription2", "prescriptions"], ["Lab Requests", "clipboard2-pulse", "lab-requests"], ["Lab Results", "file-earmark-medical", "lab-results"]] },
    PHARMACIST: { label: "Pharmacist", module: "pharmacy", home: "pharmacy/dashboard.html",
      actions: ["pharmacy.bill", "pharmacy.pay", "pharmacy.dispense", "stock.update"],
      nav: [["Dashboard", "speedometer2", "dashboard"], ["Prescription Queue", "prescription2", "prescriptions"], ["Stock", "box-seam", "stock"], ["Billing", "receipt", "billing"], ["Dispensing", "bag-check", "dispensing"]] },
    LAB_TECHNICIAN: { label: "Lab Technician", module: "lab", home: "lab/dashboard.html",
      actions: ["lab.bill", "lab.pay", "lab.process", "lab.result"],
      nav: [["Dashboard", "speedometer2", "dashboard"], ["Requests", "clipboard2-pulse", "requests"], ["Billing", "receipt", "billing"], ["Processing", "hourglass-split", "processing"], ["Results", "file-earmark-medical", "results"]] }
  };
  window.CMSNav = {
    ROLES: R,
    can: function (role, action) { return !!(R[role] && R[role].actions.indexOf(action) > -1); }
  };
})();
