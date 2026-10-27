# CMS Hospital React Frontend — API-only mode

This project is intended to run beside the Django REST Framework backend. Patient, appointment, bill, token, consultation, prescription, lab and pharmacy records are fetched from the API. Demo/seed records and localStorage business-record persistence have been removed.

## Run

1. Install Node.js LTS.
2. Extract the ZIP.
3. Open a terminal in the `cms-react` folder.
4. Copy `.env.example` to `.env` (the default URL is suitable when Django runs on this computer).
5. Run `npm install`, then `npm run dev`.
6. Open the URL printed by Vite.
7. Start Django separately from its `cmsproj` directory with your virtual environment active: `python manage.py runserver`.

## Authentication

Login uses `POST /api/auth/login/`. The response's `access`, `refresh`, and `user` fields are used. Role values are expected to match the current backend: `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `PHARMACIST`, and `LAB_ASSISTANT`. Access tokens are sent as Bearer tokens. Local storage is used only for authentication/session UI state and theme preference, not business records.

## Current API mapping

- Admin: `/auth/staff/`, `/auth/departments/`, `/auth/specializations/`, `/pharmacy/medicines/`, `/lab/tests/`.
- Reception: `/receptionist/patients/`, `/receptionist/appointments/`, `/receptionist/bills/`, `/receptionist/tokens/`.
- Doctor: `/doctor/queue/`, `/doctor/appointments/today/`, `/doctor/prescriptions/`, `/doctor/lab-requests/list/`, `/lab/results/`.
- Pharmacy: `/pharmacy/prescriptions/`, `/pharmacy/stock/`, `/pharmacy/bills/`.
- Lab: `/lab/requests/`, `/lab/tests/`, `/lab/bills/`, `/lab/results/`.

Pages show empty/error states rather than substituting fake records. The UI exposes live list views and the available patient-registration, bill-payment, lab-bill, and doctor call-patient actions where implemented. API responses/permissions remain authoritative.

## Workflow reference

The project context and workflow baseline are included at `docs/Clinic_Management_System_Team_Master_Context.md`. Important rules include payment before token generation, appointments not automatically creating tokens, doctor-owned queue records, separate lab/pharmacy billing, and stock changes only when the relevant dispensing/processing operation succeeds.

## Known backend work still required

This is an API-connected frontend foundation, not a claim that every business operation is complete. The supplied backend does not yet provide a persistent lab consumables inventory API, server-side login/logout session audit, a dedicated Admin analytics aggregation endpoint, or a doctor Call Next action. The accompanying backend patch adds the doctor call action. Inventory and audit/analytics require additional Django models/views/serializers and migrations. CORS must also be enabled for the Vite origin (usually `http://localhost:5173`) in Django before browser requests can reach the API.
