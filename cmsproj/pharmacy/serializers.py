
from rest_framework import serializers

from cmsapp.models import Prescription, PrescriptionItem

from cmsapp.models import (
    Prescription,
    PrescriptionItem,
    MasterMedicine,
    PharmacyStock,
    PharmacyBill,
    PharmacyBillItem,
)

class PrescriptionItemSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(
        source="medicine.name",
        read_only=True
    )

    dosage_details = serializers.StringRelatedField(
        source="dosage",
        read_only=True
    )

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
        ]

        read_only_fields = [
            "prescription_item_id",
            "medicine_name",
            "dosage_details",
            "dispensed_quantity",
            "dispensed_status",
        ]


class PrescriptionSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    items = PrescriptionItemSerializer(many=True, read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "prescription_id",
            "consultation",
            "patient_name",
            "doctor_name",
            "created_at",
            "items",
        ]

    def get_patient_name(self, obj):
        consultation = obj.consultation
        return str(consultation.patient)

    def get_doctor_name(self, obj):
        consultation = obj.consultation
        return str(consultation.doctor)



class MasterMedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterMedicine
        fields = [
            "medicine_id",
            "name",
            "generic_name",
            "category",
            "is_active",
        ]
        read_only_fields = ["medicine_id"]


class PharmacyStockSerializer(serializers.ModelSerializer):
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



class PharmacyBillItemSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(
        source="medicine.name",
        read_only=True,
    )

    class Meta:
        model = PharmacyBillItem
        fields = [
            "item_bill_id",
            "medicine",
            "medicine_name",
            "quantity_dispensed",
            "unit_selling_price",
            "line_amount",
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
            "items",
        ]
        read_only_fields = [
            "pharmacy_bill_id",
            "pharmacist",
            "bill_date",
            "total_amount",
            "payment_status",
            "payment_method",
        ]

    def get_pharmacist_name(self, obj):
        return str(obj.pharmacist)
