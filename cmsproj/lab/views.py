
from .permissions import IsLabAssistant, IsLabTechnicianOrDoctor, limit_to_own_consultations
from django.db.models import Q
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cmsapp.models import (
    MasterLabTest,
    LabRequest,
    LabResult,
    LabBill,
    Patient,
)

from .serializers import (
    MasterLabTestSerializer,
    LabRequestSerializer,
    LabResultSerializer,
    LabResultCreateSerializer,
    LabBillSerializer,
    LabBillDetailSerializer,
    LabBillCreateSerializer,
    LabBillPaymentSerializer,
    LabPatientSearchSerializer,
)
from .services import create_lab_bill, mark_bill_paid, start_processing, enter_result


class LabDashboardAPIView(APIView):
    permission_classes = [IsLabAssistant]

    def get(self, request):
        requests = LabRequest.objects.filter(is_active=True)
        return Response({
            "requested": requests.filter(status=LabRequest.StatusChoices.REQUESTED).count(),
            "billed": requests.filter(status=LabRequest.StatusChoices.BILLED).count(),
            "paid": requests.filter(status=LabRequest.StatusChoices.PAID).count(),
            "completed": requests.filter(status=LabRequest.StatusChoices.COMPLETED).count(),
        })


class LabPatientSearchAPIView(generics.ListAPIView):
    serializer_class = LabPatientSearchSerializer
    permission_classes = [IsLabAssistant]

    def get_queryset(self):
        query = self.request.query_params.get("q", "").strip()[:100]
        if not query:
            return Patient.objects.none()
        search = Q(full_name__icontains=query) | Q(phone_number__icontains=query)
        if query.isdigit() and len(query) <= 10:
            search |= Q(patient_id=int(query))
        return Patient.objects.filter(is_active=True).filter(search).order_by("full_name")[:20]


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
            "consultation__patient",
            "test",
        ).order_by("-order_date")


class LabRequestDetailAPIView(generics.RetrieveAPIView):
    serializer_class = LabRequestSerializer
    permission_classes = [IsAuthenticated, IsLabTechnicianOrDoctor]
    lookup_field = "lab_request_id"

    def get_queryset(self):
        queryset = LabRequest.objects.filter(
            is_active=True
        ).select_related(
            "consultation",
            "test",
        )
        return limit_to_own_consultations(
            queryset, self.request.user, "consultation__doctor__staff__user"
        )




class LabResultCreateAPIView(APIView):
    permission_classes = [IsLabAssistant]

    def post(self, request, lab_request_id):
        lab_request = get_object_or_404(
            LabRequest,
            lab_request_id=lab_request_id,
            is_active=True,
        )
        payload = request.data.copy()
        payload["lab_request"] = lab_request.lab_request_id
        serializer = LabResultCreateSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        result = enter_result(
            lab_request=lab_request,
            technician_user=request.user,
            data=serializer.validated_data,
        )
        return Response(
            LabResultSerializer(result).data,
            status=status.HTTP_201_CREATED,
        )


class LabRequestStartProcessingAPIView(APIView):
    permission_classes = [IsLabAssistant]

    def post(self, request, lab_request_id):
        lab_request = start_processing(lab_request_id=lab_request_id)
        return Response(LabRequestSerializer(lab_request).data, status=status.HTTP_200_OK)


class LabBillCreateAPIView(APIView):
    permission_classes = [IsLabAssistant]

    def get(self, request):
        bills = LabBill.objects.select_related("patient").prefetch_related(
            "items__lab_request__test"
        ).order_by("-bill_date")
        patient_id = request.query_params.get("patient")
        if patient_id:
            if not patient_id.isdigit():
                return Response({"patient": "Enter a valid patient ID."}, status=status.HTTP_400_BAD_REQUEST)
            bills = bills.filter(patient_id=int(patient_id))
        return Response(LabBillDetailSerializer(bills, many=True).data)

    def post(self, request):
        payload = request.data.copy()
        if "lab_request_ids" not in payload and payload.get("lab_request_id"):
            payload["lab_request_ids"] = [payload["lab_request_id"]]
        serializer = LabBillCreateSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        bill = create_lab_bill(lab_request_ids=serializer.validated_data["lab_request_ids"])
        bill = LabBill.objects.select_related("patient").prefetch_related("items__lab_request__test").get(pk=bill.pk)
        return Response(LabBillDetailSerializer(bill).data, status=status.HTTP_201_CREATED)


class LabBillPaymentAPIView(APIView):
    permission_classes = [IsLabAssistant]

    def patch(self, request, bill_id):
        serializer = LabBillPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bill = mark_bill_paid(bill_id=bill_id, payment_method=serializer.validated_data["payment_method"])
        bill = LabBill.objects.select_related("patient").prefetch_related("items__lab_request__test").get(pk=bill.pk)
        return Response(LabBillDetailSerializer(bill).data, status=status.HTTP_200_OK)



class LabResultListAPIView(generics.ListAPIView):
    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated, IsLabTechnicianOrDoctor]

    def get_queryset(self):
        queryset = LabResult.objects.select_related(
            "lab_request",
            "lab_request__consultation__doctor",
            "lab_request__consultation__patient",
            "technician",
            "bill",
        ).order_by("-result_date")
        return limit_to_own_consultations(
            queryset, self.request.user, "lab_request__consultation__doctor__staff__user"
        )


class LabResultDetailAPIView(generics.RetrieveAPIView):
    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated, IsLabTechnicianOrDoctor]
    lookup_field = "result_id"

    def get_queryset(self):
        queryset = LabResult.objects.select_related(
            "lab_request",
            "lab_request__consultation__doctor",
            "lab_request__consultation__patient",
            "technician",
            "bill",
        )
        return limit_to_own_consultations(
            queryset, self.request.user, "lab_request__consultation__doctor__staff__user"
        )



class LabBillDetailAPIView(generics.RetrieveAPIView):
    serializer_class = LabBillSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "lab_bill_id"

    def get_queryset(self):
        return LabBill.objects.prefetch_related("items")
