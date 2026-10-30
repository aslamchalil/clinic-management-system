from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from cmsapp.models import (
    Appointment,
    Consultation,
    Department,
    Doctor,
    DoctorSession,
    Dosage,
    LabBill,
    LabRequest,
    LabResult,
    MasterLabTest,
    MasterMedicine,
    Patient,
    RegistrationBill,
    Prescription,
    Role,
    Specialization,
    Staff,
    Token,
)


@override_settings(USE_TZ=True, TIME_ZONE="Asia/Kolkata")
class DoctorWorkflowAPITests(TestCase):
    """API regression coverage; Django creates an isolated test database."""

    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.doctor_role = Role.objects.create(role_name="DOCTOR")
        self.lab_role = Role.objects.create(role_name="LAB_TECHNICIAN")
        self.department = Department.objects.create(department_name="Medicine")
        self.specialty = Specialization.objects.create(spec_name="General")
        self.doctor, self.doctor_user = self.make_doctor(User, "doctor-a")
        self.other_doctor, self.other_doctor_user = self.make_doctor(User, "doctor-b")
        self.patient = self.make_patient("Patient A")
        self.other_patient = self.make_patient("Patient B")
        self.test = MasterLabTest.objects.create(test_name="CBC", test_price=Decimal("250"))

    def make_doctor(self, User, username):
        user = User.objects.create_user(username=username, password="safe-test-password")
        staff = Staff.objects.create(
            user=user, role=self.doctor_role, department=self.department,
            first_name=username, last_name="Doctor", dob=date(1980, 1, 1),
            gender="OTHER", phone_number="9000000000", email=f"{username}@example.test",
        )
        doctor = Doctor.objects.create(
            staff=staff, specialization=self.specialty, consultation_fee=Decimal("500"),
            license_no=f"LIC-{username}",
        )
        return doctor, user

    def make_patient(self, name):
        return Patient.objects.create(
            full_name=name, dob=date(1990, 1, 1), gender="OTHER",
            phone_number="9111111111", email="", address="", blood_group="",
            emergency_contact="", registration_fee_status=Patient.RegistrationFeeStatusChoices.ASSESSED,
        )

    def make_visit(self, doctor, patient, token_date=None, status=Token.StatusChoices.WAITING):
        token_date = token_date or timezone.localdate()
        bill = RegistrationBill.objects.create(
            patient=patient, doctor=doctor, registration_fee=0,
            consultation_fee=doctor.consultation_fee, total_amount=doctor.consultation_fee,
            payment_status=RegistrationBill.PaymentStatusChoices.PAID,
        )
        appointment = Appointment.objects.create(
            patient=patient, doctor=doctor, appointment_date=token_date,
            appointment_time_slot=time(10, 0),
        )
        token = Token.objects.create(
            patient=patient, doctor=doctor, bill=bill, appointment=appointment,
            token_number=1, token_date=token_date, session=Token.SessionChoices.MORNING,
            status=status,
        )
        return bill, appointment, token

    def test_queue_and_appointments_are_doctor_owned_and_local_date_scoped(self):
        today = timezone.localdate()
        _, today_appointment, today_token = self.make_visit(self.doctor, self.patient, today)
        _, old_appointment, old_token = self.make_visit(
            self.doctor, self.other_patient, today - timedelta(days=1)
        )
        self.client.force_authenticate(self.doctor_user)
        queue = self.client.get("/api/doctor/queue/")
        appointments = self.client.get("/api/doctor/appointments/today/")
        self.assertEqual([row["token_id"] for row in queue.data], [today_token.token_id])
        self.assertEqual([row["appointment_id"] for row in appointments.data], [today_appointment.appointment_id])
        self.assertNotIn(old_token.token_id, [row["token_id"] for row in queue.data])
        self.assertNotIn(old_appointment.appointment_id, [row["appointment_id"] for row in appointments.data])

    def test_consultation_history_and_prescription_collection_are_doctor_scoped(self):
        _, _, own_token = self.make_visit(self.doctor, self.patient, status=Token.StatusChoices.COMPLETED)
        _, _, foreign_token = self.make_visit(self.other_doctor, self.other_patient, status=Token.StatusChoices.COMPLETED)
        own_consult = Consultation.objects.create(
            token=own_token, patient=self.patient, doctor=self.doctor, diagnosis="Own diagnosis"
        )
        Consultation.objects.create(
            token=foreign_token, patient=self.other_patient, doctor=self.other_doctor,
            diagnosis="Foreign diagnosis",
        )
        self.client.force_authenticate(self.doctor_user)
        history = self.client.get("/api/doctor/consultations/history/")
        prescriptions = self.client.get("/api/doctor/prescriptions/")
        self.assertEqual([row["consult_id"] for row in history.data], [own_consult.consult_id])
        self.assertEqual(prescriptions.data, [])

    def test_call_requires_paid_eligible_owned_token_and_active_session(self):
        _, _, token = self.make_visit(self.doctor, self.patient)
        now = timezone.localtime().time()
        start = (datetime.combine(date.today(), now) - timedelta(minutes=5)).time()
        end = (datetime.combine(date.today(), now) + timedelta(minutes=5)).time()
        DoctorSession.objects.create(
            doctor=self.doctor, session=Token.SessionChoices.MORNING,
            start_time=start, end_time=end,
        )
        self.client.force_authenticate(self.doctor_user)
        response = self.client.post(f"/api/doctor/tokens/{token.token_id}/call/")
        token.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(token.status, Token.StatusChoices.CALLED)
        duplicate = self.client.post(f"/api/doctor/tokens/{token.token_id}/call/")
        self.assertEqual(duplicate.status_code, 400)

    def test_doctor_lab_request_list_shows_created_today_and_is_doctor_scoped(self):
        _, _, token = self.make_visit(self.doctor, self.patient, status=Token.StatusChoices.CONSULTING)
        DoctorSession.objects.create(
            doctor=self.doctor, session=Token.SessionChoices.MORNING,
            start_time=time(8, 0), end_time=time(12, 0),
        )
        consultation = Consultation.objects.create(
            token=token, patient=self.patient, doctor=self.doctor,
        )
        self.client.force_authenticate(self.doctor_user)
        created = self.client.post("/api/doctor/lab-requests/", {
            "consultation": consultation.consult_id,
            "test": self.test.test_id,
            "priority": "NORMAL",
        }, format="json")
        self.assertEqual(created.status_code, 201)

        _, _, foreign_token = self.make_visit(self.other_doctor, self.other_patient)
        foreign_consultation = Consultation.objects.create(
            token=foreign_token, patient=self.other_patient, doctor=self.other_doctor,
        )
        foreign_request = LabRequest.objects.create(
            consultation=foreign_consultation, test=self.test,
        )
        historical_request = LabRequest.objects.create(
            consultation=consultation, test=self.test,
        )
        LabRequest.objects.filter(pk=historical_request.pk).update(
            order_date=timezone.now() - timedelta(days=1),
        )

        listed = self.client.get("/api/doctor/lab-requests/list/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["lab_request_id"] for row in listed.data], [created.data["lab_request_id"]])
        self.assertNotIn(foreign_request.lab_request_id, [row["lab_request_id"] for row in listed.data])

    def test_prescription_quantity_matches_supported_frequency_and_duration(self):
        _, _, token = self.make_visit(self.doctor, self.patient, status=Token.StatusChoices.CONSULTING)
        DoctorSession.objects.create(
            doctor=self.doctor, session=Token.SessionChoices.MORNING,
            start_time=time(8, 0), end_time=time(12, 0),
        )
        consultation = Consultation.objects.create(
            token=token, patient=self.patient, doctor=self.doctor,
        )
        prescription = Prescription.objects.create(consultation=consultation)
        medicine = MasterMedicine.objects.create(name="Quantity Test Medicine")
        dosage = Dosage.objects.create(medicine=medicine, dosage_value=Decimal("1"), unit="tablet")
        self.client.force_authenticate(self.doctor_user)

        def submit(frequency, duration, quantity):
            return self.client.post("/api/doctor/prescription-items/", {
                "prescription": prescription.prescription_id,
                "medicine": medicine.medicine_id,
                "dosage": dosage.dosage_id,
                "frequency": frequency,
                "duration": duration,
                "prescribed_quantity": quantity,
            }, format="json")

        self.assertEqual(submit("3 times per day", "5 days", 15).status_code, 201)
        self.assertEqual(submit("2 times per day", "7 days", 14).status_code, 201)
        self.assertEqual(submit("", "5 days", 15).status_code, 400)
        self.assertEqual(submit("every morning", "5 days", 5).status_code, 400)
        self.assertEqual(submit("2 times per day", "five days", 14).status_code, 400)
        self.assertEqual(submit("2 times per day", "0 days", 0).status_code, 400)
        self.assertEqual(submit("3 times per day", "5 days", 14).status_code, 400)

    def test_lab_results_and_request_details_are_scoped_to_own_consultations(self):
        _, _, own_token = self.make_visit(self.doctor, self.patient, status=Token.StatusChoices.COMPLETED)
        _, _, foreign_token = self.make_visit(self.other_doctor, self.other_patient, status=Token.StatusChoices.COMPLETED)
        own_consult = Consultation.objects.create(token=own_token, patient=self.patient, doctor=self.doctor)
        foreign_consult = Consultation.objects.create(token=foreign_token, patient=self.other_patient, doctor=self.other_doctor)
        own_request = LabRequest.objects.create(consultation=own_consult, test=self.test)
        foreign_request = LabRequest.objects.create(consultation=foreign_consult, test=self.test)
        lab_staff_user = get_user_model().objects.create_user(username="lab-tech", password="safe-test-password")
        lab_staff = Staff.objects.create(
            user=lab_staff_user, role=self.lab_role, department=self.department,
            first_name="Lab", last_name="Tech", dob=date(1980, 1, 1), gender="OTHER",
            phone_number="9222222222", email="lab@example.test",
        )
        lab_bill = LabBill.objects.create(patient=self.patient, total_amount=Decimal("250"))
        own_result = LabResult.objects.create(
            lab_request=own_request, technician=lab_staff, bill=lab_bill,
            result_value="Normal", report="CBC report",
        )
        foreign_bill = LabBill.objects.create(patient=self.other_patient, total_amount=Decimal("250"))
        foreign_result = LabResult.objects.create(
            lab_request=foreign_request, technician=lab_staff, bill=foreign_bill,
            result_value="Other result", report="Other CBC report",
        )
        self.client.force_authenticate(self.doctor_user)
        result_list = self.client.get("/api/lab/results/")
        own_detail = self.client.get(f"/api/lab/requests/{own_request.lab_request_id}/")
        foreign_detail = self.client.get(f"/api/lab/requests/{foreign_request.lab_request_id}/")
        foreign_result_detail = self.client.get(f"/api/lab/results/{foreign_result.result_id}/")
        self.assertEqual([row["result_id"] for row in result_list.data], [own_result.result_id])
        self.assertEqual(own_detail.status_code, 200)
        self.assertEqual(foreign_detail.status_code, 404)
        self.assertEqual(foreign_result_detail.status_code, 404)
        self.client.force_authenticate(lab_staff_user)
        lab_results = self.client.get("/api/lab/results/")
        self.assertEqual(len(lab_results.data), 2)
