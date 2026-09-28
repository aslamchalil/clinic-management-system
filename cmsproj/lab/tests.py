# lab/tests.py
"""
Workflow tests for the Lab module.

The `make_*` helpers below are the ONLY place that creates cmsapp rows.
If a model in cmsapp gains a new required field, fix it there.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from cmsapp.models import (
    Consultation, Department, Doctor, LabBill, LabRequest, LabResult,
    MasterLabTest, Patient, RegistrationBill, Role, Specialization, Staff, Token,
)

User = get_user_model()


# ------------------------------------------------------------------ helpers
import itertools
from datetime import date

_counter = itertools.count(1)


def make_staff(username, role_name, dept):
    user = User.objects.create_user(username=username, password="pw")
    role, _ = Role.objects.get_or_create(role_name=role_name)
    staff = Staff.objects.create(
        user=user, role=role, department=dept, first_name=username, last_name="X",
        dob=date(1990, 1, 1), gender="OTHER", phone_number="9999999999", email=f"{username}@clinic.test",
    )
    return user, staff


def make_patient(name):
    return Patient.objects.create(full_name=name, dob=date(2000, 1, 1), gender="OTHER", phone_number="8888888888")


def make_doctor(staff, spec, license_no):
    return Doctor.objects.create(staff=staff, specialization=spec,
                                 consultation_fee=Decimal("500.00"), license_no=license_no)


def make_consultation(patient, doctor):
    """Consultation needs a Token, which needs a PAID RegistrationBill."""
    bill = RegistrationBill.objects.create(
        patient=patient, doctor=doctor, consultation_fee=Decimal("500.00"),
        total_amount=Decimal("500.00"), payment_status="PAID", payment_method="CASH",
    )
    token = Token.objects.create(
        patient=patient, doctor=doctor, bill=bill, token_number=next(_counter),
        token_date=date.today(), session="MORNING",
    )
    return Consultation.objects.create(token=token, patient=patient, doctor=doctor)


def make_lab_request(consultation, test, **kw):
    return LabRequest.objects.create(consultation=consultation, test=test, **kw)


# ------------------------------------------------------------------ tests
class LabWorkflowTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        dept = Department.objects.create(department_name="General")
        spec = Specialization.objects.create(spec_name="GP")
        cls.tech, cls.tech_staff = make_staff("tech", "LAB_TECHNICIAN", dept)
        cls.doc_user, doc_staff = make_staff("doc", "DOCTOR", dept)
        cls.other_doc_user, other_staff = make_staff("doc2", "DOCTOR", dept)
        cls.recep, _ = make_staff("recep", "RECEPTIONIST", dept)
        cls.doctor = make_doctor(doc_staff, spec, 'L1')
        cls.other_doctor = make_doctor(other_staff, spec, 'L2')

        cls.patient = make_patient("Asha")
        cls.patient2 = make_patient("Ravi")
        cls.cbc = MasterLabTest.objects.create(test_name="CBC", test_price=Decimal("300.00"),
                                               min_value=Decimal("4.00"), max_value=Decimal("11.00"))
        cls.sugar = MasterLabTest.objects.create(test_name="Sugar", test_price=Decimal("120.50"))
        cls.consult = make_consultation(cls.patient, cls.doctor)

    def setUp(self):
        self.r1 = make_lab_request(self.consult, self.cbc)
        self.r2 = make_lab_request(self.consult, self.sugar, priority="URGENT")

    # -- helpers
    def bill(self, ids=None):
        self.client.force_authenticate(self.tech)
        return self.client.post("/lab/bills/", {"lab_request_ids": ids or [self.r1.pk, self.r2.pk]}, format="json")

    def pay(self, bill_id, method="CASH"):
        return self.client.post(f"/lab/bills/{bill_id}/mark-paid/", {"payment_method": method}, format="json")

    # -- permissions
    def test_anonymous_and_wrong_role_blocked(self):
        self.assertEqual(self.client.get("/lab/requests/").status_code, 403)
        self.client.force_authenticate(self.recep)
        self.assertEqual(self.client.get("/lab/requests/").status_code, 403)
        self.assertEqual(self.client.post("/lab/bills/", {"lab_request_ids": [1]}, format="json").status_code, 403)

    def test_doctor_cannot_bill_or_enter_results(self):
        self.client.force_authenticate(self.doc_user)
        self.assertEqual(self.client.post("/lab/bills/", {"lab_request_ids": [self.r1.pk]}, format="json").status_code, 403)
        self.assertEqual(self.client.post("/lab/results/", {"lab_request": self.r1.pk, "result_value": "5"}, format="json").status_code, 403)

    # -- billing
    def test_bill_creation_snapshots_prices_and_marks_billed(self):
        resp = self.bill()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Decimal(resp.data["total_amount"]), Decimal("420.50"))
        self.assertEqual(resp.data["payment_status"], "PENDING")
        self.assertEqual(len(resp.data["items"]), 2)
        self.r1.refresh_from_db(); self.r2.refresh_from_db()
        self.assertEqual((self.r1.status, self.r2.status), ("BILLED", "BILLED"))

    def test_cannot_bill_same_request_twice(self):
        self.bill()
        self.assertEqual(self.bill([self.r1.pk]).status_code, 400)

    def test_cannot_mix_patients_on_one_bill(self):
        other = make_lab_request(make_consultation(self.patient2, self.doctor), self.cbc)
        self.assertEqual(self.bill([self.r1.pk, other.pk]).status_code, 400)

    def test_unknown_request_id_rejected(self):
        self.assertEqual(self.bill([99999]).status_code, 400)

    # -- payment
    def test_payment_cascades_to_requests_and_cannot_repeat(self):
        bid = self.bill().data["lab_bill_id"]
        resp = self.pay(bid, "UPI")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["payment_status"], "PAID")
        self.r1.refresh_from_db()
        self.assertEqual(self.r1.status, "PAID")
        self.assertEqual(self.pay(bid).status_code, 409)

    def test_client_cannot_inject_payment_status(self):
        bid = self.bill().data["lab_bill_id"]
        self.client.patch(f"/lab/bills/{bid}/", {"payment_status": "PAID"}, format="json")
        self.assertEqual(LabBill.objects.get(pk=bid).payment_status, "PENDING")
        self.assertEqual(self.pay(bid, "BITCOIN").status_code, 400)

    def test_cancel_releases_requests(self):
        bid = self.bill().data["lab_bill_id"]
        self.assertEqual(self.client.post(f"/lab/bills/{bid}/cancel/").status_code, 200)
        self.r1.refresh_from_db()
        self.assertEqual(self.r1.status, "REQUESTED")
        self.assertEqual(self.bill([self.r1.pk]).status_code, 201)   # can be re-billed

    def test_paid_bill_cannot_be_cancelled(self):
        bid = self.bill().data["lab_bill_id"]; self.pay(bid)
        self.assertEqual(self.client.post(f"/lab/bills/{bid}/cancel/").status_code, 409)

    # -- processing gate (the lab payment rule)
    def test_cannot_start_unpaid_request(self):
        self.client.force_authenticate(self.tech)
        self.assertEqual(self.client.post(f"/lab/requests/{self.r1.pk}/start-processing/").status_code, 402)
        self.bill()
        self.assertEqual(self.client.post(f"/lab/requests/{self.r1.pk}/start-processing/").status_code, 402)

    def test_cannot_start_if_status_forced_but_bill_unpaid(self):
        """Status says PAID but no PAID bill exists -> still blocked."""
        LabRequest.objects.filter(pk=self.r1.pk).update(status="PAID")
        self.client.force_authenticate(self.tech)
        self.assertEqual(self.client.post(f"/lab/requests/{self.r1.pk}/start-processing/").status_code, 402)

    def test_cannot_enter_result_before_processing(self):
        bid = self.bill().data["lab_bill_id"]; self.pay(bid)
        resp = self.client.post("/lab/results/", {"lab_request": self.r1.pk, "result_value": "5"}, format="json")
        self.assertEqual(resp.status_code, 409)

    # -- full happy path
    def test_full_lab_workflow(self):
        bid = self.bill().data["lab_bill_id"]; self.pay(bid)
        self.assertEqual(self.client.post(f"/lab/requests/{self.r1.pk}/start-processing/").status_code, 200)
        self.assertEqual(self.client.post(f"/lab/requests/{self.r1.pk}/start-processing/").status_code, 409)

        resp = self.client.post("/lab/results/", {
            "lab_request": self.r1.pk, "result_value": "7.2", "unit": "x10^9/L", "report": "Within normal limits.",
            # technician / bill sent by a malicious client must be ignored:
            "technician": 999, "bill": 999,
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["reference_range"], "4.00 - 11.00")   # defaulted from master test
        res = LabResult.objects.get(pk=resp.data["result_id"])
        self.assertEqual(res.technician_id, self.tech_staff.pk)
        self.assertEqual(res.bill_id, bid)
        self.assertEqual(res.report, "Within normal limits.")
        self.r1.refresh_from_db(); self.assertEqual(self.r1.status, "COMPLETED")

        # second result for same request is refused
        dup = self.client.post("/lab/results/", {"lab_request": self.r1.pk, "result_value": "9"}, format="json")
        self.assertIn(dup.status_code, (400, 409))
        # results are immutable through the API
        self.assertEqual(self.client.patch(f"/lab/results/{res.pk}/", {"result_value": "1"}, format="json").status_code, 405)
        self.assertEqual(self.client.delete(f"/lab/results/{res.pk}/").status_code, 405)

    # -- doctor read access is scoped to own patients
    def test_doctor_sees_only_own_results(self):
        bid = self.bill().data["lab_bill_id"]; self.pay(bid)
        self.client.post(f"/lab/requests/{self.r1.pk}/start-processing/")
        self.client.post("/lab/results/", {"lab_request": self.r1.pk, "result_value": "7"}, format="json")

        self.client.force_authenticate(self.doc_user)
        self.assertEqual(len(self._rows("/lab/results/")), 1)
        self.client.force_authenticate(self.other_doc_user)
        self.assertEqual(len(self._rows("/lab/results/")), 0)
        self.assertEqual(len(self._rows("/lab/requests/")), 0)

    def _rows(self, url):
        """Works with or without DRF pagination enabled in settings."""
        data = self.client.get(url).data
        return data["results"] if isinstance(data, dict) and "results" in data else data

    # -- master tests are read-only in the lab module
    def test_master_tests_list_is_readable_but_not_writable(self):
        self.client.force_authenticate(self.tech)
        self.assertEqual(len(self._rows("/lab/master-tests/")), 2)
        resp = self.client.post("/lab/master-tests/", {"test_name": "X", "test_price": "1"}, format="json")
        self.assertEqual(resp.status_code, 405)
        self.client.force_authenticate(self.doc_user)
        self.assertEqual(self.client.get("/lab/master-tests/").status_code, 200)
        self.client.force_authenticate(self.recep)
        self.assertEqual(self.client.get("/lab/master-tests/").status_code, 403)