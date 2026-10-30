from datetime import date, time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from cmsapp.models import (
    Appointment,
    Consultation,
    Department,
    Doctor,
    DoctorSession,
    LabBill,
    LabBillItem,
    LabRequest,
    LabResult,
    MasterLabTest,
    MasterMedicine,
    Patient,
    RegistrationBill,
    Role,
    Specialization,
    Staff,
    StockRequest,
    PharmacyStock,
    Token,
)


class AdminManagementAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user_model = get_user_model()
        self.admin_role = Role.objects.create(role_name="ADMIN")
        self.department = Department.objects.create(department_name="Admin Clinic")
        self.admin = self.user_model.objects.create_user(
            username="admin-test", password="test-password-123"
        )
        Staff.objects.create(
            user=self.admin, role=self.admin_role, department=self.department,
            first_name="Admin", last_name="Test", dob=date(1980, 1, 1),
            gender="OTHER", phone_number="0000000101", email="admin@example.test",
        )
        self.client.force_authenticate(user=self.admin)

    def make_staff(self, role_name, username, *, active=True):
        role, _ = Role.objects.get_or_create(role_name=role_name)
        user = self.user_model.objects.create_user(
            username=username, password="test-password-123", is_active=active,
        )
        staff = Staff.objects.create(
            user=user, role=role, department=self.department,
            first_name="Test", last_name=username, dob=date(1985, 1, 1),
            gender="OTHER", phone_number="0000000102", email=f"{username}@example.test",
            is_active=active,
        )
        return staff

    def dob_for_age(self, years):
        today = timezone.localdate()
        try:
            return date(today.year - years, today.month, today.day)
        except ValueError:
            return date(today.year - years, today.month, 28)

    def make_doctor_profile(self, staff=None, specialization=None):
        staff = staff or self.make_staff("DOCTOR", "doctor-account")
        specialization = specialization or Specialization.objects.get_or_create(
            spec_name="General Medicine"
        )[0]
        response = self.client.post("/api/auth/doctors/", {
            "staff": staff.staff_id,
            "specialization": specialization.spec_id,
            "consultation_fee": "500.00",
            "license_no": f"LICENSE-{staff.staff_id}",
            "qualification": "MBBS",
            "exp_year": 5,
            "sessions": [{
                "session": DoctorSession.SessionChoices.MORNING,
                "start_time": "08:00:00",
                "end_time": "12:00:00",
            }],
        }, format="json")
        return response

    def test_admin_apis_reject_non_admin_and_anonymous_users(self):
        receptionist = self.make_staff("RECEPTIONIST", "reception-test")
        self.client.force_authenticate(user=receptionist.user)
        for path in (
            "/api/auth/doctors/",
            "/api/auth/departments/",
            "/api/auth/specializations/",
            "/api/auth/lab-tests/",
            "/api/auth/staff/",
        ):
            self.assertEqual(self.client.get(path).status_code, 403, path)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get("/api/auth/doctors/").status_code, (401, 403))

    def test_doctor_profile_creation_activation_and_login_readiness(self):
        staff = self.make_staff("DOCTOR", "doctor-login-test")
        login = APIClient()
        denied_without_profile = login.post("/api/auth/login/", {
            "username": staff.user.username, "password": "test-password-123",
        }, format="json")
        self.assertEqual(denied_without_profile.status_code, 403)

        created = self.make_doctor_profile(staff=staff)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["staff"], staff.staff_id)
        self.assertEqual(created.data["consultation_fee"], "500.00")
        self.assertEqual(created.data["sessions"][0]["session"], "MORNING")
        self.assertTrue(DoctorSession.objects.filter(
            doctor_id=created.data["doc_id"], session="MORNING", is_active=True,
        ).exists())
        self.assertEqual(login.post("/api/auth/login/", {
            "username": staff.user.username, "password": "test-password-123",
        }, format="json").status_code, 200)

        deactivated = self.client.patch(
            f"/api/auth/doctors/{created.data['doc_id']}/", {"is_active": False}, format="json"
        )
        self.assertEqual(deactivated.status_code, 200)
        self.assertEqual(login.post("/api/auth/login/", {
            "username": staff.user.username, "password": "test-password-123",
        }, format="json").status_code, 403)
        staff.user.is_active = False
        staff.user.save(update_fields=["is_active"])
        self.client.patch(
            f"/api/auth/doctors/{created.data['doc_id']}/", {"is_active": True}, format="json"
        )
        self.assertEqual(login.post("/api/auth/login/", {
            "username": staff.user.username, "password": "test-password-123",
        }, format="json").status_code, 401)

    def test_doctor_sessions_can_be_updated_and_missing_sessions_are_rejected(self):
        staff = self.make_staff("DOCTOR", "doctor-session-update")
        response = self.make_doctor_profile(staff=staff)
        self.assertEqual(response.status_code, 201)
        doctor_id = response.data["doc_id"]
        updated = self.client.patch(f"/api/auth/doctors/{doctor_id}/", {
            "sessions": [
                {"session": "MORNING", "start_time": "07:30:00", "end_time": "11:30:00"},
                {"session": "EVENING", "start_time": "16:00:00", "end_time": "20:00:00"},
            ],
        }, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual({row["session"] for row in updated.data["sessions"] if row["is_active"]}, {"MORNING", "EVENING"})
        invalid = self.client.patch(f"/api/auth/doctors/{doctor_id}/", {"sessions": []}, format="json")
        self.assertEqual(invalid.status_code, 400)
        invalid_time = self.client.patch(f"/api/auth/doctors/{doctor_id}/", {
            "sessions": [{"session": "MORNING", "start_time": "12:00:00", "end_time": "08:00:00"}],
        }, format="json")
        self.assertEqual(invalid_time.status_code, 400)
        self.assertEqual(DoctorSession.objects.filter(doctor_id=doctor_id, is_active=True).count(), 2)

    def test_doctor_creation_requires_at_least_one_session(self):
        staff = self.make_staff("DOCTOR", "doctor-session-required")
        specialization = Specialization.objects.create(spec_name="Session Required")
        response = self.client.post("/api/auth/doctors/", {
            "staff": staff.staff_id,
            "specialization": specialization.spec_id,
            "consultation_fee": "500.00",
            "license_no": "SESSION-REQUIRED-1",
            "qualification": "MBBS",
            "exp_year": 5,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Doctor.objects.filter(staff=staff).exists())

    def test_duplicate_doctor_profile_is_rejected(self):
        staff = self.make_staff("DOCTOR", "doctor-duplicate-test")
        self.assertEqual(self.make_doctor_profile(staff=staff).status_code, 201)
        duplicate = self.make_doctor_profile(staff=staff)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(Doctor.objects.filter(staff=staff).count(), 1)

    def test_staff_activation_synchronizes_user_account(self):
        staff = self.make_staff("RECEPTIONIST", "staff-status-test")
        deactivated = self.client.patch(
            f"/api/auth/staff/{staff.staff_id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(deactivated.status_code, 200)
        staff.refresh_from_db()
        staff.user.refresh_from_db()
        self.assertFalse(staff.is_active)
        self.assertFalse(staff.user.is_active)

        reactivated = self.client.patch(
            f"/api/auth/staff/{staff.staff_id}/", {"is_active": True}, format="json"
        )
        self.assertEqual(reactivated.status_code, 200)
        staff.refresh_from_db()
        staff.user.refresh_from_db()
        self.assertTrue(staff.is_active)
        self.assertTrue(staff.user.is_active)

    def test_staff_create_and_update_require_active_role_and_department(self):
        inactive_role = Role.objects.create(role_name="INACTIVE ROLE", is_active=False)
        inactive_department = Department.objects.create(
            department_name="Inactive Department", is_active=False,
        )
        valid_department = Department.objects.create(department_name="Valid Department")
        create_payload = {
            "username": "inactive-role-create", "password": "password-12345",
            "first_name": "New", "last_name": "Staff", "email": "newstaff@example.test",
            "dob": "1990-01-01", "gender": "OTHER", "phone_number": "0000000103",
            "role": inactive_role.role_id, "department": valid_department.department_id,
        }
        self.assertEqual(self.client.post("/api/auth/staff/", create_payload, format="json").status_code, 400)
        create_payload.update({
            "username": "inactive-dept-create", "email": "anotherstaff@example.test",
            "role": self.admin_role.role_id, "department": inactive_department.department_id,
        })
        self.assertEqual(self.client.post("/api/auth/staff/", create_payload, format="json").status_code, 400)

        staff = self.make_staff("RECEPTIONIST", "staff-assignment-test")
        self.assertEqual(self.client.patch(
            f"/api/auth/staff/{staff.staff_id}/", {"role": inactive_role.role_id}, format="json"
        ).status_code, 400)
        self.assertEqual(self.client.patch(
            f"/api/auth/staff/{staff.staff_id}/", {"department": inactive_department.department_id}, format="json"
        ).status_code, 400)

    def test_staff_age_validation_rejects_25_and_accepts_26_on_create_and_update(self):
        role = self.admin_role
        department = self.department
        payload = {
            "username": "age-validation-create",
            "password": "password-12345",
            "first_name": "Age",
            "last_name": "Check",
            "email": "age-check@example.test",
            "dob": self.dob_for_age(25).isoformat(),
            "gender": "OTHER",
            "phone_number": "0000000111",
            "role": role.role_id,
            "department": department.department_id,
        }
        rejected = self.client.post("/api/auth/staff/", payload, format="json")
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("Staff must be older than 25 years.", str(rejected.data["dob"]))

        payload.update({
            "username": "age-validation-create-26",
            "email": "age-check-26@example.test",
            "dob": self.dob_for_age(26).isoformat(),
        })
        accepted = self.client.post("/api/auth/staff/", payload, format="json")
        self.assertEqual(accepted.status_code, 201)
        staff_id = accepted.data["staff_id"]

        rejected_update = self.client.patch(
            f"/api/auth/staff/{staff_id}/", {"dob": self.dob_for_age(25).isoformat()}, format="json"
        )
        self.assertEqual(rejected_update.status_code, 400)
        self.assertIn("Staff must be older than 25 years.", str(rejected_update.data["dob"]))
        accepted_update = self.client.patch(
            f"/api/auth/staff/{staff_id}/", {"dob": self.dob_for_age(26).isoformat()}, format="json"
        )
        self.assertEqual(accepted_update.status_code, 200)

    def test_department_and_specialization_deactivation_preserves_links(self):
        department_response = self.client.post(
            "/api/auth/departments/", {"department_name": "Linked Department"}, format="json"
        )
        specialization_response = self.client.post(
            "/api/auth/specializations/", {"spec_name": "Linked Specialization"}, format="json"
        )
        self.assertEqual(department_response.status_code, 201)
        self.assertEqual(specialization_response.status_code, 201)
        department = Department.objects.get(pk=department_response.data["department_id"])
        staff = self.make_staff("RECEPTIONIST", "linked-department-staff")
        staff.department = department
        staff.save(update_fields=["department"])
        specialization = Specialization.objects.get(pk=specialization_response.data["spec_id"])
        doctor_response = self.make_doctor_profile(staff=self.make_staff("DOCTOR", "linked-spec-doctor"), specialization=specialization)
        doctor_id = doctor_response.data["doc_id"]

        department_deleted = self.client.delete(f"/api/auth/departments/{department.department_id}/")
        specialization_deleted = self.client.delete(f"/api/auth/specializations/{specialization.spec_id}/")
        self.assertEqual(department_deleted.status_code, 204)
        self.assertEqual(specialization_deleted.status_code, 204)
        staff.refresh_from_db()
        doctor = Doctor.objects.get(doc_id=doctor_id)
        self.assertEqual(staff.department_id, department.department_id)
        self.assertFalse(Department.objects.get(pk=department.pk).is_active)
        self.assertEqual(doctor.specialization_id, specialization.spec_id)
        self.assertFalse(Specialization.objects.get(pk=specialization.pk).is_active)

    def test_lab_test_deactivation_preserves_request_bill_and_result_records(self):
        patient = Patient.objects.create(
            full_name="Lab History Patient", dob=date(1990, 1, 1), gender="OTHER",
            phone_number="0000000104",
        )
        doctor_staff = self.make_staff("DOCTOR", "lab-history-doctor")
        specialization = Specialization.objects.create(spec_name="Lab History Specialty")
        doctor = Doctor.objects.create(
            staff=doctor_staff, specialization=specialization,
            consultation_fee="500.00", license_no="LAB-HISTORY-LICENSE",
        )
        registration_bill = RegistrationBill.objects.create(
            patient=patient, doctor=doctor, registration_fee="0.00",
            consultation_fee="500.00", total_amount="500.00",
            payment_status=RegistrationBill.PaymentStatusChoices.PAID,
            payment_method=RegistrationBill.PaymentMethodChoices.CASH,
        )
        token = Token.objects.create(
            patient=patient, doctor=doctor, bill=registration_bill,
            token_number=1, token_date=timezone.localdate(), session=Token.SessionChoices.MORNING,
        )
        consultation = Consultation.objects.create(token=token, patient=patient, doctor=doctor)
        create_response = self.client.post("/api/auth/lab-tests/", {
            "test_name": "Historical Test", "test_type": "Chemistry",
            "description": "Preserve linked records.", "test_price": "100.00",
            "min_value": "0", "max_value": "200", "is_active": True,
        }, format="json")
        self.assertEqual(create_response.status_code, 201)
        lab_test = MasterLabTest.objects.get(pk=create_response.data["test_id"])
        lab_request = LabRequest.objects.create(consultation=consultation, test=lab_test)
        lab_bill = LabBill.objects.create(patient=patient, total_amount="100.00")
        bill_item = LabBillItem.objects.create(
            lab_bill=lab_bill, lab_request=lab_request, quantity=1,
            unit_price="100.00", line_amount="100.00",
        )
        technician = self.make_staff("LAB_TECHNICIAN", "lab-history-technician")
        result = LabResult.objects.create(
            lab_request=lab_request, technician=technician, bill=lab_bill,
            result_value="Normal",
        )

        response = self.client.patch(
            f"/api/auth/lab-tests/{lab_test.test_id}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        lab_test.refresh_from_db()
        self.assertFalse(lab_test.is_active)
        self.assertTrue(LabRequest.objects.filter(pk=lab_request.pk, test=lab_test).exists())
        self.assertTrue(LabBillItem.objects.filter(pk=bill_item.pk, lab_bill=lab_bill).exists())
        self.assertTrue(LabResult.objects.filter(pk=result.pk, lab_request=lab_request).exists())

    def test_pharmacy_and_laboratory_staff_can_submit_and_only_view_their_own_requests(self):
        pharmacy_department = Department.objects.create(department_name="Pharmacy")
        lab_department = Department.objects.create(department_name="Laboratory")
        medicine = MasterMedicine.objects.create(name="Request Test Medicine")
        stock = PharmacyStock.objects.create(
            medicine=medicine, quantity=3, unit_cost_price="2.00",
            selling_price="4.00", reorder_level=1,
        )
        pharmacist = self.make_staff("PHARMACIST", "stock-pharmacist")
        pharmacist.department = pharmacy_department
        pharmacist.save(update_fields=["department"])
        laboratory_user = self.user_model.objects.create_user(
            username="stock-lab", password="test-password-123"
        )
        laboratory_staff = Staff.objects.create(
            user=laboratory_user, role=Role.objects.create(role_name="LAB_TECHNICIAN"),
            department=lab_department, first_name="Lab", last_name="Test",
            dob=date(1985, 1, 1), gender="OTHER", phone_number="0000000108",
            email="stock-lab@example.test",
        )

        self.client.force_authenticate(user=pharmacist.user)
        pharmacy_response = self.client.post("/api/auth/stock-requests/", {
            "medicine": medicine.medicine_id, "requested_quantity": 20,
            "reason": "Reorder threshold reached.",
        }, format="json")
        self.assertEqual(pharmacy_response.status_code, 201)
        pharmacy_request_id = pharmacy_response.data["request_id"]
        self.assertEqual(self.client.get("/api/auth/stock-requests/admin/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/monthly-bills/").status_code, 403)
        self.assertEqual(self.client.post(
            f"/api/auth/stock-requests/{pharmacy_request_id}/review/", {"status": "APPROVED"}, format="json"
        ).status_code, 403)

        self.client.force_authenticate(user=laboratory_user)
        lab_response = self.client.post("/api/auth/stock-requests/", {
            "item_name": "Specimen collection tubes", "requested_quantity": 50,
            "reason": "Current supply is low.",
        }, format="json")
        self.assertEqual(lab_response.status_code, 201)
        self.assertEqual(self.client.get("/api/auth/stock-requests/admin/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/monthly-bills/").status_code, 403)
        own_requests = self.client.get("/api/auth/stock-requests/")
        self.assertEqual(len(own_requests.data), 1)
        self.assertEqual(own_requests.data[0]["department"], "LABORATORY")

        self.client.force_authenticate(user=self.admin)
        admin_rows = self.client.get("/api/auth/stock-requests/admin/")
        self.assertEqual(admin_rows.status_code, 200)
        self.assertEqual(len(admin_rows.data), 2)
        review_response = self.client.post(
            f"/api/auth/stock-requests/{pharmacy_request_id}/review/",
            {"status": "APPROVED", "review_note": "Proceed with purchasing."},
            format="json",
        )
        self.assertEqual(review_response.status_code, 200)
        request_record = StockRequest.objects.get(pk=pharmacy_request_id)
        self.assertEqual(request_record.reviewed_by_id, Staff.objects.get(user=self.admin).staff_id)
        self.assertEqual(request_record.status, "APPROVED")
        self.assertEqual(request_record.approved_quantity, 20)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 23)

    def test_stock_request_endpoints_are_denied_to_unrelated_roles(self):
        receptionist = self.make_staff("RECEPTIONIST", "stock-receptionist")
        pharmacist = self.make_staff("PHARMACIST", "stock-pharmacist-no-dept")
        self.client.force_authenticate(user=pharmacist.user)
        self.assertEqual(self.client.get("/api/auth/stock-requests/admin/").status_code, 403)
        self.assertEqual(self.client.post(
            "/api/auth/stock-requests/", {"item_name": "item", "requested_quantity": 1, "reason": "test"}, format="json"
        ).status_code, 403)
        self.client.force_authenticate(user=receptionist.user)
        self.assertEqual(self.client.get("/api/auth/stock-requests/").status_code, 403)
        self.assertEqual(self.client.get("/api/auth/monthly-bills/").status_code, 403)

    def test_admin_monthly_bills_endpoint_and_admin_only_permission(self):
        response = self.client.get("/api/auth/monthly-bills/?year=2026&month=10")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["year"], 2026)
        self.assertIn("general_total", response.data["summary"])
        self.assertEqual(response.data["summary"]["general_total"]["billed"], "0.00")
        self.assertEqual(self.client.get("/api/auth/monthly-bills/?year=2026&month=13").status_code, 400)
