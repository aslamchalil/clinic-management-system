from django.shortcuts import render

# Create your views here.
# lab/views.py

from rest_framework import viewsets, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.shortcuts import get_object_or_404

from cmsapp.models import LabRequest, LabBill, LabResult

from .permissions import IsLabTechnician
from .serializers import (
    LabRequestSerializer,
    LabBillSerializer,
    LabBillCreateSerializer,
    LabBillPaymentSerializer,
    LabResultSerializer,
    LabResultCreateSerializer,
)


# ----------------------------------------------------------
# LabRequest — Lab module only VIEWS and progresses status.
# It never creates a LabRequest (Doctor module does that).
# ----------------------------------------------------------
class LabRequestViewSet(mixins.ListModelMixin,
                         mixins.RetrieveModelMixin,
                         viewsets.GenericViewSet):
    queryset = LabRequest.objects.select_related("test", "consultation").all()
    serializer_class = LabRequestSerializer
    permission_classes = [IsAuthenticated, IsLabTechnician]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param.upper())
        return qs.order_by("-order_date")

    @action(detail=True, methods=["post"], url_path="start-processing")
    def start_processing(self, request, pk=None):
        """
        Technician begins processing a test.
        Only allowed once the request has been paid for.
        """
        lab_request = self.get_object()

        if lab_request.status != LabRequest.Status.PAID:
            return Response(
                {"detail": f"LabRequest must be PAID before processing "
                           f"(current status: {lab_request.status})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lab_request.status = LabRequest.Status.IN_PROGRESS
        lab_request.save(update_fields=["status"])
        return Response(LabRequestSerializer(lab_request).data)


# ----------------------------------------------------------
# LabBill — create bill + items together, verify payment
# ----------------------------------------------------------
class LabBillViewSet(mixins.ListModelMixin,
                      mixins.RetrieveModelMixin,
                      mixins.CreateModelMixin,
                      viewsets.GenericViewSet):
    queryset = LabBill.objects.prefetch_related("items", "items__lab_request").all()
    permission_classes = [IsAuthenticated, IsLabTechnician]

    def get_serializer_class(self):
        if self.action == "create":
            return LabBillCreateSerializer
        return LabBillSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        payment_status = self.request.query_params.get("payment_status")
        if payment_status:
            qs = qs.filter(payment_status=payment_status.upper())
        return qs.order_by("-bill_date")

    @action(detail=True, methods=["post"], url_path="mark-paid")
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        """
        Confirms payment on a LabBill and propagates PAID status
        to every LabRequest linked through its LabBillItems.
        """
        lab_bill = self.get_object()

        if lab_bill.payment_status == LabBill.PaymentStatus.PAID:
            return Response(
                {"detail": "This bill is already marked PAID."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment_serializer = LabBillPaymentSerializer(data=request.data)
        payment_serializer.is_valid(raise_exception=True)

        lab_bill.payment_status = LabBill.PaymentStatus.PAID
        lab_bill.payment_method = payment_serializer.validated_data["payment_method"]
        lab_bill.save(update_fields=["payment_status", "payment_method"])

        # Propagate to every LabRequest covered by this bill
        request_ids = lab_bill.items.values_list("lab_request_id", flat=True)
        LabRequest.objects.filter(lab_request_id__in=request_ids).update(
            status=LabRequest.Status.PAID
        )

        return Response(LabBillSerializer(lab_bill).data)


# ----------------------------------------------------------
# LabResult — entered by the technician after processing
# ----------------------------------------------------------
class LabResultViewSet(mixins.ListModelMixin,
                        mixins.RetrieveModelMixin,
                        mixins.CreateModelMixin,
                        viewsets.GenericViewSet):
    queryset = LabResult.objects.select_related("lab_request", "lab_request__test", "technician").all()
    permission_classes = [IsAuthenticated, IsLabTechnician]

    def get_serializer_class(self):
        if self.action == "create":
            return LabResultCreateSerializer
        return LabResultSerializer

    def get_queryset(self):
        return super().get_queryset().order_by("-result_date")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # The technician entering the result is always the logged-in staff member,
        # never a value the client can supply.
        context["technician_staff"] = self.request.user.staff
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lab_result = serializer.save()
        return Response(
            LabResultSerializer(lab_result).data,
            status=status.HTTP_201_CREATED,
        )