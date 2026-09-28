# lab/serializers.py
"""
Serializers for the Lab module.

Rule of thumb used here:
  * READ serializers are fully read-only - the client can never write
    payment_status, status, technician, bill, prices, etc.
  * WRITE serializers accept only the few fields a client is allowed to send.
    Everything else is decided by lab/services.py.
"""
from rest_framework import serializers

from cmsapp.models import LabBill, LabBillItem, LabRequest, LabResult, MasterLabTest,PaymentMethodChoices


# ------------------------------------------------------------------ master test
class MasterLabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterLabTest
        fields = ["test_id", "test_name", "test_type", "description",
                  "test_price", "min_value", "max_value", "is_active"]
        read_only_fields = fields  # Admin manages tests, not the lab module.


# ------------------------------------------------------------------ lab request
class LabRequestSerializer(serializers.ModelSerializer):
    patient_id = serializers.IntegerField(source="consultation.patient_id", read_only=True)
    patient_name = serializers.CharField(source="consultation.patient.full_name", read_only=True)
    test_name = serializers.CharField(source="test.test_name", read_only=True)
    test_price = serializers.DecimalField(
        source="test.test_price", max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = LabRequest
        fields = [
            "lab_request_id", "consultation", "patient_id", "patient_name",
            "test", "test_name", "test_price",
            "order_date", "priority", "status", "is_active",
        ]
        read_only_fields = fields


# ------------------------------------------------------------------ bills
class LabBillItemSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="lab_request.test.test_name", read_only=True)

    class Meta:
        model = LabBillItem
        fields = ["lab_bill_item_id", "lab_request", "test_name",
                  "quantity", "unit_price", "line_amount"]
        read_only_fields = fields


class LabBillSerializer(serializers.ModelSerializer):
    """List view - light, no items."""
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)

    class Meta:
        model = LabBill
        fields = ["lab_bill_id", "patient", "patient_name", "bill_date",
                  "total_amount", "payment_status", "payment_method"]
        read_only_fields = fields


class LabBillDetailSerializer(LabBillSerializer):
    """Detail view - includes the bill items."""
    # LabBillItem.lab_bill has related_name="items" in cmsapp.models
    items = LabBillItemSerializer(many=True, read_only=True)

    class Meta(LabBillSerializer.Meta):
        fields = LabBillSerializer.Meta.fields + ["items"]
        read_only_fields = fields


class LabBillCreateSerializer(serializers.Serializer):
    """Input only: which lab requests should go on the new bill."""
    lab_request_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=False
    )


class LabBillPaymentSerializer(serializers.Serializer):
    """
    Input only. The client says HOW the patient paid; it can never send
    payment_status - "PAID" is set by the mark-paid service.
    """
    payment_method = serializers.ChoiceField(
    choices=PaymentMethodChoices.choices
)


# ------------------------------------------------------------------ results
class LabResultSerializer(serializers.ModelSerializer):
    """Read serializer."""
    test_name = serializers.CharField(source="lab_request.test.test_name", read_only=True)
    technician_name = serializers.CharField(source="technician.first_name", read_only=True)

    class Meta:
        model = LabResult
        fields = ["result_id", "lab_request", "test_name", "technician", "technician_name",
                  "bill", "result_value", "unit", "reference_range", "result_date", "report"]
        read_only_fields = fields


class LabResultCreateSerializer(serializers.ModelSerializer):
    """
    Write serializer: the technician sends ONLY the measurement.
    `technician`, `bill`, `result_date` are filled in by the service.
    `report` is a free-text report (LabResult.report is a TextField).
    """

    class Meta:
        model = LabResult
        fields = ["lab_request", "result_value", "unit", "reference_range", "report"]