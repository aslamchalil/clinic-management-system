# # lab/serializers.py
# #
# # Imports models from cmsapp — the lab app defines NO models of its own.

# from decimal import Decimal
# from rest_framework import serializers
# from django.db import transaction

# from cmsapp.models import (
#     MasterLabTest,
#     LabRequest,
#     LabBill,
#     LabBillItem,
#     LabResult,
#     Staff,
# )


# # ----------------------------------------------------------
# # Read-only nested serializers (for display purposes)
# # ----------------------------------------------------------
# class MasterLabTestMiniSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = MasterLabTest
#         fields = ["test_id", "test_name", "test_type", "test_price", "min_value", "max_value"]


# class LabRequestSerializer(serializers.ModelSerializer):
#     """Read-only view of a LabRequest for the Lab module (created by Doctor module)."""
#     test = MasterLabTestMiniSerializer(read_only=True)
#     patient_name = serializers.CharField(source="consultation.token.patient.full_name", read_only=True)

#     class Meta:
#         model = LabRequest
#         fields = [
#             "lab_request_id",
#             "consultation",
#             "test",
#             "patient_name",
#             "order_date",
#             "priority",
#             "status",
#             "is_active",
#         ]
#         read_only_fields = fields  # Lab module never creates/edits this directly


# # ----------------------------------------------------------
# # LabBillItem
# # ----------------------------------------------------------
# class LabBillItemInputSerializer(serializers.Serializer):
#     """Used only when creating a LabBill — write-only nested input."""
#     lab_request_id = serializers.PrimaryKeyRelatedField(
#         source="lab_request", queryset=LabRequest.objects.all()
#     )
#     quantity = serializers.IntegerField(min_value=1, default=1)


# class LabBillItemSerializer(serializers.ModelSerializer):
#     test_name = serializers.CharField(source="lab_request.test.test_name", read_only=True)

#     class Meta:
#         model = LabBillItem
#         fields = [
#             "lab_bill_item_id",
#             "lab_bill",
#             "lab_request",
#             "test_name",
#             "quantity",
#             "unit_price",
#             "line_amount",
#         ]
#         read_only_fields = ["lab_bill_item_id", "unit_price", "line_amount", "test_name"]


# # ----------------------------------------------------------
# # LabBill
# # ----------------------------------------------------------
# class LabBillSerializer(serializers.ModelSerializer):
#     """Read serializer — shows the bill with its line items."""
#     items = LabBillItemSerializer(many=True, read_only=True)

#     class Meta:
#         model = LabBill
#         fields = [
#             "lab_bill_id",
#             "patient",
#             "bill_date",
#             "total_amount",
#             "payment_status",
#             "payment_method",
#             "items",
#         ]
#         read_only_fields = ["lab_bill_id", "bill_date", "total_amount"]


# class LabBillCreateSerializer(serializers.Serializer):
#     """
#     Write serializer for creating a LabBill + its LabBillItems together.
#     Atomic: if anything fails, nothing is saved.
#     """
#     patient_id = serializers.PrimaryKeyRelatedField(
#         source="patient", queryset=LabBill._meta.get_field("patient").related_model.objects.all()
#     )
#     items = LabBillItemInputSerializer(many=True)

#     def validate_items(self, items):
#         if not items:
#             raise serializers.ValidationError("At least one lab_request item is required.")
#         seen_requests = set()
#         for item in items:
#             lab_request = item["lab_request"]
#             if lab_request.lab_request_id in seen_requests:
#                 raise serializers.ValidationError(
#                     f"LabRequest {lab_request.lab_request_id} appears more than once."
#                 )
#             seen_requests.add(lab_request.lab_request_id)

#             if lab_request.status not in [LabRequest.Status.REQUESTED]:
#                 raise serializers.ValidationError(
#                     f"LabRequest {lab_request.lab_request_id} is not in REQUESTED state "
#                     f"(current: {lab_request.status}) and cannot be billed again."
#                 )
#         return items

#     @transaction.atomic
#     def create(self, validated_data):
#         patient = validated_data["patient"]
#         items_data = validated_data["items"]

#         lab_bill = LabBill.objects.create(patient=patient, total_amount=Decimal("0.00"))

#         total = Decimal("0.00")
#         for item in items_data:
#             lab_request = item["lab_request"]
#             quantity = item.get("quantity", 1)
#             unit_price = lab_request.test.test_price
#             line_amount = unit_price * quantity

#             LabBillItem.objects.create(
#                 lab_bill=lab_bill,
#                 lab_request=lab_request,
#                 quantity=quantity,
#                 unit_price=unit_price,
#                 line_amount=line_amount,
#             )
#             total += line_amount

#             lab_request.status = LabRequest.Status.BILLED
#             lab_request.save(update_fields=["status"])

#         lab_bill.total_amount = total
#         lab_bill.save(update_fields=["total_amount"])
#         return lab_bill

#     def to_representation(self, instance):
#         # instance here is the created LabBill
#         return LabBillSerializer(instance).data


# class LabBillPaymentSerializer(serializers.Serializer):
#     """Used on the mark-paid action."""
#     payment_method = serializers.ChoiceField(choices=LabBill.PaymentMethod.choices)


# # ----------------------------------------------------------
# # LabResult
# # ----------------------------------------------------------
# class LabResultCreateSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = LabResult
#         fields = [
#             "result_id",
#             "lab_request",
#             "bill",
#             "result_value",
#             "unit",
#             "reference_range",
#             "report",
#         ]
#         read_only_fields = ["result_id"]

#     def validate(self, attrs):
#         lab_request = attrs["lab_request"]
#         bill = attrs["bill"]

#         # 1. Request must currently be IN_PROGRESS (technician must have started it)
#         if lab_request.status != LabRequest.Status.IN_PROGRESS:
#             raise serializers.ValidationError(
#                 "LabRequest must be IN_PROGRESS before a result can be entered. "
#                 "Call the start-processing action first."
#             )

#         # 2. Payment must be verified server-side — never trust the FK alone
#         if bill.payment_status != LabBill.PaymentStatus.PAID:
#             raise serializers.ValidationError("The linked LabBill is not PAID.")

#         # 3. The bill must actually correspond to this lab_request
#         bill_has_request = LabBillItem.objects.filter(
#             lab_bill=bill, lab_request=lab_request
#         ).exists()
#         if not bill_has_request:
#             raise serializers.ValidationError(
#                 "The given LabBill does not contain a line item for this LabRequest."
#             )

#         # 4. One LabRequest -> one LabResult
#         if hasattr(lab_request, "result"):
#             raise serializers.ValidationError("A result already exists for this LabRequest.")

#         return attrs

#     @transaction.atomic
#     def create(self, validated_data):
#         technician_staff = self.context["technician_staff"]
#         lab_result = LabResult.objects.create(technician=technician_staff, **validated_data)

#         lab_request = lab_result.lab_request
#         lab_request.status = LabRequest.Status.COMPLETED
#         lab_request.save(update_fields=["status"])

#         return lab_result


# class LabResultSerializer(serializers.ModelSerializer):
#     test_name = serializers.CharField(source="lab_request.test.test_name", read_only=True)
#     technician_name = serializers.SerializerMethodField()

#     class Meta:
#         model = LabResult
#         fields = [
#             "result_id",
#             "lab_request",
#             "test_name",
#             "technician",
#             "technician_name",
#             "bill",
#             "result_value",
#             "unit",
#             "reference_range",
#             "result_date",
#             "report",
#         ]
#         read_only_fields = fields

#     def get_technician_name(self, obj):
#         return f"{obj.technician.first_name} {obj.technician.last_name}"