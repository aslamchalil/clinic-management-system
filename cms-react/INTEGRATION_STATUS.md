# CMS React Frontend — integration status

## Run locally
1. Start the Django backend in its virtual environment (`python manage.py runserver`).
2. In this folder, copy `.env.example` to `.env` if you need a different backend URL. Default is `http://127.0.0.1:8000/api`.
3. Run `npm install` once, then `npm run dev`.
4. Open the Vite URL and sign in with a real Django account.

## Data and security
- Business records are fetched from Django APIs; no demo/seed business records are included.
- `localStorage` is used only for JWT/session UI state and theme preference.
- Role checks in React improve navigation only; Django permissions remain the security boundary.

## Backend routes verified from the supplied `cmsproj.zip`
- Auth: `/api/auth/login/`, `/api/auth/roles/`, `/api/auth/departments/`, `/api/auth/specializations/`, `/api/auth/staff/`
- Receptionist: patients, appointments, bills, bill payment, tokens, token generation
- Doctor: queue, today's appointments, patient details, consultations, prescriptions, prescription items, lab requests, consultation finalize
- Pharmacy: prescriptions, medicines, stock, bills, bill payment
- Lab: tests, requests, request details, bills, bill payment, results and result creation

## Current limitations / follow-up backend work
- The supplied doctor URL configuration does not expose a token-call endpoint, although the original static frontend includes a Call Patient action. This React version does not fake that operation. Add a Django route/view for changing an eligible token to `CALLED` to enable it.
- The backend has no persistent lab consumables inventory API. The page explains this rather than showing made-up stock.
- The backend has no activity/login-session history API or admin analytics/trend API. The dashboard can only summarize records returned by existing APIs; full audit history and server-side trends require backend support.
- The backend does not expose dosage CRUD routes in the supplied URL configuration.
- Appointment, consultation, prescription, lab-result, and billing operations enforce backend workflow requirements. If an action fails, the API error is displayed in the page.
- Pharmacy bill creation requires a patient ID and `items` JSON. Each item must include `medicine`, `prescription_item`, and `quantity_dispensed`; stock/payment rules are enforced by Django.
- Staff creation requires valid numeric role and department IDs plus a password of at least 8 characters.

## Important workflow notes
- Registration bill payment: choose `CASH`, `CARD`, or `UPI`; generate a token only after the bill is paid. Token generation requires `bill_id`, `token_date`, and `session` (`MORNING` or `EVENING`), and may optionally include `appointment`.
- Doctor consultation can only be created from a token that the backend has already marked `CALLED`.
- Lab bills/results are gated by request status and payment on the backend.
- Never use real patient information in screenshots or public repositories.
