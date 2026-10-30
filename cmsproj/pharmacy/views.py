
from django.db.models import F, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cmsapp.models import (
    Patient,
    PharmacyBill,
    PharmacyStock,
    Prescription,
    PrescriptionItem,
    MasterMedicine,
)

from .serializers import (
    PharmacyBillSerializer,
    PrescriptionSerializer,
    MasterMedicineSerializer,
    PharmacyStockSerializer,
    PharmacyPatientSearchSerializer,
)
from .services import create_prescription_bill, record_bill_payment, dispense_bill


# Common permission check for Pharmacy APIs
class PharmacistPermissionMixin:
    permission_classes = [IsAuthenticated]

    def check_pharmacist(self):
        user = self.request.user

        try:
            staff = user.staff_profile
        except Exception:
            raise PermissionDenied(
                "Your account is not linked to a staff profile."
            )

        if not user.is_active or not staff.is_active or not staff.role.is_active or not staff.department.is_active:
            raise PermissionDenied(
                "Your staff account is inactive."
            )

        if staff.role.role_name.strip().upper() != "PHARMACIST":
            raise PermissionDenied(
                "Only pharmacists can access this API."
            )

        return staff


class AdminOrPharmacistPermissionMixin:
    permission_classes = [IsAuthenticated]

    def check_admin_or_pharmacist(self):
        user = self.request.user

        try:
            staff = user.staff_profile
        except Exception:
            raise PermissionDenied(
                "Your account is not linked to a staff profile."
            )

        if not user.is_active or not staff.is_active or not staff.role.is_active or not staff.department.is_active:
            raise PermissionDenied(
                "Your staff account is inactive."
            )

        role_name = staff.role.role_name.strip().upper()

        if role_name not in ("ADMIN", "ADMINISTRATOR", "PHARMACIST"):
            raise PermissionDenied(
                "Only Admin or Pharmacist can access this API."
            )

        return staff

    def check_admin_only(self):
        staff = self.check_admin_or_pharmacist()
        if staff.role.role_name.strip().upper() not in ("ADMIN", "ADMINISTRATOR"):
            raise PermissionDenied("Only Admin can manage medicine and stock records.")
        return staff


class PharmacyDashboardAPIView(PharmacistPermissionMixin, APIView):
    def get(self, request):
        self.check_pharmacist()
        today = timezone.localdate()
        return Response({
            "pending_prescription_items": PrescriptionItem.objects.filter(
                is_active=True, dispensed_quantity__lt=F("prescribed_quantity")
            ).count(),
            "low_stock_medicines": PharmacyStock.objects.filter(
                medicine__is_active=True, quantity__lte=F("reorder_level")
            ).count(),
            "pending_pharmacy_bills": PharmacyBill.objects.filter(
                payment_status=PharmacyBill.PaymentStatusChoices.PENDING
            ).count(),
            "paid_pharmacy_bills": PharmacyBill.objects.filter(
                payment_status=PharmacyBill.PaymentStatusChoices.PAID
            ).count(),
            "dispensed_today": PharmacyBill.objects.filter(
                dispensed_at__date=today
            ).count(),
        })


class PharmacyPatientSearchAPIView(PharmacistPermissionMixin, generics.ListAPIView):
    serializer_class = PharmacyPatientSearchSerializer

    def get_queryset(self):
        self.check_pharmacist()
        query = self.request.query_params.get("q", "").strip()[:100]
        if not query:
            return Patient.objects.none()
        search = Q(full_name__icontains=query) | Q(phone_number__icontains=query)
        if query.isdigit() and len(query) <= 10 and int(query) <= 2147483647:
            search |= Q(patient_id=int(query))
        return Patient.objects.filter(is_active=True).filter(search).order_by("full_name")[:20]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        return Response(self.get_serializer(queryset, many=True).data)

# 1. View prescriptions
class PharmacyPrescriptionListAPIView(
    PharmacistPermissionMixin,
    generics.ListAPIView,
):
    serializer_class = PrescriptionSerializer

    def get_queryset(self):
        self.check_pharmacist()
        prescriptions = (
            Prescription.objects
            .select_related(
                "consultation",
                "consultation__patient",
                "consultation__doctor",
            )
            .prefetch_related(
                "items",
                "items__medicine",
                "items__dosage",
            )
            .order_by("-created_at")
        )
        patient_id = self.request.query_params.get("patient")
        if patient_id:
            if not patient_id.isdigit() or len(patient_id) > 10 or int(patient_id) <= 0:
                return Prescription.objects.none()
            prescriptions = prescriptions.filter(consultation__patient_id=patient_id)
        return prescriptions


# 2. List and create medicines

class PharmacyMedicineListCreateAPIView(
    AdminOrPharmacistPermissionMixin,
    generics.ListCreateAPIView,
):
    serializer_class = MasterMedicineSerializer

    def get_queryset(self):
        self.check_admin_or_pharmacist()
        return MasterMedicine.objects.order_by("name")

    def create(self, request, *args, **kwargs):
        self.check_admin_only()
        return super().create(request, *args, **kwargs)



# 3. View and update a medicine

class PharmacyMedicineDetailAPIView(
    AdminOrPharmacistPermissionMixin,
    generics.RetrieveUpdateAPIView,
):
    serializer_class = MasterMedicineSerializer
    queryset = MasterMedicine.objects.all()
    lookup_field = "medicine_id"

    def get_object(self):
        self.check_admin_or_pharmacist()
        return super().get_object()

    def update(self, request, *args, **kwargs):
        self.check_admin_only()
        return super().update(request, *args, **kwargs)


# 4. List and create stock records
class PharmacyStockListCreateAPIView(
    AdminOrPharmacistPermissionMixin,
    generics.ListCreateAPIView,
):
    serializer_class = PharmacyStockSerializer

    def get_queryset(self):
        self.check_admin_or_pharmacist()
        return (
            PharmacyStock.objects
            .select_related("medicine")
            .order_by("medicine__name")
        )

    def create(self, request, *args, **kwargs):
        self.check_admin_only()
        return super().create(request, *args, **kwargs)


# 5. View and update a stock record
class PharmacyStockDetailAPIView(
    AdminOrPharmacistPermissionMixin,
    generics.RetrieveUpdateAPIView,
):
    serializer_class = PharmacyStockSerializer
    queryset = PharmacyStock.objects.select_related("medicine")
    lookup_field = "stock_id"

    def get_object(self):
        self.check_admin_or_pharmacist()
        return super().get_object()

    def update(self, request, *args, **kwargs):
        self.check_admin_only()
        return super().update(request, *args, **kwargs)


# 6. View and create pharmacy bills
class PharmacyBillAPIView(
    PharmacistPermissionMixin,
    APIView,
):

    # GET: List existing pharmacy bills
    def get(self, request):
        self.check_pharmacist()
        bills = (
            PharmacyBill.objects
            .select_related("patient", "pharmacist")
            .prefetch_related("items__medicine", "items__prescription_item__dosage")
            .order_by("-bill_date")
        )
        patient_id = request.query_params.get("patient")
        if patient_id:
            if not patient_id.isdigit() or int(patient_id) <= 0:
                raise ValidationError({"patient": "Provide a valid patient ID."})
            bills = bills.filter(patient_id=patient_id)
        payment_status = request.query_params.get("payment_status")
        if payment_status in PharmacyBill.PaymentStatusChoices.values:
            bills = bills.filter(payment_status=payment_status)
        return Response(PharmacyBillSerializer(bills, many=True).data, status=status.HTTP_200_OK)

    # POST: Create a pharmacy bill
    def post(self, request):
        staff = self.check_pharmacist()
        bill = create_prescription_bill(staff, request.data)
        return Response(PharmacyBillSerializer(bill).data, status=status.HTTP_201_CREATED)

class PharmacyBillPaymentAPIView(
    PharmacistPermissionMixin,
    APIView,
):
    def patch(self, request, bill_id):
        self.check_pharmacist()
        bill, changed = record_bill_payment(bill_id, request.data.get("payment_method"))
        return Response({**PharmacyBillSerializer(bill).data, "payment_confirmed_now": changed}, status=status.HTTP_200_OK)


class PharmacyBillDispenseAPIView(PharmacistPermissionMixin, APIView):
    def post(self, request, bill_id):
        self.check_pharmacist()
        bill, changed = dispense_bill(bill_id)
        return Response({**PharmacyBillSerializer(bill).data, "dispensed_now": changed}, status=status.HTTP_200_OK)
