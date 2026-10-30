from datetime import date

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase

# Create your tests here.


class PharmacyDispensingApprovalMigrationTestCase(TransactionTestCase):
    """Verify the 0007 backfills on the isolated Django test database."""

    migrate_from = [("cmsapp", "0006_stockrequest")]
    migrate_to = [("cmsapp", "0007_pharmacy_dispensing_approval")]

    def test_backfills_paid_linked_bills_and_approved_quantities_only(self):
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps

        try:
            User = old_apps.get_model("auth", "User")
            Role = old_apps.get_model("cmsapp", "Role")
            Department = old_apps.get_model("cmsapp", "Department")
            Staff = old_apps.get_model("cmsapp", "Staff")
            Specialization = old_apps.get_model("cmsapp", "Specialization")
            Doctor = old_apps.get_model("cmsapp", "Doctor")
            Patient = old_apps.get_model("cmsapp", "Patient")
            RegistrationBill = old_apps.get_model("cmsapp", "RegistrationBill")
            Token = old_apps.get_model("cmsapp", "Token")
            Consultation = old_apps.get_model("cmsapp", "Consultation")
            Prescription = old_apps.get_model("cmsapp", "Prescription")
            MasterMedicine = old_apps.get_model("cmsapp", "MasterMedicine")
            Dosage = old_apps.get_model("cmsapp", "Dosage")
            PrescriptionItem = old_apps.get_model("cmsapp", "PrescriptionItem")
            PharmacyBill = old_apps.get_model("cmsapp", "PharmacyBill")
            PharmacyBillItem = old_apps.get_model("cmsapp", "PharmacyBillItem")
            StockRequest = old_apps.get_model("cmsapp", "StockRequest")

            role = Role.objects.create(role_name="Migration Test")
            department = Department.objects.create(department_name="Migration Test")
            user = User.objects.create(username="pharmacy-migration-test")
            staff = Staff.objects.create(
                user_id=user.pk,
                role_id=role.pk,
                department_id=department.pk,
                first_name="Pharmacy",
                last_name="Migration Test",
                dob=date(1980, 1, 1),
                gender="OTHER",
                phone_number="0000000011",
                email="pharmacy-migration@example.test",
            )
            specialization = Specialization.objects.create(spec_name="Migration Test")
            doctor = Doctor.objects.create(
                staff_id=staff.pk,
                specialization_id=specialization.pk,
                consultation_fee="10.00",
                license_no="PHARMACY-MIGRATION-TEST",
            )
            patient = Patient.objects.create(
                full_name="Pharmacy Migration Test",
                dob=date(1990, 1, 1),
                gender="OTHER",
                phone_number="0000000012",
            )
            registration_bill = RegistrationBill.objects.create(
                patient_id=patient.pk,
                doctor_id=doctor.pk,
                consultation_fee="10.00",
                total_amount="10.00",
            )
            token = Token.objects.create(
                token_number=1,
                token_date=date(2026, 1, 1),
                session="MORNING",
                bill_id=registration_bill.pk,
                doctor_id=doctor.pk,
                patient_id=patient.pk,
            )
            consultation = Consultation.objects.create(
                patient_id=patient.pk,
                doctor_id=doctor.pk,
                token_id=token.pk,
            )
            prescription = Prescription.objects.create(consultation_id=consultation.pk)
            medicine = MasterMedicine.objects.create(name="Migration Test Medicine")
            dosage = Dosage.objects.create(
                medicine_id=medicine.pk,
                dosage_value="1.00",
                unit="tablet",
            )
            prescription_item = PrescriptionItem.objects.create(
                prescription_id=prescription.pk,
                medicine_id=medicine.pk,
                dosage_id=dosage.pk,
                frequency="Once daily",
                duration="1 day",
            )

            def make_bill(payment_status, link_item):
                bill = PharmacyBill.objects.create(
                    patient_id=patient.pk,
                    pharmacist_id=staff.pk,
                    total_amount="1.00",
                    payment_status=payment_status,
                )
                PharmacyBillItem.objects.create(
                    pharmacy_bill_id=bill.pk,
                    medicine_id=medicine.pk,
                    prescription_item_id=prescription_item.pk if link_item else None,
                    quantity_dispensed=1,
                    unit_selling_price="1.00",
                    line_amount="1.00",
                )
                return bill

            paid_linked = make_bill("PAID", True)
            paid_unlinked = make_bill("PAID", False)
            unpaid_linked = make_bill("PENDING", True)
            cancelled_linked = make_bill("CANCELLED", True)
            approved_request = StockRequest.objects.create(
                department="PHARMACY",
                item_name="Migration Test Medicine",
                requested_quantity=12,
                reason="Migration test",
                status="APPROVED",
                requested_by_id=staff.pk,
            )
            pending_request = StockRequest.objects.create(
                department="PHARMACY",
                item_name="Pending item",
                requested_quantity=7,
                reason="Migration test",
                status="PENDING",
                requested_by_id=staff.pk,
            )
            rejected_request = StockRequest.objects.create(
                department="PHARMACY",
                item_name="Rejected item",
                requested_quantity=9,
                reason="Migration test",
                status="REJECTED",
                requested_by_id=staff.pk,
            )
            paid_bill_date = paid_linked.bill_date

            executor = MigrationExecutor(connection)
            executor.migrate(self.migrate_to)
            new_apps = executor.loader.project_state(self.migrate_to).apps
            NewPharmacyBill = new_apps.get_model("cmsapp", "PharmacyBill")
            NewStockRequest = new_apps.get_model("cmsapp", "StockRequest")

            self.assertEqual(
                NewPharmacyBill.objects.get(pk=paid_linked.pk).dispensed_at,
                paid_bill_date,
            )
            self.assertIsNone(NewPharmacyBill.objects.get(pk=paid_unlinked.pk).dispensed_at)
            self.assertIsNone(NewPharmacyBill.objects.get(pk=unpaid_linked.pk).dispensed_at)
            self.assertIsNone(NewPharmacyBill.objects.get(pk=cancelled_linked.pk).dispensed_at)
            self.assertEqual(
                NewStockRequest.objects.get(pk=approved_request.pk).approved_quantity,
                12,
            )
            self.assertIsNone(NewStockRequest.objects.get(pk=pending_request.pk).approved_quantity)
            self.assertIsNone(NewStockRequest.objects.get(pk=rejected_request.pk).approved_quantity)
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
