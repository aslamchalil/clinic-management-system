# Clinic Management System — Complete Frontend Demo

This package is a frontend-only implementation based on the team's existing frontend and Team Master Context. The existing folder/file architecture is preserved; shared utilities were extended rather than introducing separate module frameworks.

## Stack

- HTML
- Bootstrap
- Vanilla JavaScript
- Browser localStorage
- No Django API
- No MySQL
- No backend connection

## Design

The existing blue/white clinic design is preserved. Shared theme, components, responsive rules, sidebar, navbar, cards, tables, badges, dark mode and demo clock are reused.

## Shared architecture

```text
UI
  ↓
Module JavaScript
  ↓
CMSWorkflow
  ↓
CMSStore
  ↓
localStorage
```

All modules use the SAME browser database.

There is one seed containing all shared master and transaction/demo data for:

- roles
- departments
- specializations
- users
- staff
- doctors
- doctor sessions
- patients
- appointments
- registration bills
- tokens
- consultations
- prescriptions
- prescription items
- medicines
- dosages
- pharmacy stock
- pharmacy bills/items
- lab tests
- lab requests
- lab bills/items
- lab results

## Important

Do NOT put another copy of patients, doctors, medicines, lab tests or transactions inside a module.

Use:

- `shared/js/mock-data.js` — initial seed
- `shared/js/store.js` — persistent browser data
- `shared/js/workflow.js` — business rules
- `shared/js/print.js` — bill/consultation printing with browser Print / Save as PDF
- `shared/js/patient-search.js` — shared patient search by ID, name or phone
- `shared/js/common.js` — shared table/search helpers

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Doctor | doctor_arjun | doctor123 |
| Doctor | doctor_ananya | doctor123 |
| Receptionist | reception | reception123 |
| Pharmacist | pharmacy | pharmacy123 |
| Lab Technician | lab | lab123 |

The UI displays doctors as `Dr. Arjun Menon`, `Dr. Ananya Nair`, etc., not as usernames.

## Demo data

The seed intentionally contains patients in different workflow states.

Examples:

- patients waiting for consultation
- completed consultations
- prescriptions waiting for pharmacy
- prescriptions already dispensed
- lab requests waiting for billing
- paid lab requests ready for processing
- completed lab results
- pending pharmacy bill
- paid pharmacy bill
- appointment no-show
- appointments waiting for registration/payment

This lets the team demonstrate the complete workflow without a backend.

## Reset

Every authenticated page has:

**Demo clock → Reset Demo Data**

Resetting restores the complete original seed and clears generated localStorage activity/session data.

## Demo clock

The clock is shared by every module.

It can be changed to:

- morning
- evening
- +30 minutes
- next day
- custom date/time

This is used to demonstrate appointment slot expiry, no-show and session validation.

## Role permissions

The frontend protects module routes according to the logged-in role.

This is demonstration-only authorization. Real authorization must later be implemented in Django REST Framework.

## Recommended way to run

Because this is a browser application, use a simple static server rather than opening individual HTML files directly.

From the `frontend` directory:

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500/
```

No Django server is required.

## Backend migration later

The frontend is intentionally separated from the backend.

Later:

```text
CMSStore / CMSWorkflow
        ↓
API service
        ↓
Django REST Framework
        ↓
MySQL
```

The UI should not need to be rewritten just because localStorage is replaced by API calls.


## Completed frontend workflow corrections

The current frontend also covers:

- Registration + consultation fee billing for walk-ins and appointments.
- Appointment cancellation and automatic NO_SHOW handling; paid advance status changes to REFUNDED on cancellation/no-show.
- Token generation only after a bill is PAID, with appointment linkage when applicable.
- Doctor morning/evening session creation from Admin.
- Staff display codes generated from the existing numeric staff ID, without changing the database schema:
  - Doctor: `doc1`, `doc2`, ...
  - Receptionist: `re3`, ...
  - Pharmacist: `ph4`, ...
  - Lab technician: `lab5`, ...
  - Admin: `adm6`, ...
- Patient search in Receptionist, Doctor, Pharmacy and Lab dashboards by patient ID, name or phone number. Doctor search remains scoped to patients associated with that doctor's token/consultation records.
- Registration, pharmacy and lab bills have **Print / Save PDF** actions. The printable document includes bill details, payment information and a timestamp at the bottom.
- Saved doctor consultations show the saved timestamp and can be printed/saved as PDF.
- Lab billing can combine multiple REQUESTED tests for the same patient into one bill.
- The existing localStorage/demo architecture remains unchanged and is intended to be replaceable by Django REST API calls later.
