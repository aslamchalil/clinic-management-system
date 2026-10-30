from concurrent.futures import ThreadPoolExecutor
from datetime import date, time, timedelta
from threading import Barrier
from uuid import uuid4
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection, close_old_connections
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from cmsapp.models import (
    Appointment,
    Department,
    Doctor,
    DoctorSession,
    Patient,
    RegistrationBill,
    Role,
    Specialization,
    Staff,
    Token,
)
from receptionist.serializers import AppointmentSerializer, RegistrationBillSerializer
from receptionist.views import maximum_token_date


class ReceptionistWorkflowTestCase(TestCase):
    def setUp(self):
        user_model = get_user_model()
        role = Role.objects.create(role_name="RECEPTIONIST")
        department = Department.objects.create(department_name="Reception")
        user = user_model.objects.create_user(username="reception-test")
        Staff.objects.create(
            user=user,
            role=role,
            department=department,
            first_name="Reception",
            last_name="User",
            dob=date(1990, 1, 1),
            gender="OTHER",
            phone_number="0000000000",
            email="reception-test@example.test",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=user)
        doctor_user = user_model.objects.create_user(username="doctor-test")
        self.doctor_user = doctor_user
        doctor_role = Role.objects.create(role_name="DOCTOR")
        doctor_department = Department.objects.create(department_name="Clinic")
        doctor_staff = Staff.objects.create(
            user=doctor_user,
            role=doctor_role,
            department=doctor_department,
            first_name="Asha",
            last_name="Rao",
            dob=date(1980, 1, 1),
            gender="FEMALE",
            phone_number="0000000001",
            email="doctor-test@example.test",
        )
        self.doctor = Doctor.objects.create(
            staff=doctor_staff,
            specialization=Specialization.objects.create(spec_name="General"),
            consultation_fee="725.00",
            license_no="TEST-LICENSE-1",
        )

    def make_patient(self, status=Patient.RegistrationFeeStatusChoices.ELIGIBLE):
        return Patient.objects.create(
            full_name="Test Patient",
            dob=date(1995, 1, 1),
            gender="OTHER",
            phone_number="0000000002",
            registration_fee_status=status,
        )

    def test_doctor_directory_is_receptionist_accessible_and_active_only(self):
        DoctorSession.objects.create(
            doctor=self.doctor,
            session=DoctorSession.SessionChoices.MORNING,
            start_time=time(8, 0),
            end_time=time(12, 0),
        )
        inactive_user = get_user_model().objects.create_user(username="inactive-doctor")
        staff = Staff.objects.create(
            user=inactive_user,
            role=Role.objects.get(role_name="DOCTOR"),
            department=Department.objects.get(department_name="Clinic"),
            first_name="Hidden",
            last_name="Doctor",
            dob=date(1980, 1, 1),
            gender="OTHER",
            phone_number="0000000003",
            email="inactive@example.test",
        )
        Doctor.objects.create(
            staff=staff,
            specialization=Specialization.objects.get(spec_name="General"),
            consultation_fee="900.00",
            license_no="TEST-LICENSE-2",
            is_active=False,
        )
        response = self.client.get("/api/receptionist/doctors/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["doc_id"], self.doctor.doc_id)
        self.assertEqual(response.data[0]["consultation_fee"], "725.00")
        self.assertEqual(response.data[0]["sessions"], ["MORNING"])

    def test_doctor_directory_rejects_unauthenticated_and_non_receptionist_users(self):
        anonymous_response = APIClient().get("/api/receptionist/doctors/")
        self.assertEqual(anonymous_response.status_code, 401)
        self.client.force_authenticate(user=self.doctor_user)
        doctor_response = self.client.get("/api/receptionist/doctors/")
        self.assertEqual(doctor_response.status_code, 403)

    def test_bill_uses_database_fees_and_retry_is_idempotent(self):
        patient = self.make_patient()
        visit_key = str(uuid4())
        payload = {
            "patient": patient.patient_id,
            "doctor": self.doctor.doc_id,
            "visit_key": visit_key,
            "registration_fee": "9999.00",
            "consultation_fee": "1.00",
        }
        first = self.client.post("/api/receptionist/bills/", payload, format="json")
        retry = self.client.post("/api/receptionist/bills/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.data["bill_id"], retry.data["bill_id"])
        self.assertEqual(first.data["registration_fee"], "50.00")
        self.assertEqual(first.data["consultation_fee"], "725.00")
        self.assertEqual(first.data["total_amount"], "775.00")
        patient.refresh_from_db()
        self.assertEqual(patient.registration_fee_status, Patient.RegistrationFeeStatusChoices.ASSESSED)

        second_visit = self.client.post(
            "/api/receptionist/bills/",
            {"patient": patient.patient_id, "doctor": self.doctor.doc_id, "visit_key": str(uuid4())},
            format="json",
        )
        self.assertEqual(second_visit.status_code, 201)
        self.assertEqual(second_visit.data["registration_fee"], "0.00")

    def test_review_patient_cannot_be_assigned_eligibility_by_bill_request(self):
        patient = self.make_patient(Patient.RegistrationFeeStatusChoices.REVIEW)
        response = self.client.post(
            "/api/receptionist/bills/",
            {"patient": patient.patient_id, "doctor": self.doctor.doc_id, "visit_key": str(uuid4())},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(RegistrationBill.objects.count(), 0)

    def test_appointment_identity_is_unique_and_cancelled_appointments_are_rejected(self):
        patient = self.make_patient()
        appointment_date = timezone.localdate()
        appointment = Appointment.objects.create(
            patient=patient,
            doctor=self.doctor,
            appointment_date=appointment_date,
            appointment_time_slot=time(9, 0),
        )
        payload = {
            "patient": patient.patient_id,
            "doctor": self.doctor.doc_id,
            "appointment": appointment.appointment_id,
        }
        first = self.client.post("/api/receptionist/bills/", payload, format="json")
        retry = self.client.post("/api/receptionist/bills/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.data["bill_id"], retry.data["bill_id"])
        other_patient = self.make_patient()
        cancelled_appointment = Appointment.objects.create(
            patient=other_patient,
            doctor=self.doctor,
            appointment_date=appointment_date,
            appointment_time_slot=time(10, 0),
            status=Appointment.StatusChoices.CANCELLED,
        )
        cancelled = self.client.post(
            "/api/receptionist/bills/",
            {"patient": other_patient.patient_id, "doctor": self.doctor.doc_id, "appointment": cancelled_appointment.appointment_id},
            format="json",
        )
        self.assertEqual(cancelled.status_code, 400)

    def test_payment_confirmation_and_token_uniqueness(self):
        patient = self.make_patient(Patient.RegistrationFeeStatusChoices.ASSESSED)
        bill = RegistrationBill.objects.create(
            patient=patient,
            doctor=self.doctor,
            registration_fee="0.00",
            consultation_fee=self.doctor.consultation_fee,
            total_amount=self.doctor.consultation_fee,
            visit_key=uuid4(),
        )
        token_date = timezone.localdate()
        DoctorSession.objects.create(
            doctor=self.doctor,
            session=Token.SessionChoices.MORNING,
            start_time=time(8, 0),
            end_time=time(12, 0),
        )
        blocked = self.client.post(
            "/api/receptionist/tokens/generate/",
            {"bill_id": bill.bill_id, "token_date": token_date.isoformat(), "session": "MORNING"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        payment = self.client.post(
            f"/api/receptionist/bills/{bill.bill_id}/pay/",
            {"payment_method": "CASH"},
            format="json",
        )
        self.assertEqual(payment.data["payment_status"], "PAID")
        same_method_retry = self.client.post(
            f"/api/receptionist/bills/{bill.bill_id}/pay/",
            {"payment_method": "CASH"}, format="json",
        )
        changed_method_retry = self.client.post(
            f"/api/receptionist/bills/{bill.bill_id}/pay/",
            {"payment_method": "CARD"}, format="json",
        )
        self.assertEqual(same_method_retry.status_code, 200)
        self.assertEqual(same_method_retry.data["payment_method"], "CASH")
        self.assertEqual(changed_method_retry.status_code, 409)
        self.assertEqual(changed_method_retry.data["payment_status"], "PAID")
        bill.refresh_from_db()
        self.assertEqual(bill.payment_method, "CASH")
        generated = self.client.post(
            "/api/receptionist/tokens/generate/",
            {"bill_id": bill.bill_id, "token_date": token_date.isoformat(), "session": "MORNING"},
            format="json",
        )
        duplicate = self.client.post(
            "/api/receptionist/tokens/generate/",
            {"bill_id": bill.bill_id, "token_date": token_date.isoformat(), "session": "MORNING"},
            format="json",
        )
        self.assertEqual(generated.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(Token.objects.filter(bill=bill).count(), 1)

    def test_live_token_list_defaults_to_clinic_today_and_preserves_history(self):
        with timezone.override("Asia/Kolkata"):
            today = timezone.localdate()
            yesterday = today - timedelta(days=1)
            today_patient = self.make_patient(Patient.RegistrationFeeStatusChoices.ASSESSED)
            older_patient = Patient.objects.create(
                full_name="Older queue patient", dob=date(1994, 1, 1),
                gender="OTHER", phone_number="0000000040",
                registration_fee_status=Patient.RegistrationFeeStatusChoices.ASSESSED,
            )
            today_bill = RegistrationBill.objects.create(
                patient=today_patient, doctor=self.doctor,
                registration_fee="0.00", consultation_fee="725.00", total_amount="725.00",
            )
            older_bill = RegistrationBill.objects.create(
                patient=older_patient, doctor=self.doctor,
                registration_fee="0.00", consultation_fee="725.00", total_amount="725.00",
            )
            today_token = Token.objects.create(
                patient=today_patient, doctor=self.doctor, bill=today_bill,
                token_number=1, token_date=today, session=Token.SessionChoices.MORNING,
            )
            older_token = Token.objects.create(
                patient=older_patient, doctor=self.doctor, bill=older_bill,
                token_number=1, token_date=yesterday, session=Token.SessionChoices.MORNING,
            )

            live_response = self.client.get("/api/receptionist/tokens/")
            history_response = self.client.get("/api/receptionist/tokens/?token_date=all")
            older_date_response = self.client.get(
                f"/api/receptionist/tokens/?token_date={yesterday.isoformat()}"
            )

        self.assertEqual(live_response.status_code, 200)
        self.assertEqual([row["token_id"] for row in live_response.data], [today_token.token_id])
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual({row["token_id"] for row in history_response.data}, {
            today_token.token_id, older_token.token_id,
        })
        self.assertEqual(older_date_response.data[0]["token_id"], older_token.token_id)
        self.assertTrue(Token.objects.filter(token_id=older_token.token_id).exists())

    def test_bill_id_token_filter_supports_duplicate_recovery(self):
        DoctorSession.objects.create(
            doctor=self.doctor, session=DoctorSession.SessionChoices.MORNING,
            start_time=time(8, 0), end_time=time(12, 0),
        )
        patient = self.make_patient(Patient.RegistrationFeeStatusChoices.ASSESSED)
        bill = RegistrationBill.objects.create(
            patient=patient, doctor=self.doctor,
            registration_fee="0.00", consultation_fee="725.00", total_amount="725.00",
            payment_status=RegistrationBill.PaymentStatusChoices.PAID,
            payment_method=RegistrationBill.PaymentMethodChoices.CASH,
        )
        token = Token.objects.create(
            patient=patient, doctor=self.doctor, bill=bill,
            token_number=1, token_date=timezone.localdate() - timedelta(days=10),
            session=Token.SessionChoices.MORNING,
        )
        response = self.client.get(f"/api/receptionist/tokens/?bill_id={bill.bill_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["token_id"], token.token_id)

        outside_window = RegistrationBill.objects.create(
            patient=patient,
            doctor=self.doctor,
            registration_fee="0.00",
            consultation_fee=self.doctor.consultation_fee,
            total_amount=self.doctor.consultation_fee,
            payment_status=RegistrationBill.PaymentStatusChoices.PAID,
            payment_method=RegistrationBill.PaymentMethodChoices.CASH,
            visit_key=uuid4(),
        )
        invalid_date = maximum_token_date() + timedelta(days=1)
        rejected = self.client.post(
            "/api/receptionist/tokens/generate/",
            {"bill_id": outside_window.bill_id, "token_date": invalid_date.isoformat(), "session": "MORNING"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("two calendar months", rejected.data["token_date"])

    def test_token_date_limit_is_two_clamped_calendar_months(self):
        today = date(2026, 1, 31)
        self.assertEqual(maximum_token_date(today), date(2026, 3, 31))
        today = date(2026, 12, 31)
        self.assertEqual(maximum_token_date(today), date(2027, 2, 28))
        self.assertEqual(maximum_token_date(date(2027, 12, 31)), date(2028, 2, 29))

    def test_appointment_date_limit_matches_clamped_token_window(self):
        today = date(2027, 12, 31)
        DoctorSession.objects.create(
            doctor=self.doctor, session=DoctorSession.SessionChoices.MORNING,
            start_time=time(8), end_time=time(17), is_active=True,
        )
        patient = self.make_patient()
        client = self.client
        with patch("receptionist.serializers.timezone.localdate", return_value=today):
            accepted = client.post("/api/receptionist/appointments/", {
                "patient": patient.patient_id,
                "doctor": self.doctor.doc_id,
                "appointment_date": "2028-02-29",
                "appointment_time_slot": "09:00:00",
            }, format="json")
            rejected = client.post("/api/receptionist/appointments/", {
                "patient": patient.patient_id,
                "doctor": self.doctor.doc_id,
                "appointment_date": "2028-03-01",
                "appointment_time_slot": "10:00:00",
            }, format="json")
        self.assertEqual(accepted.status_code, 201)
        self.assertEqual(rejected.status_code, 400)


@skipUnlessDBFeature("supports_transactions")
class BillRetryConcurrencyTestCase(TransactionTestCase):
    reset_sequences = True

    def test_same_walk_in_key_returns_one_bill_under_concurrent_requests(self):
        if connection.vendor != "mysql":
            self.skipTest("Row-lock concurrency must be verified against MySQL.")
        user_model = get_user_model()
        receptionist_role = Role.objects.create(role_name="RECEPTIONIST")
        doctor_role = Role.objects.create(role_name="DOCTOR")
        reception_department = Department.objects.create(department_name="Reception")
        clinic_department = Department.objects.create(department_name="Clinic")
        receptionist_user = user_model.objects.create_user(username="concurrent-reception")
        Staff.objects.create(
            user=receptionist_user,
            role=receptionist_role,
            department=reception_department,
            first_name="Reception",
            last_name="Concurrent",
            dob=date(1990, 1, 1),
            gender="OTHER",
            phone_number="0000000010",
            email="concurrent-reception@example.test",
        )
        doctor_user = user_model.objects.create_user(username="concurrent-doctor")
        doctor_staff = Staff.objects.create(
            user=doctor_user,
            role=doctor_role,
            department=clinic_department,
            first_name="Concurrent",
            last_name="Doctor",
            dob=date(1980, 1, 1),
            gender="OTHER",
            phone_number="0000000011",
            email="concurrent-doctor@example.test",
        )
        doctor = Doctor.objects.create(
            staff=doctor_staff,
            specialization=Specialization.objects.create(spec_name="Concurrent"),
            consultation_fee="100.00",
            license_no="CONCURRENT-LICENSE",
        )
        patient = Patient.objects.create(
            full_name="Concurrent Patient",
            dob=date(1995, 1, 1),
            gender="OTHER",
            phone_number="0000000012",
            registration_fee_status=Patient.RegistrationFeeStatusChoices.ELIGIBLE,
        )
        key = uuid4()
        barrier = Barrier(2)

        def submit_bill():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                serializer = RegistrationBillSerializer(data={
                    "patient": patient.patient_id,
                    "doctor": doctor.doc_id,
                    "visit_key": str(key),
                })
                serializer.is_valid(raise_exception=True)
                bill = serializer.save()
                return bill.bill_id
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            bill_ids = list(executor.map(lambda _index: submit_bill(), range(2)))
        self.assertEqual(len(set(bill_ids)), 1)
        self.assertEqual(RegistrationBill.objects.filter(visit_key=key).count(), 1)


@skipUnlessDBFeature("supports_transactions")
class AppointmentConcurrencyTestCase(TransactionTestCase):
    reset_sequences = True

    def test_same_doctor_slot_allows_only_one_concurrent_appointment(self):
        if connection.vendor != "mysql":
            self.skipTest("Appointment row-lock concurrency is required on MySQL.")
        user_model = get_user_model()
        role = Role.objects.create(role_name="DOCTOR")
        department = Department.objects.create(department_name="Concurrency Clinic")
        doctor_user = user_model.objects.create_user(username="appointment-concurrent-doctor")
        doctor_staff = Staff.objects.create(
            user=doctor_user, role=role, department=department,
            first_name="Concurrent", last_name="Doctor", dob=date(1980, 1, 1),
            gender="OTHER", phone_number="0000000021",
            email="appointment-concurrent@example.test",
        )
        doctor = Doctor.objects.create(
            staff=doctor_staff,
            specialization=Specialization.objects.create(spec_name="Appointment Concurrency"),
            consultation_fee="100.00", license_no="APPOINTMENT-CONCURRENT-LICENSE",
        )
        DoctorSession.objects.create(
            doctor=doctor, session=DoctorSession.SessionChoices.MORNING,
            start_time=time(8), end_time=time(17), is_active=True,
        )
        patients = [
            Patient.objects.create(
                full_name=f"Concurrency Patient {index}", dob=date(1995, 1, 1),
                gender="OTHER", phone_number=f"000000002{index + 2}",
            ) for index in range(2)
        ]
        barrier = Barrier(2)
        appointment_date = timezone.localdate()

        def create_appointment(patient_id):
            close_old_connections()
            try:
                serializer = AppointmentSerializer(data={
                    "patient": patient_id,
                    "doctor": doctor.doc_id,
                    "appointment_date": appointment_date.isoformat(),
                    "appointment_time_slot": "09:00:00",
                })
                serializer.is_valid(raise_exception=True)
                barrier.wait(timeout=10)
                try:
                    serializer.save()
                    return "created"
                except ValidationError:
                    return "conflict"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(create_appointment, [p.patient_id for p in patients]))
        self.assertCountEqual(outcomes, ["created", "conflict"])
        self.assertEqual(Appointment.objects.filter(
            doctor=doctor, appointment_date=appointment_date,
            appointment_time_slot=time(9),
        ).exclude(status=Appointment.StatusChoices.CANCELLED).count(), 1)


class BillingMigrationPreservationTestCase(TransactionTestCase):
    """Run the data migration only on Django's isolated test database."""

    migrate_from = [("cmsapp", "0004_pharmacybillitem_prescription_item")]
    migrate_to = [("cmsapp", "0005_billing_eligibility_visit_identity")]

    def test_migration_preserves_bill_amounts_and_does_not_link_old_visits(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps
        User = old_apps.get_model("auth", "User")
        RoleModel = old_apps.get_model("cmsapp", "Role")
        DepartmentModel = old_apps.get_model("cmsapp", "Department")
        SpecializationModel = old_apps.get_model("cmsapp", "Specialization")
        StaffModel = old_apps.get_model("cmsapp", "Staff")
        DoctorModel = old_apps.get_model("cmsapp", "Doctor")
        PatientModel = old_apps.get_model("cmsapp", "Patient")
        BillModel = old_apps.get_model("cmsapp", "RegistrationBill")
        user = User.objects.create(username="historical-migration-test")
        role = RoleModel.objects.create(role_name="MIGRATION TEST")
        department = DepartmentModel.objects.create(department_name="Migration Test")
        specialization = SpecializationModel.objects.create(spec_name="Migration Test")
        staff = StaffModel.objects.create(
            user_id=user.pk, role_id=role.pk, department_id=department.pk,
            first_name="History", last_name="Test", dob=date(1980, 1, 1),
            gender="OTHER", phone_number="0000000031", email="history@example.test",
        )
        doctor = DoctorModel.objects.create(
            staff_id=staff.pk, specialization_id=specialization.pk,
            consultation_fee="123.45", license_no="MIGRATION-TEST-LICENSE",
        )
        assessed = PatientModel.objects.create(
            full_name="Historical assessed", dob=date(1990, 1, 1),
            gender="OTHER", phone_number="0000000032",
        )
        review = PatientModel.objects.create(
            full_name="Historical review", dob=date(1991, 1, 1),
            gender="OTHER", phone_number="0000000033",
        )
        old_bill = BillModel.objects.create(
            patient_id=assessed.pk, doctor_id=doctor.pk,
            registration_fee="50.00", consultation_fee="123.45", total_amount="173.45",
            payment_status="PENDING", payment_method="",
        )
        original = (old_bill.registration_fee, old_bill.consultation_fee, old_bill.total_amount, old_bill.payment_status)

        try:
            executor = MigrationExecutor(connection)
            executor.migrate(self.migrate_to)
            new_apps = executor.loader.project_state(self.migrate_to).apps
            NewPatient = new_apps.get_model("cmsapp", "Patient")
            NewBill = new_apps.get_model("cmsapp", "RegistrationBill")
            new_bill = NewBill.objects.get(pk=old_bill.pk)
            self.assertEqual(
                (new_bill.registration_fee, new_bill.consultation_fee, new_bill.total_amount, new_bill.payment_status),
                original,
            )
            self.assertIsNone(new_bill.appointment_id)
            self.assertIsNone(new_bill.visit_key)
            self.assertEqual(NewPatient.objects.get(pk=assessed.pk).registration_fee_status, "ASSESSED")
            self.assertEqual(NewPatient.objects.get(pk=review.pk).registration_fee_status, "REVIEW")
        finally:
            MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())
