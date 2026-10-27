
from rest_framework import serializers
from cmsapp.models import MasterLabTest, LabRequest,LabResult
from decimal import Decimal
from rest_framework import serializers
from cmsapp.models import LabBill, LabBillItem, LabRequest


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


class LabRequestSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(
        source="test.test_name",
        read_only=True
    )

    class Meta:
        model = LabRequest
        fields = [
            "lab_request_id",
            "consultation",
            "test",
            "test_name",
            "order_date",
            "priority",
            "status",
            "is_active",
        ]
        read_only_fields = fields



class LabResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabResult
        fields = [
            "result_id",
            "lab_request",
            "technician",
            "bill",
            "result_value",
            "unit",
            "reference_range",
            "result_date",
            "report",
        ]
        read_only_fields = [
            "result_id",
            "lab_request",
            "technician",
            "bill",
            "result_date",
        ]


class LabBillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabBillItem
        fields = [
            "lab_bill_item_id",
            "lab_request",
            "quantity",
            "unit_price",
            "line_amount",
        ]
        read_only_fields = fields



class LabBillSerializer(serializers.ModelSerializer):
    items = LabBillItemSerializer(many=True, read_only=True)

    class Meta:
        model = LabBill
        fields = [
            "lab_bill_id",
            "patient",
            "bill_date",
            "total_amount",
            "payment_status",
            "payment_method",
            "items",
        ]
        read_only_fields = fields