
from rest_framework import serializers

from cmsapp.models import (
    LabBill,
    LabBillItem,
    LabRequest,
    LabResult,
    MasterLabTest,
    Patient,
)


# ============================================================
# MASTER LAB TEST
# ============================================================

class MasterLabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterLabTest
        fields = [
            "test_id",
            "test_name",
            "test_type",
            "description",
            "test_price",
            "min_value",
            "max_value",
            "is_active",
        ]
        read_only_fields = fields


class LabPatientSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ["patient_id", "full_name", "phone_number"]
        read_only_fields = fields


# ============================================================
# LAB REQUEST
# ============================================================

class LabRequestSerializer(serializers.ModelSerializer):
    patient_id = serializers.IntegerField(
        source="consultation.patient_id",
        read_only=True,
    )
    patient_name = serializers.CharField(
        source="consultation.patient.full_name",
        read_only=True,
    )
    test_name = serializers.CharField(
        source="test.test_name",
        read_only=True,
    )
    test_price = serializers.DecimalField(
        source="test.test_price",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = LabRequest
        fields = [
            "lab_request_id",
            "consultation",
            "patient_id",
            "patient_name",
            "test",
            "test_name",
            "test_price",
            "order_date",
            "priority",
            "status",
            "is_active",
        ]
        read_only_fields = fields


# ============================================================
# LAB BILL ITEM
# ============================================================

class LabBillItemSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(
        source="lab_request.test.test_name",
        read_only=True,
    )

    class Meta:
        model = LabBillItem
        fields = [
            "lab_bill_item_id",
            "lab_request",
            "test_name",
            "quantity",
            "unit_price",
            "line_amount",
        ]
        read_only_fields = fields


# ============================================================
# LAB BILL
# ============================================================

class LabBillSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    class Meta:
        model = LabBill
        fields = [
            "lab_bill_id",
            "patient",
            "patient_name",
            "bill_date",
            "total_amount",
            "payment_status",
            "payment_method",
        ]
        read_only_fields = fields


class LabBillDetailSerializer(LabBillSerializer):
    items = LabBillItemSerializer(many=True, read_only=True)

    class Meta(LabBillSerializer.Meta):
        fields = LabBillSerializer.Meta.fields + ["items"]
        read_only_fields = fields


class LabBillCreateSerializer(serializers.Serializer):
    lab_request_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )


class LabBillPaymentSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(
        choices=LabBill.PaymentMethodChoices.choices,
    )


# ============================================================
# LAB RESULT
# ============================================================

class LabResultSerializer(serializers.ModelSerializer):
    consultation = serializers.IntegerField(
        source="lab_request.consultation_id",
        read_only=True,
    )
    patient_id = serializers.IntegerField(
        source="lab_request.consultation.patient_id",
        read_only=True,
    )
    patient_name = serializers.CharField(
        source="lab_request.consultation.patient.full_name",
        read_only=True,
    )
    doctor_name = serializers.CharField(
        source="lab_request.consultation.doctor",
        read_only=True,
    )
    test_name = serializers.CharField(
        source="lab_request.test.test_name",
        read_only=True,
    )
    technician_name = serializers.CharField(
        source="technician.first_name",
        read_only=True,
    )

    class Meta:
        model = LabResult
        fields = [
            "result_id",
            "lab_request",
            "consultation",
            "patient_id",
            "patient_name",
            "doctor_name",
            "test_name",
            "technician",
            "technician_name",
            "bill",
            "result_value",
            "unit",
            "reference_range",
            "result_date",
            "report",
        ]
        read_only_fields = fields


class LabResultCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabResult
        fields = [
            "lab_request",
            "result_value",
            "unit",
            "reference_range",
            "report",
        ]
