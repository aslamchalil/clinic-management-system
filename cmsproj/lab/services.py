# lab/services.py
"""
Lab business logic.

Views stay thin; every rule from the master context that a ForeignKey cannot
enforce lives here, and every multi-step change runs inside transaction.atomic().

LabRequest lifecycle (this is the ONLY place statuses are changed):

    REQUESTED --create_lab_bill--> BILLED --mark_bill_paid--> PAID
    BILLED --cancel_lab_bill--> REQUESTED
    PAID --start_processing--> IN_PROGRESS --enter_result--> COMPLETED
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import prefetch_related_objects
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from cmsapp.models import LabBill, LabBillItem, LabRequest, LabResult

from .permissions import LAB_TECHNICIAN, get_active_staff

# --- status constants -------------------------------------------------------
# Taken from the TextChoices already defined in cmsapp.models, so the strings
# are never typed by hand here.
_RS = LabRequest.StatusChoices
REQUESTED, BILLED, PAID = _RS.REQUESTED, _RS.BILLED, _RS.PAID
IN_PROGRESS, COMPLETED = _RS.IN_PROGRESS, _RS.COMPLETED
_BS = LabBill.PaymentStatusChoices
BILL_PENDING, BILL_PAID, BILL_CANCELLED = _BS.PENDING, _BS.PAID, _BS.CANCELLED


class StateConflict(APIException):
    """409 - the object is not in the right state for this action."""
    status_code = 409
    default_detail = "This action is not allowed in the current state."
    default_code = "state_conflict"


class PaymentRequired(APIException):
    """402 - a lab test cannot be processed without a PAID bill."""
    status_code = 402
    default_detail = "The lab bill for this request has not been paid."
    default_code = "payment_required"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def get_paid_bill_for_request(lab_request):
    """
    Return the PAID LabBill that actually contains THIS lab request.

    LabResult.bill being a ForeignKey proves nothing about payment, so we walk
    LabBillItem -> LabBill and check payment_status ourselves.
    """
    item = (
        LabBillItem.objects.select_related("lab_bill")
        .filter(lab_request=lab_request, lab_bill__payment_status=BILL_PAID)
        .order_by("-lab_bill__bill_date")
        .first()
    )
    if item is None:
        raise PaymentRequired()
    return item.lab_bill


def _lock_bill(bill_id):
    try:
        return LabBill.objects.select_for_update().get(pk=bill_id)
    except LabBill.DoesNotExist:
        raise NotFound("Lab bill not found.")


def _lock_request(request_id):
    try:
        return LabRequest.objects.select_for_update().get(pk=request_id)
    except LabRequest.DoesNotExist:
        raise NotFound("Lab request not found.")


def _bill_requests_locked(bill):
    """Lock and return the LabRequests that belong to this bill."""
    ids = list(LabBillItem.objects.filter(lab_bill=bill).values_list("lab_request_id", flat=True))
    if not ids:
        raise StateConflict("This bill has no items.")
    return list(LabRequest.objects.select_for_update().filter(pk__in=ids).order_by("pk"))


# ---------------------------------------------------------------------------
# 1. billing
# ---------------------------------------------------------------------------
def create_lab_bill(*, lab_request_ids):
    """
    Create ONE LabBill (+ one LabBillItem per request) for a set of REQUESTED
    lab requests that all belong to the same patient. Requests become BILLED.
    """
    ids = sorted(set(lab_request_ids))

    with transaction.atomic():
        # Lock rows (ordered by pk to avoid deadlocks) so two receptionists /
        # technicians cannot bill the same request at the same time.
        requests = list(LabRequest.objects.select_for_update().filter(pk__in=ids).order_by("pk"))

        missing = set(ids) - {r.pk for r in requests}
        if missing:
            raise ValidationError({"lab_request_ids": f"Lab requests not found: {sorted(missing)}"})

        prefetch_related_objects(requests, "consultation", "test")

        problems = []
        for r in requests:
            if not r.is_active:
                problems.append(f"Request {r.pk} is inactive.")
            elif r.status != REQUESTED:
                problems.append(f"Request {r.pk} is {r.status}; only REQUESTED requests can be billed.")
            elif not r.test.is_active:
                problems.append(f"Test '{r.test.test_name}' (request {r.pk}) is no longer offered.")
        if problems:
            raise ValidationError({"lab_request_ids": problems})

        patient_ids = {r.consultation.patient_id for r in requests}
        if len(patient_ids) != 1:
            raise ValidationError({"lab_request_ids": "All requests on one bill must belong to the same patient."})

        # Price is snapshotted from MasterLabTest so later price changes never
        # rewrite historical bills.
        items, total = [], Decimal("0.00")
        bill = LabBill.objects.create(
            patient_id=patient_ids.pop(),
            total_amount=Decimal("0.00"),
            payment_status=BILL_PENDING,
        )
        for r in requests:
            unit_price = r.test.test_price
            line_amount = unit_price * 1
            total += line_amount
            items.append(
                LabBillItem(lab_bill=bill, lab_request=r, quantity=1,
                            unit_price=unit_price, line_amount=line_amount)
            )
        LabBillItem.objects.bulk_create(items)

        bill.total_amount = total
        bill.save(update_fields=["total_amount"])

        LabRequest.objects.filter(pk__in=ids).update(status=BILLED)
        return bill


def mark_bill_paid(*, bill_id, payment_method):
    """PENDING -> PAID, and cascade REQUEST status BILLED -> PAID atomically."""
    with transaction.atomic():
        bill = _lock_bill(bill_id)
        if bill.payment_status != BILL_PENDING:
            raise StateConflict(f"Bill is already {bill.payment_status}.")

        requests = _bill_requests_locked(bill)
        wrong = [r.pk for r in requests if r.status != BILLED]
        if wrong:
            raise StateConflict(f"Requests {wrong} are not in BILLED state; cannot confirm payment.")

        bill.payment_status = BILL_PAID
        bill.payment_method = payment_method
        bill.save(update_fields=["payment_status", "payment_method"])
        LabRequest.objects.filter(pk__in=[r.pk for r in requests]).update(status=PAID)
        return bill


def cancel_bill(*, bill_id):
    """Cancel an UNPAID bill and release its requests back to REQUESTED."""
    with transaction.atomic():
        bill = _lock_bill(bill_id)
        if bill.payment_status != BILL_PENDING:
            raise StateConflict(
                f"Only PENDING bills can be cancelled (this one is {bill.payment_status})."
            )
        requests = _bill_requests_locked(bill)
        bill.payment_status = BILL_CANCELLED
        bill.save(update_fields=["payment_status"])
        LabRequest.objects.filter(
            pk__in=[r.pk for r in requests], status=BILLED
        ).update(status=REQUESTED)
        return bill


# ---------------------------------------------------------------------------
# 2. processing
# ---------------------------------------------------------------------------
def start_processing(*, lab_request_id):
    """PAID -> IN_PROGRESS. Re-verifies payment against the actual bill."""
    with transaction.atomic():
        req = _lock_request(lab_request_id)
        if not req.is_active:
            raise StateConflict("This lab request is inactive.")
        if req.status != PAID:
            if req.status in (REQUESTED, BILLED):
                raise PaymentRequired()
            raise StateConflict(f"Request is {req.status}; only PAID requests can be started.")
        get_paid_bill_for_request(req)  # raises PaymentRequired if not really paid
        req.status = IN_PROGRESS
        req.save(update_fields=["status"])
        return req


def enter_result(*, lab_request, technician_user, data):
    """
    Create the LabResult for an IN_PROGRESS request and mark it COMPLETED.

    `technician` and `bill` are decided by the SERVER, never by the client.
    """
    staff = get_active_staff(technician_user)
    if staff is None or staff.role.role_name != LAB_TECHNICIAN:
        raise PermissionDenied("Only an active LAB_TECHNICIAN can enter results.")

    with transaction.atomic():
        req = _lock_request(lab_request.pk)
        if req.status != IN_PROGRESS:
            raise StateConflict(
                f"Request is {req.status}; results can only be entered for IN_PROGRESS requests."
            )
        if LabResult.objects.filter(lab_request=req).exists():
            raise StateConflict("A result already exists for this lab request.")

        bill = get_paid_bill_for_request(req)

        data = dict(data)
        data.pop("lab_request", None)
        if not data.get("reference_range"):
            test = req.test
            if test.min_value is not None and test.max_value is not None:
                data["reference_range"] = f"{test.min_value} - {test.max_value}"

        result = LabResult.objects.create(
            lab_request=req,
            technician=staff,
            bill=bill,
            **data,
        )
        req.status = COMPLETED
        req.save(update_fields=["status"])
        return result