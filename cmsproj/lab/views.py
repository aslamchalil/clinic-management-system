
from .permissions import IsLabAssistant
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cmsapp.models import (
    Staff,
    MasterLabTest,
    LabRequest,
    LabResult,
    LabBill,
    LabBillItem,
)

from .serializers import (
    MasterLabTestSerializer,
    LabRequestSerializer,
    LabResultSerializer,
    LabBillSerializer,
)


class MasterLabTestListAPIView(generics.ListAPIView):
    serializer_class = MasterLabTestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return MasterLabTest.objects.filter(
            is_active=True
        ).order_by("test_name")


class LabRequestListAPIView(generics.ListAPIView):
    serializer_class = LabRequestSerializer
    permission_classes = [IsLabAssistant]

    def get_queryset(self):
        return LabRequest.objects.filter(
            is_active=True
        ).select_related(
            "consultation",
            "test",
        ).order_by("-order_date")


class LabRequestDetailAPIView(generics.RetrieveAPIView):
    serializer_class = LabRequestSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "lab_request_id"

    def get_queryset(self):
        return LabRequest.objects.filter(
            is_active=True
        ).select_related(
            "consultation",
            "test",
        )




class LabResultCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_request_id):
        staff = Staff.objects.filter(
            user=request.user,
            role__role_name="LAB_ASSISTANT",
            is_active=True,
            role__is_active=True,
        ).first()

        if not staff:
            return Response(
                {"detail": "Active Lab Assistant account required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        lab_request = get_object_or_404(
            LabRequest,
            lab_request_id=lab_request_id,
            is_active=True,
        )

        if lab_request.status not in ["PAID", "IN_PROGRESS"]:
            return Response(
                {
                    "detail": (
                        "The lab request must be paid before "
                        "a result can be recorded."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if LabResult.objects.filter(
            lab_request=lab_request
        ).exists():
            return Response(
                {"detail": "A result already exists for this request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bill_item = LabBillItem.objects.filter(
            lab_request=lab_request,
            lab_bill__payment_status="PAID",
        ).select_related("lab_bill").order_by(
            "-lab_bill__bill_date"
        ).first()

        if not bill_item:
            return Response(
                {"detail": "No paid lab bill was found for this request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LabResultSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = serializer.save(
            lab_request=lab_request,
            technician=staff,
            bill=bill_item.lab_bill,
            result_date=timezone.now(),
        )

        return Response(
            LabResultSerializer(result).data,
            status=status.HTTP_201_CREATED,
        )


class LabBillCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        staff = Staff.objects.filter(
            user=request.user,
            role__role_name="LAB_ASSISTANT",
            role__is_active=True,
            is_active=True,
        ).first()

        if not staff:
            return Response(
                {"detail": "Active Lab Assistant account required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        request_id = request.data.get("lab_request_id")

        if not request_id:
            return Response(
                {"lab_request_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lab_request = get_object_or_404(
            LabRequest.objects.select_related(
                "consultation__patient",
                "test",
            ),
            lab_request_id=request_id,
            is_active=True,
        )

        if lab_request.status != "REQUESTED":
            return Response(
                {"detail": "Only REQUESTED lab requests can be billed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if LabBillItem.objects.filter(lab_request=lab_request).exists():
            return Response(
                {"detail": "This lab request already has a bill item."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        price = lab_request.test.test_price

        with transaction.atomic():
            bill = LabBill.objects.create(
                patient=lab_request.consultation.patient,
                bill_date=timezone.now(),
                total_amount=price,
                payment_status="PENDING",
            )

            LabBillItem.objects.create(
                lab_bill=bill,
                lab_request=lab_request,
                quantity=1,
                unit_price=price,
                line_amount=price,
            )

            lab_request.status = "BILLED"
            lab_request.save(update_fields=["status"])

        return Response(
            LabBillSerializer(bill).data,
            status=status.HTTP_201_CREATED,
        )


class LabBillPaymentAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, bill_id):
        staff = Staff.objects.filter(
            user=request.user,
            role__role_name="LAB_ASSISTANT",
            role__is_active=True,
            is_active=True,
        ).first()

        if not staff:
            return Response(
                {"detail": "Active Lab Assistant account required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            bill = get_object_or_404(
                LabBill.objects.select_for_update(),
                lab_bill_id=bill_id,
            )

            if bill.payment_status == "PAID":
                return Response(
                    {"detail": "This bill has already been paid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if bill.payment_status == "CANCELLED":
                return Response(
                    {"detail": "Cancelled bills cannot be paid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            method = request.data.get("payment_method")

            if method not in ["CASH", "CARD", "UPI"]:
                return Response(
                    {"payment_method": "Choose CASH, CARD, or UPI."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            bill.payment_method = method
            bill.payment_status = "PAID"
            bill.save(update_fields=["payment_method", "payment_status"])


            for item in bill.items.select_related("lab_request"):
                item.lab_request.status = "PAID"
                item.lab_request.save(update_fields=["status"])

        return Response(
            LabBillSerializer(bill).data,
            status=status.HTTP_200_OK,
        )



class LabResultListAPIView(generics.ListAPIView):
    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return LabResult.objects.select_related(
            "lab_request",
            "technician",
            "bill",
        ).order_by("-result_date")


class LabResultDetailAPIView(generics.RetrieveAPIView):
    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "result_id"

    def get_queryset(self):
        return LabResult.objects.select_related(
            "lab_request",
            "technician",
            "bill",
        )



class LabBillDetailAPIView(generics.RetrieveAPIView):
    serializer_class = LabBillSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "lab_bill_id"

    def get_queryset(self):
        return LabBill.objects.prefetch_related("items")
