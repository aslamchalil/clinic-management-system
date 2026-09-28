# lab/views.py
"""
Thin DRF views. All business rules live in lab/services.py.

Endpoints (see urls.py):
    GET  master-tests/                    active tests (read-only; Admin manages them)
    GET  requests/                        lab requests (?status= &priority= &patient=)
    POST requests/<id>/start-processing/  PAID -> IN_PROGRESS
    GET/POST bills/                       list / create bill for lab_request_ids
    POST bills/<id>/mark-paid/            confirm payment -> requests PAID
    POST bills/<id>/cancel/               cancel unpaid bill -> requests REQUESTED
    GET/POST results/                     list / enter result (-> request COMPLETED)
"""
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from cmsapp.models import LabBill, LabRequest, LabResult, MasterLabTest

from . import services
from .permissions import IsLabTechnician, IsLabTechnicianOrDoctor, limit_to_own_consultations
from .serializers import (
    LabBillCreateSerializer,
    LabBillDetailSerializer,
    LabBillPaymentSerializer,
    LabBillSerializer,
    LabRequestSerializer,
    LabResultCreateSerializer,
    LabResultSerializer,
    MasterLabTestSerializer,
)


def _filter_by_params(queryset, params, mapping):
    """Apply ?query_param=value filters. mapping = {param_name: orm_lookup}."""
    for param, lookup in mapping.items():
        value = params.get(param)
        if value:
            queryset = queryset.filter(**{lookup: value})
    return queryset


# ------------------------------------------------------------------ master tests
class MasterLabTestViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only. Creating/editing tests is a Clinic Admin job."""
    serializer_class = MasterLabTestSerializer
    permission_classes = [IsLabTechnicianOrDoctor]
    queryset = MasterLabTest.objects.filter(is_active=True).order_by("test_name")


# ------------------------------------------------------------------ lab requests
class LabRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lab requests are CREATED by the Doctor app inside the consultation
    transaction, so this viewset is read-only plus one workflow action.
    """
    serializer_class = LabRequestSerializer

    def get_permissions(self):
        if self.action == "start_processing":
            return [IsLabTechnician()]
        return [IsLabTechnicianOrDoctor()]

    def get_queryset(self):
        qs = (
            LabRequest.objects.filter(is_active=True)
            .select_related("test", "consultation__patient")
            # 'URGENT' sorts after 'NORMAL' alphabetically, so -priority = urgent first.
            .order_by("-priority", "order_date")
        )
        qs = limit_to_own_consultations(qs, self.request.user, "consultation__doctor__staff__user")
        return _filter_by_params(qs, self.request.query_params, {
            "status": "status",
            "priority": "priority",
            "patient": "consultation__patient_id",
        })

    @action(detail=True, methods=["post"], url_path="start-processing")
    def start_processing(self, request, pk=None):
        req = services.start_processing(lab_request_id=pk)
        return Response(LabRequestSerializer(req).data)


# ------------------------------------------------------------------ bills
class LabBillViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """No update/delete: a bill only changes through mark-paid or cancel."""
    permission_classes = [IsLabTechnician]

    def get_queryset(self):
        qs = LabBill.objects.select_related("patient").order_by("-bill_date")
        return _filter_by_params(qs, self.request.query_params, {
            "payment_status": "payment_status",
            "patient": "patient_id",
        })

    def get_serializer_class(self):
        if self.action == "create":
            return LabBillCreateSerializer
        if self.action == "retrieve":
            return LabBillDetailSerializer
        if self.action == "mark_paid":
            return LabBillPaymentSerializer
        return LabBillSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bill = services.create_lab_bill(
            lab_request_ids=serializer.validated_data["lab_request_ids"]
        )
        return Response(LabBillDetailSerializer(bill).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bill = services.mark_bill_paid(
            bill_id=pk, payment_method=serializer.validated_data["payment_method"]
        )
        return Response(LabBillDetailSerializer(bill).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        bill = services.cancel_bill(bill_id=pk)
        return Response(LabBillDetailSerializer(bill).data)


# ------------------------------------------------------------------ results
class LabResultViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    Technicians create results; technicians and the consulting doctor read them.
    No update/delete - a result is a permanent clinical record.
    (If the team decides results may be corrected, add an explicit,
    audited "amend" action instead of opening PUT/PATCH.)
    """
    def get_permissions(self):
        if self.action == "create":
            return [IsLabTechnician()]
        return [IsLabTechnicianOrDoctor()]

    def get_serializer_class(self):
        return LabResultCreateSerializer if self.action == "create" else LabResultSerializer

    def get_queryset(self):
        qs = LabResult.objects.select_related(
            "lab_request__test", "lab_request__consultation", "technician"
        ).order_by("-result_date")
        qs = limit_to_own_consultations(
            qs, self.request.user, "lab_request__consultation__doctor__staff__user"
        )
        return _filter_by_params(qs, self.request.query_params, {
            "lab_request": "lab_request_id",
            "consultation": "lab_request__consultation_id",
            "patient": "lab_request__consultation__patient_id",
        })

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.enter_result(
            lab_request=serializer.validated_data["lab_request"],
            technician_user=request.user,
            data=serializer.validated_data,
        )
        return Response(LabResultSerializer(result).data, status=status.HTTP_201_CREATED)