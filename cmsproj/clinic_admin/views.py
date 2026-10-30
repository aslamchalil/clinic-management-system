

# Create your views here.

from datetime import datetime
from decimal import Decimal

from django.utils import timezone
from cmsapp.models import Staff
from cmsapp.models import Doctor, MasterLabTest, StockRequest, RegistrationBill, PharmacyBill, LabBill, PharmacyStock
from .serializers import (
    AdminLabTestSerializer,
    DoctorAdminSerializer,
    StaffCreateSerializer,
    StaffSerializer,
    StockRequestCreateSerializer,
    StockRequestReviewSerializer,
    StockRequestSerializer,
)
from .permissions import IsAdminStaff
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied, ValidationError

from .permissions import IsAdminStaff

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from cmsapp.models import Role, Department, Specialization
from .serializers import (
    RoleSerializer,
    DepartmentSerializer,
    SpecializationSerializer,
)

from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404

from cmsapp.models import Staff
from .serializers import LoginSerializer


class LoginAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        user = authenticate(
            request,
            username=username,
            password=password
        )

        if user is None or not user.is_active:
            return Response(
                {"detail": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            staff = Staff.objects.select_related(
                "role", "department"
            ).get(user=user)
        except Staff.DoesNotExist:
            return Response(
                {"detail": "No staff profile is linked to this account."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not staff.is_active or not staff.role.is_active:
            return Response(
                {"detail": "This staff account or role is inactive."},
                status=status.HTTP_403_FORBIDDEN
            )

        role = staff.role.role_name.upper()

        # A doctor account must have a corresponding Doctor profile.
        if role == "DOCTOR":
            from cmsapp.models import Doctor

            if not Doctor.objects.filter(staff=staff, is_active=True).exists():
                return Response(
                    {"detail": "No active doctor profile is linked to this account."},
                    status=status.HTTP_403_FORBIDDEN
                )

        refresh = RefreshToken.for_user(user)

        role_pages = {
            "ADMIN": "/admin",
            "DOCTOR": "/doctor",
            "RECEPTIONIST": "/receptionist",
            "PHARMACIST": "/pharmacy",
            "LAB_TECHNICIAN": "/lab",
        }

        return Response(
            {
                "message": "Login successful.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.pk,
                    "username": user.username,
                    "first_name": staff.first_name,
                    "last_name": staff.last_name,
                    "role": role,
                    "staff_id": staff.staff_id,
                    "department": staff.department.department_name,
                },
                "redirect_to": role_pages.get(role),
            },
            status=status.HTTP_200_OK
        )


class TestProtectedAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "message": "JWT authentication successful!",
            "username": request.user.username
        })


class RoleListCreateAPIView(generics.ListCreateAPIView):
    queryset = Role.objects.all().order_by("role_id")
    serializer_class = RoleSerializer
    permission_classes = [IsAdminStaff]


class DepartmentListCreateAPIView(generics.ListCreateAPIView):
    queryset = Department.objects.all().order_by("department_id")
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminStaff]


class DepartmentDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminStaff]
    lookup_field = "department_id"

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class SpecializationListCreateAPIView(generics.ListCreateAPIView):
    queryset = Specialization.objects.all().order_by("spec_id")
    serializer_class = SpecializationSerializer
    permission_classes = [IsAdminStaff]


class SpecializationDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Specialization.objects.all()
    serializer_class = SpecializationSerializer
    permission_classes = [IsAdminStaff]
    lookup_field = "spec_id"

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])


class DoctorProfileListCreateAPIView(generics.ListCreateAPIView):
    queryset = Doctor.objects.select_related(
        "staff", "staff__user", "staff__role", "staff__department", "specialization"
    ).order_by("doc_id")
    serializer_class = DoctorAdminSerializer
    permission_classes = [IsAdminStaff]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
        except IntegrityError:
            return Response(
                {"detail": "A Doctor profile already exists for this staff member or license."},
                status=status.HTTP_409_CONFLICT,
            )
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class DoctorProfileDetailAPIView(generics.RetrieveUpdateAPIView):
    queryset = Doctor.objects.select_related(
        "staff", "staff__user", "staff__role", "staff__department", "specialization"
    )
    serializer_class = DoctorAdminSerializer
    permission_classes = [IsAdminStaff]
    lookup_field = "doc_id"


class AdminLabTestListCreateAPIView(generics.ListCreateAPIView):
    queryset = MasterLabTest.objects.all().order_by("test_name", "test_id")
    serializer_class = AdminLabTestSerializer
    permission_classes = [IsAdminStaff]


class AdminLabTestDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = MasterLabTest.objects.all()
    serializer_class = AdminLabTestSerializer
    permission_classes = [IsAdminStaff]
    lookup_field = "test_id"

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])



class StaffListCreateAPIView(generics.ListCreateAPIView):
    queryset = Staff.objects.select_related(
        "user", "role", "department"
    ).order_by("staff_id")

    permission_classes = [IsAdminStaff]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return StaffCreateSerializer

        # For GET requests, return staff details without passwords.
        from .serializers import StaffSerializer
        return StaffSerializer



class StaffDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Staff.objects.select_related(
        "user", "role", "department"
    )
    serializer_class = StaffSerializer
    permission_classes = [IsAdminStaff]
    lookup_field = "staff_id"

    @transaction.atomic
    def perform_destroy(self, instance):
        # Deactivate instead of permanently deleting the staff record.
        instance.is_active = False
        instance.save(update_fields=["is_active"])

        # Prevent the linked account from logging in.
        instance.user.is_active = False
        instance.user.save(update_fields=["is_active"])


class StaffStockRequestListCreateAPIView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = StockRequestSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.get_staff_for_stock_request()

    def get_staff_for_stock_request(self):
        if not self.request.user.is_active:
            raise PermissionDenied("An active user account is required.")
        try:
            staff = self.request.user.staff_profile
        except Exception:
            raise PermissionDenied("Your account is not linked to a staff profile.")
        if not staff.is_active or not staff.role.is_active or not staff.department.is_active:
            raise PermissionDenied("An active staff account, role, and department are required.")
        role_name = staff.role.role_name.strip().upper()
        department_name = staff.department.department_name.strip().casefold()
        pharmacy = role_name == "PHARMACIST" and "pharm" in department_name
        laboratory = role_name in ("LAB_ASSISTANT", "LAB_TECHNICIAN") and "lab" in department_name
        if not (pharmacy or laboratory):
            raise PermissionDenied("Only Pharmacy or Laboratory staff may use this endpoint.")
        return staff

    def get_queryset(self):
        staff = self.get_staff_for_stock_request()
        return StockRequest.objects.filter(requested_by=staff).select_related(
            "medicine", "requested_by", "reviewed_by"
        ).order_by("-created_at")

    def get_serializer_class(self):
        return StockRequestCreateSerializer if self.request.method == "POST" else StockRequestSerializer

    def perform_create(self, serializer):
        self.get_staff_for_stock_request()
        serializer.save()

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        staff = self.get_staff_for_stock_request()
        Department.objects.select_for_update().get(pk=staff.department_id)
        return super().create(request, *args, **kwargs)


class AdminStockRequestListAPIView(generics.ListAPIView):
    permission_classes = [IsAdminStaff]
    serializer_class = StockRequestSerializer
    queryset = StockRequest.objects.select_related(
        "medicine", "requested_by", "reviewed_by"
    ).order_by("-created_at")

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter in StockRequest.StatusChoices.values:
            queryset = queryset.filter(status=status_filter)
        return queryset


class AdminStockRequestReviewAPIView(APIView):
    permission_classes = [IsAdminStaff]

    @transaction.atomic
    def post(self, request, request_id):
        stock_request = get_object_or_404(
            StockRequest.objects.select_for_update(), request_id=request_id
        )
        serializer = StockRequestReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if stock_request.status != StockRequest.StatusChoices.PENDING:
            return Response(
                {"detail": "Only pending stock requests can be reviewed."},
                status=status.HTTP_409_CONFLICT,
            )
        admin_staff = Staff.objects.select_related("role").get(user=request.user)
        approved_quantity = None
        if serializer.validated_data["status"] == StockRequest.StatusChoices.APPROVED:
            approved_quantity = serializer.validated_data.get(
                "approved_quantity", stock_request.requested_quantity
            )
            if stock_request.department == StockRequest.DepartmentChoices.PHARMACY:
                if stock_request.medicine_id is None:
                    raise ValidationError({"medicine": "Pharmacy stock requests must reference a medicine."})
                try:
                    stock = PharmacyStock.objects.select_for_update().get(
                        medicine_id=stock_request.medicine_id
                    )
                except PharmacyStock.DoesNotExist:
                    raise ValidationError({
                        "stock": "Create the medicine's stock record before approving its replenishment request."
                    })
                stock.quantity += approved_quantity
                stock.save(update_fields=["quantity"])
        stock_request.status = serializer.validated_data["status"]
        stock_request.approved_quantity = approved_quantity
        stock_request.review_note = serializer.validated_data.get("review_note", "")
        stock_request.reviewed_by = admin_staff
        stock_request.reviewed_at = timezone.now()
        stock_request.save(update_fields=[
            "status", "approved_quantity", "review_note", "reviewed_by", "reviewed_at", "updated_at"
        ])
        return Response(StockRequestSerializer(stock_request).data)


def _bill_summary_and_pending(queryset, id_field, patient_field, amount_field, date_field, department):
    billed = Decimal("0.00")
    collected = Decimal("0.00")
    outstanding = Decimal("0.00")
    pending = []
    for bill in queryset:
        status_value = bill.payment_status
        amount = getattr(bill, amount_field)
        # Cancelled and refunded records are historical, but are excluded from
        # the current billed/collected/outstanding totals.
        if status_value in ("CANCELLED", "REFUNDED"):
            continue
        billed += amount
        if status_value == "PAID":
            collected += amount
        elif status_value == "PENDING":
            outstanding += amount
            patient = getattr(bill, patient_field)
            pending.append({
                "bill_id": getattr(bill, id_field),
                "patient": patient.full_name,
                "date": timezone.localtime(getattr(bill, date_field)).isoformat(),
                "amount": str(amount),
                "department": department,
                "payment_status": status_value,
            })
    return {
        "billed": billed,
        "collected": collected,
        "outstanding": outstanding,
        "pending": pending,
    }


class AdminMonthlyBillsAPIView(APIView):
    permission_classes = [IsAdminStaff]

    def get(self, request):
        today = timezone.localdate()
        try:
            year = int(request.query_params.get("year", today.year))
            month = int(request.query_params.get("month", today.month))
            if not 1 <= month <= 12 or not 2000 <= year <= 2200:
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {"detail": "Provide a valid month (1–12) and year (2000–2200)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        start = timezone.make_aware(datetime(year, month, 1), timezone.get_current_timezone())
        if month == 12:
            end = timezone.make_aware(datetime(year + 1, 1, 1), timezone.get_current_timezone())
        else:
            end = timezone.make_aware(datetime(year, month + 1, 1), timezone.get_current_timezone())

        reception = _bill_summary_and_pending(
            RegistrationBill.objects.filter(bill_date__gte=start, bill_date__lt=end).select_related("patient").order_by("bill_date"),
            "bill_id", "patient", "total_amount", "bill_date", "Reception",
        )
        pharmacy = _bill_summary_and_pending(
            PharmacyBill.objects.filter(bill_date__gte=start, bill_date__lt=end).select_related("patient").order_by("bill_date"),
            "pharmacy_bill_id", "patient", "total_amount", "bill_date", "Pharmacy",
        )
        lab = _bill_summary_and_pending(
            LabBill.objects.filter(bill_date__gte=start, bill_date__lt=end).select_related("patient").order_by("bill_date"),
            "lab_bill_id", "patient", "total_amount", "bill_date", "Lab",
        )
        summary = {name: {key: str(value) for key, value in result.items() if key != "pending"}
                   for name, result in (("reception", reception), ("pharmacy", pharmacy), ("lab", lab))}
        summary["general_total"] = {
            key: str(sum((result[key] for result in (reception, pharmacy, lab)), Decimal("0.00")))
            for key in ("billed", "collected", "outstanding")
        }
        return Response({
            "year": year,
            "month": month,
            "summary": summary,
            "pending": {
                "reception": reception["pending"],
                "pharmacy": pharmacy["pending"],
                "lab": lab["pending"],
            },
            "excluded_statuses": ["CANCELLED", "REFUNDED"],
        })
