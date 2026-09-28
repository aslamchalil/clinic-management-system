# Run with:  python manage.py shell < seed_lab_demo.py
from datetime import date
from decimal import Decimal
from django.contrib.auth import get_user_model
from cmsapp.models import (Role, Department, Specialization, Staff, Doctor, Patient,
    RegistrationBill, Token, Consultation, MasterLabTest, LabRequest)

User = get_user_model()
dept, _ = Department.objects.get_or_create(department_name="General Medicine")
spec, _ = Specialization.objects.get_or_create(spec_name="General Physician")

def staff(username, role_name):
    role, _ = Role.objects.get_or_create(role_name=role_name)
    user, created = User.objects.get_or_create(username=username)
    if created:
        user.set_password("Test@1234"); user.save()
    s, _ = Staff.objects.get_or_create(user=user, defaults=dict(
        role=role, department=dept, first_name=username.title(), last_name="Demo",
        dob=date(1990, 1, 1), gender="OTHER", phone_number="9999999999",
        email=f"{username}@clinic.test"))
    return s

tech = staff("tech1", "LAB_TECHNICIAN")
doc_staff = staff("doctor1", "DOCTOR")
staff("recep1", "RECEPTIONIST")
doctor, _ = Doctor.objects.get_or_create(staff=doc_staff, defaults=dict(
    specialization=spec, consultation_fee=Decimal("500"), license_no="LIC-DEMO-1"))

patient, _ = Patient.objects.get_or_create(full_name="Demo Patient", defaults=dict(
    dob=date(1995, 5, 5), gender="FEMALE", phone_number="7777777777"))

cbc, _ = MasterLabTest.objects.get_or_create(test_name="CBC", defaults=dict(
    test_price=Decimal("300"), min_value=Decimal("4"), max_value=Decimal("11")))
sugar, _ = MasterLabTest.objects.get_or_create(test_name="Blood Sugar", defaults=dict(test_price=Decimal("120")))

# a consultation needs Token -> PAID RegistrationBill (normally made by the receptionist/doctor modules)
bill = RegistrationBill.objects.create(patient=patient, doctor=doctor, consultation_fee=Decimal("500"),
        total_amount=Decimal("500"), payment_status="PAID", payment_method="CASH")
last = Token.objects.filter(doctor=doctor, token_date=date.today(), session="MORNING").count()
token = Token.objects.create(patient=patient, doctor=doctor, bill=bill, token_number=last + 1,
        token_date=date.today(), session="MORNING")
consult = Consultation.objects.create(token=token, patient=patient, doctor=doctor, symptoms="Fever")
r1 = LabRequest.objects.create(consultation=consult, test=cbc)
r2 = LabRequest.objects.create(consultation=consult, test=sugar, priority="URGENT")
print("DONE. Lab request ids:", r1.pk, r2.pk, "| patient id:", patient.pk)