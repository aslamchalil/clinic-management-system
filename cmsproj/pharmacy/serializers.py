
from rest_framework import serializers
from django.db.models import Sum
from django.db import transaction

from cmsapp.models import Prescription, PrescriptionItem

from cmsapp.models import (
    Prescription,
    PrescriptionItem,
    MasterMedicine,
    PharmacyStock,
    PharmacyBill,
    PharmacyBillItem,
    Patient,
    Dosage,
)


class PharmacyPatientSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ["patient_id", "full_name", "phone_number"]

class PrescriptionItemSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(
        source="medicine.name",
        read_only=True
    )

    dosage_details = serializers.StringRelatedField(
        source="dosage",
        read_only=True
    )
    available_stock = serializers.SerializerMethodField()
    selling_price = serializers.SerializerMethodField()
    available_to_bill = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        fields = [
            "prescription_item_id",
            "medicine",
            "medicine_name",
            "dosage",
            "dosage_details",
            "frequency",
            "duration",
            "prescribed_quantity",
            "dispensed_quantity",
            "instructions",
            "dispensed_status",
            "available_stock",
            "selling_price",
            "available_to_bill",
        ]

        read_only_fields = [
            "prescription_item_id",
            "medicine_name",
            "dosage_details",
            "dispensed_quantity",
            "dispensed_status",
        ]

    def get_available_stock(self, obj):
        try:
            return obj.medicine.stock.quantity
        except PharmacyStock.DoesNotExist:
            return 0

    def get_selling_price(self, obj):
        try:
            return str(obj.medicine.stock.selling_price)
        except PharmacyStock.DoesNotExist:
            return None

    def get_available_to_bill(self, obj):
        if not obj.is_active:
            return 0
        reserved = PharmacyBillItem.objects.filter(
            prescription_item=obj,
            pharmacy_bill__payment_status__in=["PENDING", "PAID"],
            pharmacy_bill__dispensed_at__isnull=True,
        ).aggregate(total=Sum("quantity_dispensed"))["total"] or 0
        return max(obj.prescribed_quantity - obj.dispensed_quantity - reserved, 0)


class PrescriptionSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_id = serializers.IntegerField(source="consultation.patient_id", read_only=True)
    doctor_name = serializers.SerializerMethodField()
    items = PrescriptionItemSerializer(many=True, read_only=True)
    bills = serializers.SerializerMethodField()

    class Meta:
        model = Prescription
        fields = [
            "prescription_id",
            "consultation",
            "patient_name",
            "patient_id",
            "doctor_name",
            "created_at",
            "items",
            "bills",
        ]

    def get_patient_name(self, obj):
        consultation = obj.consultation
        return str(consultation.patient)

    def get_doctor_name(self, obj):
        consultation = obj.consultation
        return str(consultation.doctor)

    def get_bills(self, obj):
        bill_ids = PharmacyBillItem.objects.filter(
            prescription_item__prescription=obj
        ).values_list("pharmacy_bill_id", flat=True).distinct()
        bills = PharmacyBill.objects.filter(pharmacy_bill_id__in=bill_ids).order_by("-bill_date")
        return [{
            "pharmacy_bill_id": bill.pharmacy_bill_id,
            "payment_status": bill.payment_status,
            "dispensed_at": bill.dispensed_at,
            "total_amount": str(bill.total_amount),
        } for bill in bills]



class MedicineDosageSerializer(serializers.ModelSerializer):
    dosage_id = serializers.IntegerField(required=False)

    class Meta:
        model = Dosage
        fields = ["dosage_id", "dosage_value", "unit", "description", "is_active"]
        extra_kwargs = {"is_active": {"required": False}}

    def validate_dosage_value(self, value):
        if value <= 0:
            raise serializers.ValidationError("Dosage value must be greater than zero.")
        return value

    def validate_unit(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a dosage unit.")
        return value


class MasterMedicineSerializer(serializers.ModelSerializer):
    dosages = MedicineDosageSerializer(many=True, required=False)

    class Meta:
        model = MasterMedicine
        fields = [
            "medicine_id",
            "name",
            "generic_name",
            "category",
            "is_active",
            "dosages",
        ]
        read_only_fields = ["medicine_id"]

    def validate(self, attrs):
        dosages = attrs.get("dosages")
        if self.instance is None and not dosages:
            raise serializers.ValidationError({"dosages": "Add at least one dosage option for this medicine."})
        if dosages is not None and not dosages:
            raise serializers.ValidationError({"dosages": "A medicine must have at least one dosage option."})
        if dosages is not None:
            seen_ids = set()
            seen_options = set()
            existing = {
                dosage.dosage_id: dosage
                for dosage in self.instance.dosages.all()
            } if self.instance is not None else {}
            for dosage in dosages:
                dosage_id = dosage.get("dosage_id")
                if dosage_id is not None:
                    if self.instance is None:
                        raise serializers.ValidationError({"dosages": "Dosage IDs cannot be supplied when creating a medicine."})
                    if dosage_id not in existing:
                        raise serializers.ValidationError({"dosages": "A dosage does not belong to this medicine."})
                    if dosage_id in seen_ids:
                        raise serializers.ValidationError({"dosages": "A dosage option was submitted more than once."})
                    seen_ids.add(dosage_id)
                option = (dosage["dosage_value"], dosage["unit"].casefold())
                if option in seen_options:
                    raise serializers.ValidationError({"dosages": "Duplicate dosage values and units are not allowed."})
                seen_options.add(option)
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        dosages = validated_data.pop("dosages")
        medicine = super().create(validated_data)
        for dosage in dosages:
            Dosage.objects.create(medicine=medicine, **dosage)
        return medicine

    @transaction.atomic
    def update(self, instance, validated_data):
        dosages = validated_data.pop("dosages", None)
        medicine = super().update(instance, validated_data)
        if dosages is not None:
            existing = {dosage.dosage_id: dosage for dosage in medicine.dosages.all()}
            existing_options = {}
            for row in medicine.dosages.all():
                existing_options.setdefault((row.dosage_value, row.unit.casefold()), row)
            retained_ids = set()
            for data in dosages:
                data = dict(data)
                dosage_id = data.pop("dosage_id", None)
                dosage = existing.get(dosage_id) if dosage_id is not None else None
                if dosage is None:
                    dosage = existing_options.get((data["dosage_value"], data["unit"].casefold()))
                if dosage is None:
                    dosage = Dosage.objects.create(medicine=medicine, **data)
                else:
                    for field, value in data.items():
                        setattr(dosage, field, value)
                    dosage.is_active = data.get("is_active", True)
                    dosage.save()
                retained_ids.add(dosage.dosage_id)
            medicine.dosages.exclude(dosage_id__in=retained_ids).filter(is_active=True).update(is_active=False)
        return medicine


class PharmacyStockSerializer(serializers.ModelSerializer):
    unit_cost_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    selling_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    medicine_name = serializers.CharField(
        source="medicine.name",
        read_only=True,
    )

    class Meta:
        model = PharmacyStock
        fields = [
            "stock_id",
            "medicine",
            "medicine_name",
            "quantity",
            "unit_cost_price",
            "selling_price",
            "reorder_level",
        ]
        read_only_fields = ["stock_id"]

    def validate_medicine(self, medicine):
        existing = PharmacyStock.objects.filter(medicine=medicine)
        if self.instance is not None:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("A stock record already exists for this medicine.")
        return medicine



class PharmacyBillItemSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(
        source="medicine.name",
        read_only=True,
    )
    prescription_item_id = serializers.IntegerField(read_only=True, allow_null=True)
    dosage_details = serializers.CharField(source="prescription_item.dosage", read_only=True, allow_null=True)
    frequency = serializers.CharField(source="prescription_item.frequency", read_only=True, allow_null=True)
    duration = serializers.CharField(source="prescription_item.duration", read_only=True, allow_null=True)

    class Meta:
        model = PharmacyBillItem
        fields = [
            "item_bill_id",
            "medicine",
            "medicine_name",
            "quantity_dispensed",
            "unit_selling_price",
            "line_amount",
            "prescription_item_id",
            "dosage_details",
            "frequency",
            "duration",
        ]
        read_only_fields = [
            "item_bill_id",
            "unit_selling_price",
            "line_amount",
        ]



class PharmacyBillSerializer(serializers.ModelSerializer):
    items = PharmacyBillItemSerializer(many=True, read_only=True)

    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    pharmacist_name = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyBill
        fields = [
            "pharmacy_bill_id",
            "patient",
            "patient_name",
            "pharmacist",
            "pharmacist_name",
            "bill_date",
            "total_amount",
            "payment_status",
            "payment_method",
            "dispensed_at",
            "items",
        ]
        read_only_fields = [
            "pharmacy_bill_id",
            "pharmacist",
            "bill_date",
            "total_amount",
            "payment_status",
            "payment_method",
            "dispensed_at",
        ]

    def get_pharmacist_name(self, obj):
        return str(obj.pharmacist)
