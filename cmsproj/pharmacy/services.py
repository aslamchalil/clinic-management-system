from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from cmsapp.models import (
    PharmacyBill,
    PharmacyBillItem,
    PharmacyStock,
    Prescription,
    PrescriptionItem,
)


@transaction.atomic
def create_prescription_bill(staff, payload):
    prescription_id = payload.get("prescription")
    entries = payload.get("items")
    if not prescription_id:
        raise ValidationError({"prescription": "Select a prescription."})
    if not isinstance(entries, list) or not entries:
        raise ValidationError({"items": "Provide at least one prescription item."})
    try:
        prescription = Prescription.objects.select_for_update().select_related(
            "consultation__patient"
        ).get(pk=prescription_id)
    except (Prescription.DoesNotExist, ValueError, TypeError):
        raise ValidationError({"prescription": "Prescription not found."})

    ids = []
    quantities = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValidationError({"items": "Each item must be an object."})
        try:
            item_id = int(entry.get("prescription_item"))
            quantity = int(entry.get("quantity_dispensed"))
        except (TypeError, ValueError):
            raise ValidationError({"items": "Prescription item IDs and quantities must be integers."})
        if item_id <= 0 or quantity <= 0 or quantity > 2147483647:
            raise ValidationError({"items": "Prescription item IDs and quantities must be positive."})
        ids.append(item_id)
        quantities[item_id] = quantity
    if len(ids) != len(set(ids)):
        raise ValidationError({"items": "A prescription item may appear only once in a bill."})

    rows = list(PrescriptionItem.objects.select_for_update().select_related(
        "medicine", "dosage", "prescription__consultation"
    ).filter(
        prescription=prescription,
        prescription_item_id__in=sorted(ids),
        is_active=True,
        medicine__is_active=True,
    ).order_by("prescription_item_id"))
    if len(rows) != len(ids):
        raise ValidationError({"items": "Every item must belong to the selected active prescription."})

    stocks = {}
    total = Decimal("0.00")
    for item in rows:
        stock = PharmacyStock.objects.select_for_update().select_related("medicine").filter(
            medicine_id=item.medicine_id,
            medicine__is_active=True,
        ).first()
        if stock is None:
            raise ValidationError({"stock": f"No stock price is configured for {item.medicine.name}."})
        already_reserved = PharmacyBillItem.objects.filter(
            prescription_item=item,
            pharmacy_bill__payment_status__in=[
                PharmacyBill.PaymentStatusChoices.PENDING,
                PharmacyBill.PaymentStatusChoices.PAID,
            ],
            pharmacy_bill__dispensed_at__isnull=True,
        ).aggregate(total=Sum("quantity_dispensed"))["total"] or 0
        remaining = item.prescribed_quantity - item.dispensed_quantity - already_reserved
        quantity = quantities[item.prescription_item_id]
        if quantity > remaining:
            raise ValidationError({
                "quantity_dispensed": f"Only {max(remaining, 0)} units remain available for {item.medicine.name}."
            })
        stocks[item.medicine_id] = stock
        total += stock.selling_price * quantity

    bill = PharmacyBill.objects.create(
        patient=prescription.consultation.patient,
        pharmacist=staff,
        total_amount=total,
    )
    PharmacyBillItem.objects.bulk_create([
        PharmacyBillItem(
            pharmacy_bill=bill,
            medicine=item.medicine,
            prescription_item=item,
            quantity_dispensed=quantities[item.prescription_item_id],
            unit_selling_price=stocks[item.medicine_id].selling_price,
            line_amount=stocks[item.medicine_id].selling_price * quantities[item.prescription_item_id],
        )
        for item in rows
    ])
    return bill


@transaction.atomic
def record_bill_payment(bill_id, payment_method):
    try:
        bill = PharmacyBill.objects.select_for_update().get(pk=bill_id)
    except PharmacyBill.DoesNotExist:
        raise ValidationError({"bill": "Pharmacy bill not found."})
    if bill.payment_status == PharmacyBill.PaymentStatusChoices.PAID:
        return bill, False
    if bill.payment_status != PharmacyBill.PaymentStatusChoices.PENDING:
        raise ValidationError({"payment_status": "Only pending Pharmacy bills can be paid."})
    allowed = [choice.value for choice in PharmacyBill.PaymentMethodChoices]
    if payment_method not in allowed:
        raise ValidationError({"payment_method": "Choose CASH, CARD, or UPI."})
    if not bill.items.exists():
        raise ValidationError({"bill": "Cannot pay a bill without items."})
    if bill.items.filter(prescription_item__isnull=True).exists():
        raise ValidationError({"prescription_item": "All bill items must be linked to a prescription."})
    bill.payment_method = payment_method
    bill.payment_status = PharmacyBill.PaymentStatusChoices.PAID
    bill.save(update_fields=["payment_method", "payment_status"])
    return bill, True


@transaction.atomic
def dispense_bill(bill_id):
    try:
        bill = PharmacyBill.objects.select_for_update().get(pk=bill_id)
    except PharmacyBill.DoesNotExist:
        raise ValidationError({"bill": "Pharmacy bill not found."})
    if bill.payment_status != PharmacyBill.PaymentStatusChoices.PAID:
        raise ValidationError({"payment_status": "Only paid bills can be dispensed."})
    if bill.dispensed_at:
        return bill, False

    items = list(bill.items.select_for_update().select_related(
        "medicine", "prescription_item__prescription__consultation"
    ).order_by("medicine_id", "item_bill_id"))
    if not items or any(item.prescription_item_id is None for item in items):
        raise ValidationError({"items": "The bill has no valid prescription-linked items."})

    prescription_items = {}
    stock_totals = {}
    stocks = {}
    for bill_item in items:
        prescription_item = PrescriptionItem.objects.select_for_update().get(
            pk=bill_item.prescription_item_id
        )
        if (
            prescription_item.medicine_id != bill_item.medicine_id
            or prescription_item.prescription.consultation.patient_id != bill.patient_id
        ):
            raise ValidationError({"items": "A bill item no longer matches its prescription or patient."})
        if prescription_item.dispensed_quantity + bill_item.quantity_dispensed > prescription_item.prescribed_quantity:
            raise ValidationError({"items": f"Dispensing exceeds the prescription for {bill_item.medicine.name}."})
        prescription_items[prescription_item.pk] = prescription_item
        stock_totals[bill_item.medicine_id] = stock_totals.get(bill_item.medicine_id, 0) + bill_item.quantity_dispensed

    for medicine_id, quantity in sorted(stock_totals.items()):
        stock = PharmacyStock.objects.select_for_update().select_related("medicine").filter(
            medicine_id=medicine_id, medicine__is_active=True
        ).first()
        if stock is None or stock.quantity < quantity:
            available = stock.quantity if stock else 0
            name = stock.medicine.name if stock else f"Medicine #{medicine_id}"
            raise ValidationError({"stock": f"Insufficient stock for {name}. Available: {available}; required: {quantity}."})
        stocks[medicine_id] = stock

    for medicine_id, quantity in stock_totals.items():
        stock = stocks[medicine_id]
        stock.quantity -= quantity
        stock.save(update_fields=["quantity"])
    for item in items:
        prescription_item = prescription_items[item.prescription_item_id]
        prescription_item.dispensed_quantity += item.quantity_dispensed
        prescription_item.dispensed_status = (
            PrescriptionItem.DispensedStatusChoices.DISPENSED
            if prescription_item.dispensed_quantity >= prescription_item.prescribed_quantity
            else PrescriptionItem.DispensedStatusChoices.PARTIALLY_DISPENSED
        )
        prescription_item.save(update_fields=["dispensed_quantity", "dispensed_status"])
    bill.dispensed_at = timezone.now()
    bill.save(update_fields=["dispensed_at"])
    return bill, True
