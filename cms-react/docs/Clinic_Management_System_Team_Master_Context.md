# Clinic Management System — Team Master Project Context

## Project Overview

We are developing a Clinic Management System.

Technology stack:
- Backend: Python
- Framework: Django
- API: Django REST Framework (DRF)
- Database: MySQL
- Frontend: React
- Authentication: Django built-in User model

Main modules:
1. Clinic Admin
2. Receptionist
3. Doctor
4. Pharmacy
5. Lab

The system uses unified login. There are no separate login systems for doctors, receptionists, pharmacists, or lab technicians.

## Django Architecture

We use one central Django app:

`cmsapp`

All database models are centralized in:

`cmsapp/models.py`

Role-specific apps mainly contain serializers, views, URLs, API endpoints, and business logic:

- `clinic_admin`
- `receptionist`
- `doctor`
- `pharmacy`
- `lab`

Example structure:

```text
clinic_management/
├── manage.py
├── clinic_management/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
├── cmsapp/
│   ├── migrations/
│   ├── models.py
│   ├── admin.py
│   └── apps.py
├── clinic_admin/
├── receptionist/
├── doctor/
├── pharmacy/
└── lab/
```

### Team rule

Do not casually modify `cmsapp/models.py`. Any database model, field, relationship, or constraint change should be discussed with the team first.

Role-specific apps should import models from `cmsapp.models`.

## Django Built-in User Model

We are NOT creating a custom User model.

Use Django's built-in authentication User model, preferably through:

```python
from django.conf import settings
```

and:

```python
user = models.OneToOneField(
    settings.AUTH_USER_MODEL,
    ...
)
```

Authentication architecture:

```text
Django User
    |
    | OneToOne
    v
  Staff
    |
    +----> Role
    |
    +----> Department
    |
    v
  Doctor (if applicable)
```

The important relationship is:

`User -> Staff -> Doctor`

NOT:

`User -> Doctor`

Conceptually:

`doctor.staff.user`

Django User handles authentication. Staff stores employee information. Doctor stores doctor-specific information.

## Why User and Staff Are Separate

User handles:
- username
- password
- authentication
- Django permissions/groups when required

Staff handles:
- staff ID
- name
- DOB
- gender
- phone
- email
- role
- department
- active status

Therefore:

```text
User = authentication
Staff = employee information
Doctor = doctor-specific information
```

## Final Database Models

There are currently 23 models, all in `cmsapp/models.py`:

1. Role
2. Department
3. Specialization
4. Staff
5. Doctor
6. DoctorSession
7. Patient
8. Appointment
9. RegistrationBill
10. Token
11. Consultation
12. Prescription
13. MasterMedicine
14. Dosage
15. PrescriptionItem
16. PharmacyStock
17. PharmacyBill
18. PharmacyBillItem
19. MasterLabTest
20. LabRequest
21. LabBill
22. LabBillItem
23. LabResult

## 1. Role

Purpose: stores staff roles.

Fields:
- `role_id`
- `role_name`
- `is_active`

`role_name` should be unique.

Examples:
- ADMIN
- DOCTOR
- RECEPTIONIST
- PHARMACIST
- LAB_ASSISTANT

## 2. Department

Purpose: stores clinic departments.

Fields:
- `department_id`
- `department_name`
- `is_active`

`department_name` should be unique.

Examples:
- Cardiology
- Neurology
- General Medicine
- Pediatrics
- Orthopedics

Every staff member must belong to a department.

Doctor department is obtained through:

`Doctor -> Staff -> Department`

There is no separate department field in Doctor.

## 3. Specialization

Purpose: stores doctor specializations.

Fields:
- `spec_id`
- `spec_name`
- `is_active`

`spec_name` should be unique.

Examples:
- Cardiologist
- Neurologist
- Pediatrician
- Dermatologist

## 4. Staff

Purpose: common information for all clinic staff.

Fields:
- `staff_id`
- `user`
- `role`
- `department`
- `first_name`
- `last_name`
- `dob`
- `gender`
- `phone_number`
- `email`
- `is_active`

Relationships:
- Staff -> User: OneToOne
- Staff -> Role: ForeignKey
- Staff -> Department: ForeignKey

Every staff member must have a department.

## 5. Doctor

Purpose: doctor-specific information.

Fields:
- `doc_id`
- `staff`
- `specialization`
- `consultation_fee`
- `qualification`
- `exp_year`
- `license_no`
- `is_active`

Relationships:
- Doctor -> Staff: OneToOne
- Doctor -> Specialization: ForeignKey

There is no `department` field in Doctor.

Use:

`Doctor -> Staff -> Department`

## 6. DoctorSession

Purpose: doctor working sessions.

Fields:
- `session_id`
- `doctor`
- `session`
- `start_time`
- `end_time`
- `is_active`

Session choices:
- MORNING
- EVENING

Relationship:
- Doctor -> DoctorSession: OneToMany

Use a UniqueConstraint on:

`doctor + session`

## 7. Patient

Fields:
- `patient_id`
- `full_name`
- `dob`
- `gender`
- `phone_number`
- `email`
- `address`
- `blood_group`
- `emergency_contact`
- `is_active`
- `created_at`

A patient can have multiple appointments, tokens, consultations, bills, lab requests, and pharmacy bills.

Patient is not a Django authentication User.

## 8. Appointment

Fields:
- `appointment_id`
- `patient`
- `doctor`
- `appointment_date`
- `appointment_time_slot`
- `status`
- `advance_amount`
- `advance_payment_status`
- `created_at`

Status:
- BOOKED
- COMPLETED
- CANCELLED
- NO_SHOW

Advance payment status:
- PENDING
- PAID
- REFUNDED

Relationships:
- Appointment -> Patient: ForeignKey
- Appointment -> Doctor: ForeignKey

Business rule:

Maximum 10 appointment bookings per doctor per day.

This should be enforced in application/business logic.

## 9. RegistrationBill

Fields:
- `bill_id`
- `patient`
- `doctor`
- `registration_fee`
- `consultation_fee`
- `total_amount`
- `payment_status`
- `payment_method`
- `bill_date`

Payment status:
- PENDING
- PAID
- CANCELLED
- REFUNDED

Payment method:
- CASH
- CARD
- UPI

A token is created only after the relevant bill is confirmed as PAID.

Appointment creation alone does not create a token.

## 10. Token

Fields:
- `token_id`
- `patient`
- `doctor`
- `bill`
- `appointment`
- `token_number`
- `token_date`
- `session`
- `status`
- `created_at`

Status:
- WAITING
- CALLED
- COMPLETED
- CANCELLED

Relationships:
- Token -> Patient: ForeignKey
- Token -> Doctor: ForeignKey
- Token -> RegistrationBill: OneToOne
- Token -> Appointment: nullable ForeignKey

Walk-in patients can therefore have `appointment = NULL`.

Use uniqueness for:

`doctor + token_date + session + token_number`

## Token Business Rules

Maximum 30 tokens per doctor per day, including appointment holders and walk-ins.

Token numbers are sequential and follow payment confirmation order.

A token is generated only after payment is confirmed as PAID.

A patient cannot hold two active tokens for the same:
- doctor
- session
- day

A patient may have one morning token and one evening token for the same doctor on the same day.

## Walk-in Workflow

```text
Patient arrives
  -> Receptionist registers/finds patient
  -> Select doctor
  -> Create RegistrationBill
  -> Patient pays
  -> Bill = PAID
  -> Check token limit
  -> Generate token
  -> Token enters doctor queue
```

Walk-in Token appointment can be NULL.

## Appointment Workflow

```text
Patient
  -> Select doctor
  -> Select date/time
  -> Check max 10 appointments for doctor/day
  -> Create Appointment
  -> Registration/consultation billing
  -> Payment
  -> Bill = PAID
  -> Generate Token
  -> Token enters doctor queue
```

Appointment creation does not automatically create a token.

## Appointment No-show Rule

If the patient does not arrive before the appointment slot ends:

`Appointment.status = NO_SHOW`

There is no grace period.

If advance payment was made:

`advance_payment_status = REFUNDED`

The patient does not receive a token and the no-show does not consume a token.

## 11. Consultation

Fields:
- `consult_id`
- `token`
- `patient`
- `doctor`
- `symptoms`
- `diagnosis`
- `remarks`
- `created_at`

Relationships:
- Consultation -> Token: OneToOne
- Consultation -> Patient: ForeignKey
- Consultation -> Doctor: ForeignKey

The doctor creates the consultation after opening a valid token.

## Doctor Token Validation

The backend should verify:
1. Token exists.
2. Token belongs to the logged-in doctor.
3. Token date is today.
4. Token belongs to the current session.
5. Token is still valid/unused.
6. Patient is associated with that token.

Do not allow a doctor to open arbitrary patient records just by passing a patient ID.

## Doctor Consultation Workflow

```text
Doctor logs in
  -> View today's appointments
  -> View today's token queue
  -> Select valid token
  -> Open patient
  -> Record symptoms
  -> Record diagnosis
  -> Record remarks
  -> Create Prescription
  -> Create PrescriptionItems
  -> Create LabRequests when needed
```

## 12. Prescription

Fields:
- `prescription_id`
- `consultation`
- `created_at`

Relationship:
- Prescription -> Consultation: OneToOne

One consultation has one prescription.

## 13. MasterMedicine

Purpose: medicines maintained by Admin.

Fields:
- `medicine_id`
- `name`
- `generic_name`
- `category`
- `is_active`

Examples:
- Paracetamol
- Amoxicillin
- Cetirizine

Doctors select medicines from MasterMedicine.

## 14. Dosage

Fields:
- `dosage_id`
- `medicine`
- `dosage_value`
- `unit`
- `description`
- `is_active`

Relationship:
- Dosage -> MasterMedicine: ForeignKey

Example:

`Paracetamol -> 500 mg`

## 15. PrescriptionItem

Fields:
- `prescription_item_id`
- `prescription`
- `medicine`
- `dosage`
- `frequency`
- `duration`
- `instructions`
- `dispensed_status`
- `is_active`

Dispensed status:
- PENDING
- DISPENSED

Relationships:
- PrescriptionItem -> Prescription: ForeignKey
- PrescriptionItem -> MasterMedicine: ForeignKey
- PrescriptionItem -> Dosage: ForeignKey

Example:

```text
Medicine: Paracetamol
Dosage: 500 mg
Frequency: Twice daily
Duration: 5 days
Instructions: After food
```

PrescriptionItem represents the medicine request from Doctor to Pharmacy.

Do not create a separate MedicineRequest model.

## 16. PharmacyStock

Fields:
- `stock_id`
- `medicine`
- `quantity`
- `unit_cost_price`
- `selling_price`
- `reorder_level`

Relationship:
- PharmacyStock -> MasterMedicine: OneToOne

One medicine has one stock record.

Stock quantity must be updated when medicines are dispensed.

## 17. PharmacyBill

Fields:
- `pharmacy_bill_id`
- `patient`
- `pharmacist`
- `bill_date`
- `total_amount`
- `payment_status`
- `payment_method`

Payment status:
- PENDING
- PAID
- CANCELLED

Payment method:
- CASH
- CARD
- UPI

Relationships:
- PharmacyBill -> Patient: ForeignKey
- PharmacyBill -> Staff: ForeignKey

The pharmacist must have the PHARMACIST role.

## 18. PharmacyBillItem

Fields:
- `item_bill_id`
- `pharmacy_bill`
- `medicine`
- `quantity_dispensed`
- `unit_selling_price`
- `line_amount`

Relationships:
- PharmacyBillItem -> PharmacyBill: ForeignKey
- PharmacyBillItem -> MasterMedicine: ForeignKey

`unit_selling_price` stores the actual price charged at the time of sale, preserving historical billing if the master price changes later.

## Pharmacy Workflow

```text
Doctor creates prescription
  -> PrescriptionItem = PENDING
  -> Pharmacist views prescription
  -> Check stock
  -> Create PharmacyBill
  -> Patient pays
  -> Payment = PAID
  -> Dispense medicine
  -> Decrease stock
  -> PrescriptionItem = DISPENSED
```

## 19. MasterLabTest

Purpose: lab tests managed by Admin.

Fields:
- `test_id`
- `test_name`
- `test_type`
- `description`
- `test_price`
- `min_value`
- `max_value`
- `is_active`

Examples:
- CBC
- Blood Sugar
- Lipid Profile
- Urine Test
- Liver Function Test

## 20. LabRequest

Fields:
- `lab_request_id`
- `consultation`
- `test`
- `order_date`
- `priority`
- `status`
- `is_active`

Priority:
- NORMAL
- URGENT

Status:
- REQUESTED
- BILLED
- PAID
- IN_PROGRESS
- COMPLETED
- CANCELLED

Relationships:
- LabRequest -> Consultation: ForeignKey
- LabRequest -> MasterLabTest: ForeignKey

IMPORTANT: There is only ONE LabRequest model.

Do not create:
- TestRequest
- Test_Request
- another LabRequest in the lab app

The model stays in `cmsapp/models.py`.

## 21. LabBill

Fields:
- `lab_bill_id`
- `patient`
- `bill_date`
- `total_amount`
- `payment_status`
- `payment_method`

Payment status:
- PENDING
- PAID
- CANCELLED

Payment method:
- CASH
- CARD
- UPI

## 22. LabBillItem

Fields:
- `lab_bill_item_id`
- `lab_bill`
- `lab_request`
- `quantity`
- `unit_price`
- `line_amount`

Relationships:
- LabBillItem -> LabBill: ForeignKey
- LabBillItem -> LabRequest: ForeignKey

Use `lab_request` instead of only `test_id` because the same test may be requested multiple times and the exact request must be identifiable.

## 23. LabResult

Fields:
- `result_id`
- `lab_request`
- `technician`
- `bill`
- `result_value`
- `unit`
- `reference_range`
- `result_date`
- `report`

Relationships:
- LabResult -> LabRequest: OneToOne
- LabResult -> Staff: ForeignKey
- LabResult -> LabBill: ForeignKey

Technician must have role `LAB_ASSISTANT`.

## Lab Payment Rule

A lab test can only be processed after the corresponding lab bill is PAID.

Backend must verify:

```python
LabBill.payment_status == "PAID"
```

It must also verify that the bill corresponds to the relevant lab request/test.

A `LabResult.bill` ForeignKey alone does not guarantee valid payment.

## Lab Workflow

```text
Doctor consultation
  -> Create LabRequest
  -> LabRequest = REQUESTED
  -> Create LabBill
  -> Create LabBillItem
  -> Patient pays
  -> LabBill = PAID
  -> LabRequest = PAID
  -> Lab technician processes test
  -> LabRequest = IN_PROGRESS
  -> Create LabResult
  -> LabRequest = COMPLETED
```

## Admin Responsibilities

Admin manages:
- Staff
- Roles
- Departments
- Specializations
- Doctors
- Doctor sessions
- Master medicines
- Dosages
- Master lab tests

Doctor creation example:

```text
Admin logs in
  -> Create Django User
  -> Create Staff
  -> Assign Role = DOCTOR
  -> Assign Department
  -> Create Doctor profile
  -> Assign Specialization
  -> Set consultation fee
  -> Set qualification
  -> Set experience
  -> Set license number
  -> Create doctor sessions
```

## Receptionist Responsibilities

Receptionist handles:
- Patient registration
- Appointment booking
- Registration billing
- Payments
- Token generation
- Appointment cancellation
- No-show handling

## Doctor Responsibilities

Doctor handles:
- Today's appointments
- Token queue
- Patient/token validation
- Consultation
- Prescription
- Prescription items
- Lab requests
- Viewing lab results

## Pharmacy Responsibilities

Pharmacy handles:
- Prescription viewing
- Stock
- Pharmacy billing
- Medicine dispensing
- Stock deduction
- PrescriptionItem status

## Lab Responsibilities

Lab handles:
- Lab request viewing
- Lab billing
- Payment verification
- Test processing
- Result entry
- Doctor result viewing

## Complete System Workflow

```text
Patient Arrival
  |
  +-----------------------------+
  |                             |
  v                             v
Appointment Patient          Walk-in Patient
  |                             |
  +-------------+---------------+
                |
                v
        Patient registration
                |
                v
      Registration/Consultation Bill
                |
                v
             Payment
                |
                v
          Bill = PAID
                |
                v
         Generate Token
                |
                v
          Doctor Queue
                |
                v
        Doctor calls patient
                |
                v
         Validate Token
                |
                v
          Consultation
           /                   v           v
 Prescription     LabRequest
      |                |
      v                v
  Pharmacy          Lab Billing
      |                |
      v                v
 PharmacyBill        LabBill
      |                |
      v                v
  Payment            Payment
      |                |
      v                v
 Dispense Drug     Lab Processing
                       |
                       v
                   LabResult
```

## Consultation Transaction

These operations should be atomic:

- Consultation creation
- Prescription creation
- PrescriptionItem creation
- LabRequest creation

Use:

```python
from django.db import transaction
```

Example:

```python
with transaction.atomic():
    # create consultation
    # create prescription
    # create prescription items
    # create lab requests
```

If any operation fails, the whole transaction should roll back.

## Consultation Immutability

Once a consultation is successfully saved:
- It cannot be edited.
- It cannot be deleted.

It becomes a permanent/read-only clinical record.

## Database Constraints vs Business Logic

### Good candidates for database/model constraints

- Unique role name
- Unique department name
- Unique specialization
- One User -> one Staff
- One Staff -> one Doctor
- One Doctor -> one morning session
- One Doctor -> one evening session
- Unique token number for doctor/date/session
- One Consultation -> one Token
- One Prescription -> one Consultation
- One LabRequest -> one LabResult

### Business/service logic should handle

- Maximum 10 appointments per doctor/day
- Maximum 30 tokens per doctor/day
- Sequential token generation
- Token generation after payment
- Payment validation
- No-show handling
- Refund logic
- Role validation
- Current session validation
- Doctor/token ownership validation
- Duplicate active token prevention
- Stock deduction
- Consultation atomic transaction
- Lab payment verification
- Ensuring LabResult bill belongs to the LabRequest
- Ensuring pharmacist has PHARMACIST role
- Ensuring lab technician has LAB_ASSISTANT role
- Ensuring Doctor staff has DOCTOR role

## Role Validation

A ForeignKey to Staff does not automatically guarantee the correct role.

For example:

`PharmacyBill.pharmacist -> Staff`

must still validate:

```python
staff.role.role_name == "PHARMACIST"
```

Similarly:

```python
staff.role.role_name == "LAB_ASSISTANT"
```

for lab technicians.

Doctor staff should have:

```text
role = DOCTOR
```

## Models That Must NOT Be Duplicated

Do not create:
- CustomUser
- DoctorUser
- ReceptionistUser
- PharmacistUser
- LabUser
- TestRequest
- Test_Request
- MedicineRequest
- LabTechnician
- MedicalRecord
- Doctor.dep_id

Use:
- Django User -> Staff -> Role
- LabRequest
- PrescriptionItem
- Staff with LAB_ASSISTANT role
- Consultation as permanent clinical record
- Doctor -> Staff -> Department

## Important Relationship Summary

```text
Django User
    |
    | OneToOne
    v
Staff
    |
    +----> Role
    |
    +----> Department
    |
    | OneToOne
    v
Doctor
    |
    +----> Specialization
    |
    +----> DoctorSession
```

```text
Patient
    |
    +----> Appointment
    |
    +----> RegistrationBill
    |
    +----> Token
    |
    +----> Consultation
    |
    +----> PharmacyBill
    |
    +----> LabBill
```

```text
Doctor
    |
    +----> Appointment
    |
    +----> Token
    |
    +----> Consultation
    |
    +----> DoctorSession
```

```text
Token
    |
    +----> RegistrationBill
    |
    +----> Appointment
    |
    +----> Consultation
```

```text
Consultation
    |
    +----> Prescription
    |
    +----> LabRequest
```

```text
Prescription
    |
    +----> PrescriptionItem
               |
               +----> MasterMedicine
               |
               +----> Dosage
```

```text
MasterMedicine
    |
    +----> PharmacyStock
    |
    +----> PrescriptionItem
```

```text
PharmacyBill
    |
    +----> PharmacyBillItem
               |
               +----> MasterMedicine
```

```text
LabRequest
    |
    +----> MasterLabTest
    |
    +----> LabBillItem
    |
    +----> LabResult
```

```text
LabBill
    |
    +----> LabBillItem
    |
    +----> LabResult
```

```text
LabResult
    |
    +----> Staff as technician
    |
    +----> LabBill
```

## Important Appointment Time Design Point

The SRS describes appointment slots using start and end times because no-show is determined after the slot ends.

The current Django design has:

`appointment_time_slot`

as a TimeField.

Before final production migration, the team should confirm whether the model should instead contain:

- `slot_start_time`
- `slot_end_time`

This is important for:
- appointment slot ending
- no-show detection
- automatic cancellation/refund logic

Do not make this change independently because it changes the database schema.

## Staff ID Design Point

The SRS gives examples such as:

`DOC-0001`

for staff IDs.

The current Django design uses an integer AutoField for:

`staff_id`

The team should confirm whether role-prefixed IDs are required.

Possible approach:

```text
staff_id = AutoField
staff_code = unique CharField
```

Example:

```text
staff_id = 1
staff_code = DOC-0001
```

This keeps the internal database ID numeric while allowing the application to display the required staff code.

Alternatively, a string-based staff ID could be used as the primary key, but that affects relationships and APIs.

Do not change this without team agreement before the final migration.

## Development Order

### Step 1 — Database Models

Finalize:

`cmsapp/models.py`

Then run:

```bash
python manage.py makemigrations
python manage.py migrate
```

Verify MySQL tables.

### Step 2 — Authentication

Implement:

- Django User
- Staff
- Role

Login should use Django authentication.

### Step 3 — Admin

Implement:
- Staff management
- Role management
- Department management
- Specialization management
- Doctor management
- Doctor sessions
- Master medicines
- Dosages
- Master lab tests

### Step 4 — Receptionist

Implement:
- Patient registration
- Appointment booking
- Registration billing
- Payment
- Token generation
- Appointment cancellation
- No-show handling

### Step 5 — Doctor

Implement:
- Today's appointments
- Token queue
- Patient validation
- Consultation
- Prescription
- Prescription items
- Lab requests

### Step 6 — Pharmacy

Implement:
- Prescription viewing
- Stock
- Pharmacy billing
- Medicine dispensing
- Stock deduction
- PrescriptionItem status

### Step 7 — Lab

Implement:
- Lab request viewing
- Lab billing
- Payment verification
- Test processing
- Result entry
- Doctor result viewing

## Git and Migration Rules

When models are changed:

```bash
python manage.py makemigrations
python manage.py migrate
```

Commit:

```text
cmsapp/models.py
cmsapp/migrations/
```

Example:

```bash
git add cmsapp/models.py cmsapp/migrations/
git commit -m "Finalize database models"
git push
```

Team members should pull the latest changes before continuing.

Do not delete or modify migration files casually.

If migration conflicts occur, discuss them with the team before rewriting migration history.

## Team Schema-Change Workflow

```text
Requirement identified
       |
       v
Discuss with team
       |
       v
Agree on database design
       |
       v
Modify cmsapp/models.py
       |
       v
Create migration
       |
       v
Run migration
       |
       v
Test database
       |
       v
Commit model + migration
       |
       v
Push to GitHub
       |
       v
Other team members pull changes
```

## Important AI Assistant Rules

If an AI assistant is helping with this project, it MUST follow the existing architecture.

1. Do not create a custom User model unless explicitly requested.
2. Use `Django User -> Staff`.
3. Do not create duplicate database models.
4. Use `LabRequest`, not TestRequest/Test_Request.
5. Use `PrescriptionItem`, not MedicineRequest.
6. Use Staff with `LAB_ASSISTANT` role, not a separate LabTechnician model.
7. Keep database models in `cmsapp/models.py`.
8. Role-specific apps should import models from `cmsapp.models`.
9. Do not add fields/relationships just because they are common in other systems.
10. If a schema change is necessary, explain why before changing it.
11. Do not assume a ForeignKey automatically enforces business rules.
12. Remember Doctor -> Staff -> User.
13. Remember Doctor -> Staff -> Department.
14. Use `transaction.atomic()` when multiple related operations must succeed together.
15. Consultations are permanent/read-only after successful creation.
16. Tokens are generated only after payment confirmation.
17. Appointment creation does not automatically create a token.
18. Maximum appointments: 10 per doctor per day.
19. Maximum tokens: 30 per doctor per day.
20. A patient cannot have two active tokens for the same doctor/session/day.
21. Lab tests cannot be processed until the corresponding lab bill is PAID.

## How an AI Should Help a Team Member

When a team member asks for help, the AI should:

1. Understand which module they are working on.
2. Follow this database architecture.
3. Reuse existing cmsapp models.
4. Avoid duplicate models.
5. Explain which models are involved.
6. Explain relationships before complicated code.
7. Provide Django REST Framework-compatible code.
8. Explain code step by step because some team members are learning Django/DRF.
9. Point out conflicts with the current architecture.
10. Never silently change the database structure.
11. Separate model constraints from business logic.
12. Use transactions when multiple related operations must succeed together.

## Team Member Task Template

After copying this entire document into an AI model, add:

```text
MY CURRENT TASK:

Module:
[Doctor / Receptionist / Pharmacy / Lab / Admin]

Task:
[Describe the task here]

I am currently working on:
[models / serializers / views / URLs / authentication / business logic]

Please help me step by step.

IMPORTANT:
- Follow the Clinic Management System architecture above.
- Do not create duplicate models.
- Do not create a custom User model.
- Keep database models in cmsapp/models.py.
- Role-specific apps should import models from cmsapp.
- Explain the code because I am learning Django REST Framework.
- Do not change the database structure unless you first explain why the change is necessary.
- If there is a conflict with the architecture above, point it out before giving the code.
- Use the existing relationships and business rules.
- Do not assume that a ForeignKey automatically enforces business rules.
- If a transaction is required, use transaction.atomic().
```

## Final Architecture

The most important relationship is:

```text
Django User
      |
      | OneToOne
      v
    Staff
      |
      +------> Role
      |
      +------> Department
      |
      v
    Doctor
      |
      +------> Specialization
      |
      +------> DoctorSession
```

Overall:

```text
Django User
    |
    v
Staff
    |
    +---- Role
    |
    +---- Department
    |
    +---- Doctor
             |
             +---- DoctorSession
             |
             +---- Appointment
             |
             +---- Token
                      |
                      +---- RegistrationBill
                      |
                      +---- Consultation
                                |
                                +---- Prescription
                                |       |
                                |       +---- PrescriptionItem
                                |                 |
                                |                 +---- MasterMedicine
                                |                 |
                                |                 +---- Dosage
                                |
                                +---- LabRequest
                                          |
                                          +---- MasterLabTest
                                          |
                                          +---- LabBill
                                          |
                                          +---- LabBillItem
                                          |
                                          +---- LabResult
```

## One-Sentence Project Architecture

Django User handles authentication, Staff stores common employee information, Role determines the employee's role, Department determines where the employee belongs, Doctor stores doctor-specific information, all database models are centralized in `cmsapp/models.py`, and the role-specific apps (Admin, Receptionist, Doctor, Pharmacy, and Lab) import those models and implement their APIs and business logic.

# END OF CLINIC MANAGEMENT SYSTEM — TEAM MASTER PROJECT CONTEXT
