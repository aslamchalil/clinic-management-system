
from decimal import Decimal

from django.db import transaction

from django.http import request
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cmsapp.models import (
    Patient,
    PharmacyBill,
    PharmacyBillItem,
    PharmacyStock,
    Prescription,
    PrescriptionItem,
    MasterMedicine,
)

from .serializers import (
    PharmacyBillSerializer,
    PrescriptionSerializer,
    MasterMedicineSerializer,
    PharmacyStockSerializer,
)


# Common permission check for Pharmacy APIs
class PharmacistPermissionMixin:
    permission_classes = [IsAuthenticated]

    def check_pharmacist(self):
        user = self.request.user

        try:
            staff = user.staff_profile
        except Exception:
            raise PermissionDenied(
                "Your account is not linked to a staff profile."
            )

        if not staff.is_active or not staff.role.is_active:
            raise PermissionDenied(
                "Your staff account is inactive."
            )

        if staff.role.role_name.strip().upper() != "PHARMACIST":
            raise PermissionDenied(
                "Only pharmacists can access this API."
            )

        return staff


# 1. View prescriptions
class PharmacyPrescriptionListAPIView(
    PharmacistPermissionMixin,
    generics.ListAPIView,
):
    serializer_class = PrescriptionSerializer

    def get_queryset(self):
        self.check_pharmacist()

        return (
            Prescription.objects
            .select_related(
                "consultation",
                "consultation__patient",
                "consultation__doctor",
            )
            .prefetch_related(
                "items",
                "items__medicine",
                "items__dosage",
            )
            .order_by("-created_at")
        )


# 2. List and create medicines
class PharmacyMedicineListCreateAPIView(
    PharmacistPermissionMixin,
    generics.ListCreateAPIView,
):
    serializer_class = MasterMedicineSerializer

    def get_queryset(self):
        self.check_pharmacist()
        return MasterMedicine.objects.order_by("name")


# 3. View and update a medicine
class PharmacyMedicineDetailAPIView(
    PharmacistPermissionMixin,
    generics.RetrieveUpdateAPIView,
):
    serializer_class = MasterMedicineSerializer
    queryset = MasterMedicine.objects.all()
    lookup_field = "medicine_id"

    def get_object(self):
        self.check_pharmacist()
        return super().get_object()


# 4. List and create stock records
class PharmacyStockListCreateAPIView(
    PharmacistPermissionMixin,
    generics.ListCreateAPIView,
):
    serializer_class = PharmacyStockSerializer

    def get_queryset(self):
        self.check_pharmacist()

        return (
            PharmacyStock.objects
            .select_related("medicine")
            .order_by("medicine__name")
        )


# 5. View and update a stock record
class PharmacyStockDetailAPIView(
    PharmacistPermissionMixin,
    generics.RetrieveUpdateAPIView,
):
    serializer_class = PharmacyStockSerializer
    queryset = PharmacyStock.objects.select_related("medicine")
    lookup_field = "stock_id"

    def get_object(self):
        self.check_pharmacist()
        return super().get_object()


# 6. View and create pharmacy bills
class PharmacyBillAPIView(
    PharmacistPermissionMixin,
    APIView,
):

    # GET: List existing pharmacy bills
    def get(self, request):
        self.check_pharmacist()

        bills = (
            PharmacyBill.objects
            .select_related("patient", "pharmacist")
            .prefetch_related("items__medicine")
            .order_by("-bill_date")
        )

        serializer = PharmacyBillSerializer(
            bills,
            many=True,
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    # POST: Create a pharmacy bill
    @transaction.atomic
    def post(self, request):
        staff = self.check_pharmacist()

        patient_id = request.data.get("patient")
        items = request.data.get("items")

        if not patient_id:
            raise ValidationError({
                "patient": "Patient ID is required."
            })

        if not isinstance(items, list) or not items:
            raise ValidationError({
                "items": "Provide at least one medicine item."
            })

        try:
            patient = Patient.objects.get(
                patient_id=patient_id,
                is_active=True,
            )
        except (Patient.DoesNotExist, ValueError, TypeError):
            raise ValidationError({
                "patient": "Active patient not found."
            })

        validated_items = []
        stock_totals = {}

        for item in items:
            if not isinstance(item, dict):
                raise ValidationError({
                    "items": "Each item must be an object."
                })

            medicine_id = item.get("medicine")
            prescription_item_id = item.get("prescription_item")
            quantity = item.get("quantity_dispensed")

            if (
                medicine_id is None
                or prescription_item_id is None
                or quantity is None
            ):
                raise ValidationError({
                    "items": (
                        "Each item needs medicine, prescription_item "
                        "and quantity_dispensed."
                    )
                })

            try:
                medicine_id = int(medicine_id)
                prescription_item_id = int(prescription_item_id)
                quantity = int(quantity)
            except (TypeError, ValueError):
                raise ValidationError({
                    "items": "IDs and quantity must be integers."
                })

            if medicine_id <= 0 or prescription_item_id <= 0 or quantity <= 0:
                raise ValidationError({
                    "items": "IDs and quantity must be positive."
                })

            try:
                prescription_item = (
                    PrescriptionItem.objects
                    .select_for_update()
                    .select_related(
                        "medicine",
                        "prescription__consultation",
                    )
                    .get(
                        prescription_item_id=prescription_item_id,
                        prescription__consultation__patient=patient,
                        is_active=True,
                        medicine__is_active=True,
                    )
                )
            except PrescriptionItem.DoesNotExist:
                raise ValidationError({
                    "prescription_item": (
                        f"Active prescription item {prescription_item_id} "
                        "was not found for this patient."
                    )
                })

            if prescription_item.medicine_id != medicine_id:
                raise ValidationError({
                    "medicine": (
                        "The selected medicine does not match "
                        "the prescription item."
                    )
                })

            remaining = (
                prescription_item.prescribed_quantity
                - prescription_item.dispensed_quantity
            )

            if quantity > remaining:
                raise ValidationError({
                    "quantity_dispensed": (
                        f"Only {remaining} more units can be dispensed "
                        "from this prescription item."
                    )
                })

            # Prevent duplicate prescription entries in one bill.
            if any(
                existing["prescription_item"].pk
                == prescription_item.pk
                for existing in validated_items
            ):
                raise ValidationError({
                    "items": (
                        "Do not include the same prescription item twice. "
                        "Combine its quantity into one item."
                    )
                })

            validated_items.append({
                "prescription_item": prescription_item,
                "medicine_id": medicine_id,
                "quantity": quantity,
            })

            stock_totals[medicine_id] = (
                stock_totals.get(medicine_id, 0) + quantity
            )

        # Lock stock rows and verify current availability.
        stocks = {}

        for medicine_id, quantity in sorted(stock_totals.items()):
            try:
                stock = (
                    PharmacyStock.objects
                    .select_for_update()
                    .select_related("medicine")
                    .get(
                        medicine_id=medicine_id,
                        medicine__is_active=True,
                    )
                )
            except PharmacyStock.DoesNotExist:
                raise ValidationError({
                    "items": f"No active stock for medicine {medicine_id}."
                })

            if stock.quantity < quantity:
                raise ValidationError({
                    "items": (
                        f"Insufficient stock for {stock.medicine.name}. "
                        f"Available: {stock.quantity}."
                    )
                })

            stocks[medicine_id] = stock

        total = Decimal("0.00")

        for entry in validated_items:
            stock = stocks[entry["medicine_id"]]
            total += stock.selling_price * entry["quantity"]

        bill = PharmacyBill.objects.create(
            patient=patient,
            pharmacist=staff,
            total_amount=total,
        )

        for entry in validated_items:
            stock = stocks[entry["medicine_id"]]
            quantity = entry["quantity"]

            PharmacyBillItem.objects.create(
                pharmacy_bill=bill,
                medicine=stock.medicine,
                prescription_item=entry["prescription_item"],
                quantity_dispensed=quantity,
                unit_selling_price=stock.selling_price,
                line_amount=stock.selling_price * quantity,
            )

        serializer = PharmacyBillSerializer(bill)

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
        )

class PharmacyBillPaymentAPIView(
    PharmacistPermissionMixin,
    APIView,
):
    @transaction.atomic
    def patch(self, request, bill_id):
        self.check_pharmacist()

        try:
            bill = (
                PharmacyBill.objects
                .select_for_update()
                .get(pharmacy_bill_id=bill_id)
            )
        except PharmacyBill.DoesNotExist:
            raise ValidationError({
                "bill": "Pharmacy bill not found."
            })

        if bill.payment_status == PharmacyBill.PaymentStatusChoices.PAID:
            raise ValidationError({
                "payment_status": "This bill has already been paid."
            })

        if bill.payment_status == PharmacyBill.PaymentStatusChoices.CANCELLED:
            raise ValidationError({
                "payment_status": "A cancelled bill cannot be paid."
            })

        payment_method = request.data.get("payment_method")

        allowed_methods = [
            choice.value
            for choice in PharmacyBill.PaymentMethodChoices
        ]

        if payment_method not in allowed_methods:
            raise ValidationError({
                "payment_method": "Choose CASH, CARD, or UPI."
            })

        bill_items = list(
            bill.items
            .select_related("medicine", "prescription_item")
            .order_by("medicine_id", "item_bill_id")
        )

        if not bill_items:
            raise ValidationError({
                "bill": "Cannot pay a bill without items."
            })

        # All new prescription-based bills must have a prescription link.
        for item in bill_items:
            if item.prescription_item_id is None:
                raise ValidationError({
                    "prescription_item": (
                        f"Bill item {item.item_bill_id} has no linked "
                        "prescription. This bill cannot be paid through "
                        "the prescription-based payment flow."
                    )
                })

        # Lock prescription items in a consistent order.
        prescription_ids = sorted({
            item.prescription_item_id for item in bill_items
        })

        prescription_items = {
            obj.prescription_item_id: obj
            for obj in (
                PrescriptionItem.objects
                .select_for_update()
                .select_related("prescription__consultation")
                .filter(prescription_item_id__in=prescription_ids)
                .order_by("prescription_item_id")
            )
        }

        # Validate every prescription item before changing stock.
        for item in bill_items:
            prescription_item = prescription_items.get(
                item.prescription_item_id
            )

            if prescription_item is None:
                raise ValidationError({
                    "prescription_item": "Linked prescription item not found."
                })

            if prescription_item.medicine_id != item.medicine_id:
                raise ValidationError({
                    "prescription_item": (
                        "The bill medicine does not match its prescription."
                    )
                })

            if (
                prescription_item.prescription.consultation.patient_id
                != bill.patient_id
            ):
                raise ValidationError({
                    "prescription_item": (
                        "The prescription belongs to a different patient."
                    )
                })

            new_dispensed_quantity = (
                prescription_item.dispensed_quantity
                + item.quantity_dispensed
            )

            if new_dispensed_quantity > prescription_item.prescribed_quantity:
                raise ValidationError({
                    "quantity_dispensed": (
                        f"Payment would exceed the prescribed quantity "
                        f"for {item.medicine.name}."
                    )
                })

        # Aggregate quantities if the same medicine appears more than once.
        stock_totals = {}

        for item in bill_items:
            stock_totals[item.medicine_id] = (
                stock_totals.get(item.medicine_id, 0)
                + item.quantity_dispensed
            )

        stocks = {}

        # Lock and validate every stock row before deducting any quantity.
        for medicine_id, quantity in sorted(stock_totals.items()):
            try:
                stock = (
                    PharmacyStock.objects
                    .select_for_update()
                    .get(medicine_id=medicine_id)
                )
            except PharmacyStock.DoesNotExist:
                raise ValidationError({
                    "stock": f"No stock record for medicine {medicine_id}."
                })

            if stock.quantity < quantity:
                raise ValidationError({
                    "stock": (
                        f"Insufficient stock for {stock.medicine.name}. "
                        f"Available: {stock.quantity}; required: {quantity}."
                    )
                })

            stocks[medicine_id] = stock

        # Deduct stock only after all checks pass.
        for medicine_id, quantity in stock_totals.items():
            stock = stocks[medicine_id]
            stock.quantity -= quantity
            stock.save(update_fields=["quantity"])

        # Update prescription quantities and dispensing status.
        for item in bill_items:
            prescription_item = prescription_items[
                item.prescription_item_id
            ]

            prescription_item.dispensed_quantity += item.quantity_dispensed

            if (
                prescription_item.dispensed_quantity
                >= prescription_item.prescribed_quantity
            ):
                prescription_item.dispensed_status = "DISPENSED"
            else:
                prescription_item.dispensed_status = "PARTIALLY_DISPENSED"

            prescription_item.save(update_fields=[
                "dispensed_quantity",
                "dispensed_status",
            ])

        bill.payment_method = payment_method
        bill.payment_status = PharmacyBill.PaymentStatusChoices.PAID
        bill.save(update_fields=["payment_method", "payment_status"])

        serializer = PharmacyBillSerializer(bill)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )