from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from cmsapp.models import (
    Consultation, Department, Doctor, Dosage, MasterMedicine, Patient,
    PharmacyBill, PharmacyStock, Prescription, PrescriptionItem,
    RegistrationBill, Role, Specialization, Staff, StockRequest, Token,
)


class PharmacyWorkflowAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user_model = get_user_model()
        pharmacy_department = Department.objects.create(department_name="Pharmacy")
        doctor_department = Department.objects.create(department_name="Medicine")
        self.pharmacist_role = Role.objects.create(role_name="PHARMACIST")
        doctor_role = Role.objects.create(role_name="DOCTOR")
        admin_role = Role.objects.create(role_name="ADMIN")
        self.pharmacist_user = user_model.objects.create_user(username="pharmacist", password="password")
        self.pharmacist = Staff.objects.create(
            user=self.pharmacist_user, role=self.pharmacist_role, department=pharmacy_department,
            first_name="Pharmacy", last_name="Staff", dob=date(1985, 1, 1), gender="OTHER",
            phone_number="9000000001", email="pharmacist@example.test",
        )
        self.admin_user = user_model.objects.create_user(username="admin-user", password="password")
        self.admin = Staff.objects.create(
            user=self.admin_user, role=admin_role, department=doctor_department,
            first_name="Admin", last_name="Staff", dob=date(1980, 1, 1), gender="OTHER",
            phone_number="9000000002", email="admin@example.test",
        )
        doctor_user = user_model.objects.create_user(username="doctor-user", password="password")
        doctor_staff = Staff.objects.create(
            user=doctor_user, role=doctor_role, department=doctor_department,
            first_name="Doctor", last_name="Staff", dob=date(1980, 1, 1), gender="OTHER",
            phone_number="9000000003", email="doctor@example.test",
        )
        specialization = Specialization.objects.create(spec_name="General Medicine")
        self.doctor = Doctor.objects.create(
            staff=doctor_staff, specialization=specialization,
            consultation_fee=Decimal("500.00"), license_no="PHARMACY-TEST-DOCTOR",
        )
        self.patient = Patient.objects.create(
            full_name="Test Patient", dob=date(1990, 1, 1), gender="OTHER",
            phone_number="9000000010", email="", address="", blood_group="",
            emergency_contact="", registration_fee_status=Patient.RegistrationFeeStatusChoices.ASSESSED,
        )
        registration_bill = RegistrationBill.objects.create(
            patient=self.patient, doctor=self.doctor, registration_fee=0,
            consultation_fee=Decimal("500.00"), total_amount=Decimal("500.00"),
            payment_status=RegistrationBill.PaymentStatusChoices.PAID,
        )
        token = Token.objects.create(
            patient=self.patient, doctor=self.doctor, bill=registration_bill,
            token_number=1, token_date=date.today(), session=Token.SessionChoices.MORNING,
        )
        consultation = Consultation.objects.create(
            token=token, patient=self.patient, doctor=self.doctor,
            symptoms="Test symptoms", diagnosis="Test diagnosis",
        )
        self.prescription = Prescription.objects.create(consultation=consultation)
        self.medicine = MasterMedicine.objects.create(name="Test medicine")
        dosage = Dosage.objects.create(medicine=self.medicine, dosage_value=Decimal("1"), unit="tablet")
        self.prescription_item = PrescriptionItem.objects.create(
            prescription=self.prescription, medicine=self.medicine, dosage=dosage,
            frequency="Once daily", duration="5 days", prescribed_quantity=5,
        )
        self.stock = PharmacyStock.objects.create(
            medicine=self.medicine, quantity=10,
            unit_cost_price=Decimal("2.00"), selling_price=Decimal("4.50"), reorder_level=2,
        )

    def test_admin_creates_medicine_with_dosages_for_doctor_selection(self):
        self.client.force_authenticate(self.admin_user)
        response = self.client.post("/api/pharmacy/medicines/", {
            "name": "Dosage Selector Medicine",
            "generic_name": "Example",
            "category": "Tablet",
            "dosages": [
                {"dosage_value": "250.00", "unit": "mg", "description": "Low strength"},
                {"dosage_value": "500.00", "unit": "mg", "description": "High strength"},
            ],
        }, format="json")
        self.assertEqual(response.status_code, 201)
        medicine_id = response.data["medicine_id"]
        self.assertEqual(len(response.data["dosages"]), 2)
        self.assertEqual(Dosage.objects.filter(medicine_id=medicine_id, is_active=True).count(), 2)
        dosage_ids = {row["dosage_id"] for row in response.data["dosages"]}
        edited = self.client.patch(f"/api/pharmacy/medicines/{medicine_id}/", {
            "dosages": [
                {**row, "description": f"Updated {row['description']}"}
                for row in response.data["dosages"]
            ],
        }, format="json")
        self.assertEqual(edited.status_code, 200)
        self.assertEqual({row["dosage_id"] for row in edited.data["dosages"]}, dosage_ids)
        self.assertEqual(Dosage.objects.filter(medicine_id=medicine_id).count(), 2)

        self.client.force_authenticate(self.doctor.staff.user)
        medicines = self.client.get("/api/doctor/medicines/")
        dosages = self.client.get(f"/api/doctor/dosages/?medicine_id={medicine_id}")
        self.assertEqual(medicines.status_code, 200)
        self.assertIn(medicine_id, [row["medicine_id"] for row in medicines.data])
        self.assertEqual({row["dosage_value"] for row in dosages.data}, {"250.00", "500.00"})

    def test_medicine_dosage_creation_rejects_missing_invalid_and_duplicate_options(self):
        self.client.force_authenticate(self.admin_user)
        base = {"name": "Invalid Dosage Medicine"}
        missing = self.client.post("/api/pharmacy/medicines/", base, format="json")
        invalid = self.client.post("/api/pharmacy/medicines/", {
            **base,
            "name": "Zero Dosage Medicine",
            "dosages": [{"dosage_value": "0", "unit": "mg"}],
        }, format="json")
        duplicate = self.client.post("/api/pharmacy/medicines/", {
            **base,
            "name": "Duplicate Dosage Medicine",
            "dosages": [
                {"dosage_value": "250", "unit": "mg"},
                {"dosage_value": "250.00", "unit": "MG"},
            ],
        }, format="json")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("Dosage value must be greater than zero.", str(invalid.data["dosages"]))
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("Duplicate dosage values and units are not allowed.", str(duplicate.data["dosages"]))

    def test_pharmacist_bill_price_is_server_derived_and_payment_does_not_deduct_stock(self):
        self.client.force_authenticate(self.pharmacist_user)
        response = self.client.post("/api/pharmacy/bills/", {
            "prescription": self.prescription.prescription_id,
            "items": [{"prescription_item": self.prescription_item.prescription_item_id, "quantity_dispensed": 3}],
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["total_amount"], "13.50")
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 10)
        bill_id = response.data["pharmacy_bill_id"]
        paid = self.client.patch(f"/api/pharmacy/bills/{bill_id}/payment/", {"payment_method": "CASH"}, format="json")
        self.assertEqual(paid.status_code, 200)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 10)
        retry = self.client.patch(f"/api/pharmacy/bills/{bill_id}/payment/", {"payment_method": "UPI"}, format="json")
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.data["payment_method"], "CASH")

    def test_bill_reservation_prevents_duplicate_quantity_and_dispensing_deducts_once(self):
        self.client.force_authenticate(self.pharmacist_user)
        payload = {"prescription": self.prescription.prescription_id, "items": [{"prescription_item": self.prescription_item.prescription_item_id, "quantity_dispensed": 5}]}
        bill_response = self.client.post("/api/pharmacy/bills/", payload, format="json")
        self.assertEqual(bill_response.status_code, 201)
        duplicate = self.client.post("/api/pharmacy/bills/", payload, format="json")
        self.assertEqual(duplicate.status_code, 400)
        bill_id = bill_response.data["pharmacy_bill_id"]
        self.assertEqual(self.client.post(f"/api/pharmacy/bills/{bill_id}/dispense/").status_code, 400)
        self.client.patch(f"/api/pharmacy/bills/{bill_id}/payment/", {"payment_method": "CARD"}, format="json")
        dispensed = self.client.post(f"/api/pharmacy/bills/{bill_id}/dispense/")
        self.assertEqual(dispensed.status_code, 200)
        self.stock.refresh_from_db()
        self.prescription_item.refresh_from_db()
        self.assertEqual(self.stock.quantity, 5)
        self.assertEqual(self.prescription_item.dispensed_quantity, 5)
        repeated = self.client.post(f"/api/pharmacy/bills/{bill_id}/dispense/")
        self.assertEqual(repeated.status_code, 200)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 5)

    def test_doctor_cannot_access_pharmacy_and_admin_approval_applies_final_quantity_once(self):
        self.client.force_authenticate(self.doctor.staff.user)
        self.assertEqual(self.client.get("/api/pharmacy/stock/").status_code, 403)
        stock_request = StockRequest.objects.create(
            department=StockRequest.DepartmentChoices.PHARMACY,
            item_name=self.medicine.name, medicine=self.medicine,
            requested_quantity=10, reason="Reorder required.", requested_by=self.pharmacist,
        )
        self.client.force_authenticate(self.admin_user)
        response = self.client.post(
            f"/api/auth/stock-requests/{stock_request.request_id}/review/",
            {"status": "APPROVED", "approved_quantity": 7}, format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.stock.refresh_from_db()
        stock_request.refresh_from_db()
        self.assertEqual(self.stock.quantity, 17)
        self.assertEqual(stock_request.approved_quantity, 7)
        repeated = self.client.post(
            f"/api/auth/stock-requests/{stock_request.request_id}/review/",
            {"status": "APPROVED", "approved_quantity": 7}, format="json",
        )
        self.assertEqual(repeated.status_code, 409)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 17)
