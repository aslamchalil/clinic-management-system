import token

from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from django.db.migrations import serializer
from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse

from .serializers import DoctorTodayAppointmentSerializer, PrescriptionDetailSerializer

from cmsapp.models import Appointment, Prescription, PrescriptionItem
from .serializers import PrescriptionItemSerializer

from cmsapp.models import Consultation, Token, Patient, Prescription

from rest_framework.response import Response

from cmsapp.models import Consultation, Token
from .serializers import ConsultationSerializer
from django.db import transaction
from rest_framework import generics, status

from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from cmsapp.models import Patient

from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from cmsapp.models import Token
from .serializers import DoctorQueueSerializer,PatientDetailsSerializer

from .serializers import (
    ConsultationSerializer,
    DoctorQueueSerializer,
    PatientDetailsSerializer,
    PrescriptionSerializer,
)

from cmsapp.models import LabRequest
from .serializers import LabRequestSerializer

class DoctorQueueAPIView(generics.ListAPIView):
    serializer_class = DoctorQueueSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Token.objects.none()

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Token.objects.none()

        return Token.objects.filter(
            doctor=doctor,
            token_date=timezone.localdate(),
            status__in=[
                Token.StatusChoices.WAITING,
                Token.StatusChoices.CALLED,
                Token.StatusChoices.CONSULTING,
            ],
        ).select_related(
            "patient",
            "doctor",
        ).order_by("token_number")


class DoctorTodayAppointmentsAPIView(generics.ListAPIView):
    serializer_class = DoctorTodayAppointmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Appointment.objects.none()

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Appointment.objects.none()

        return Appointment.objects.filter(
            doctor=doctor,
            appointment_date=timezone.localdate(),
        ).select_related(
            "patient",
            "doctor",
        ).order_by("appointment_time_slot")



class DoctorPatientDetailsAPIView(RetrieveAPIView):
    serializer_class = PatientDetailsSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "patient_id"

    def get_queryset(self):
        user = self.request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Patient.objects.none()

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Patient.objects.none()

        today = timezone.localdate()

        # The doctor must have an active session right now.
        current_time = timezone.localtime().time()

        active_sessions = doctor.sessions.filter(
            is_active=True,
            start_time__lte=current_time,
            end_time__gte=current_time,
        ).values_list("session", flat=True)

        # Allow access when the patient has either:
        # 1. A CALLED token with no consultation yet, or
        # 2. A CONSULTING token with an existing consultation.
        valid_tokens = Token.objects.filter(
            doctor=doctor,
            token_date=today,
            session__in=active_sessions,
            status__in=[
                Token.StatusChoices.CALLED,
                Token.StatusChoices.CONSULTING,
            ],
        )

        return Patient.objects.filter(
            patient_id=self.kwargs["patient_id"],
            tokens__in=valid_tokens,
            is_active=True,
        ).distinct()



class ConsultationCreateAPIView(generics.CreateAPIView):
    serializer_class = ConsultationSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        user = request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Response(
                {"detail": "Doctor profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Response(
                {"detail": "Only active doctors can create consultations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Ensure the token belongs to the logged-in doctor.
        if serializer.validated_data["token"].doctor_id != doctor.doc_id:
            return Response(
                {"detail": "This token does not belong to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            token = Token.objects.select_for_update().get(
                pk=serializer.validated_data["token"].pk
            )

            if token.status != Token.StatusChoices.CALLED:
                return Response(
                    {"detail": "Only a called token can start a consultation."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if hasattr(token, "consultation"):
                return Response(
                    {"detail": "A consultation already exists for this token."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create the consultation.
            consultation = serializer.save()

            # Mark the token as being in progress.
            token.status = Token.StatusChoices.CONSULTING
            token.save(update_fields=["status"])
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED,
        )



class PrescriptionCreateAPIView(generics.CreateAPIView):
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        user = request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Response(
                {"detail": "Doctor profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Response(
                {"detail": "Only active doctors can create prescriptions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        consultation = serializer.validated_data["consultation"]

        if consultation.doctor_id != doctor.doc_id:
            return Response(
                {"detail": "This consultation does not belong to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if consultation.token.status != Token.StatusChoices.CONSULTING:
            return Response(
                {
                    "detail": (
                        "Prescriptions can only be created "
                        "during an active consultation."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            consultation = Consultation.objects.select_for_update().get(
                pk=consultation.pk
            )

            if hasattr(consultation, "prescription"):
                return Response(
                    {
                        "detail":
                        "A prescription already exists for this consultation."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            prescription = serializer.save()

        return Response(
            self.get_serializer(prescription).data,
            status=status.HTTP_201_CREATED,
        )


class PrescriptionItemCreateAPIView(generics.CreateAPIView):
    serializer_class = PrescriptionItemSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        user = request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Response(
                {"detail": "Doctor profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Response(
                {"detail": "Only active doctors can add prescription items."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        prescription = serializer.validated_data["prescription"]

        if prescription.consultation.token.status != Token.StatusChoices.CONSULTING:
            return Response(
                {
                    "detail": (
                        "Prescription items can only be added "
                        "during an active consultation."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        prescription_item = serializer.save()

        return Response(
            self.get_serializer(prescription_item).data,
            status=status.HTTP_201_CREATED,
        )


class PrescriptionDetailAPIView(generics.RetrieveAPIView):
    serializer_class = PrescriptionDetailSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "prescription_id"

    def get_queryset(self):
        user = self.request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Prescription.objects.none()

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Prescription.objects.none()

        return Prescription.objects.filter(
            consultation__doctor=doctor
        ).prefetch_related(
            "items__medicine",
            "items__dosage",
        )


class LabRequestCreateAPIView(generics.CreateAPIView):
    serializer_class = LabRequestSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        user = request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Response(
                {"detail": "Doctor profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Response(
                {"detail": "Only active doctors can request lab tests."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        consultation = serializer.validated_data["consultation"]

        if consultation.doctor_id != doctor.doc_id:
            return Response(
                {"detail": "This consultation does not belong to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if consultation.token.status != Token.StatusChoices.CONSULTING:
            return Response(
                {
                    "detail": (
                        "Lab requests can only be created "
                        "during an active consultation."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        lab_request = serializer.save()

        return Response(
            self.get_serializer(lab_request).data,
            status=status.HTTP_201_CREATED,
        )



class LabRequestListAPIView(generics.ListAPIView):
    serializer_class = LabRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return LabRequest.objects.none()

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return LabRequest.objects.none()

        return LabRequest.objects.filter(
            consultation__doctor=doctor,
            is_active=True,
        ).select_related(
            "consultation",
            "test",
        ).order_by("-order_date")


class LabRequestDetailAPIView(generics.RetrieveAPIView):
    serializer_class = LabRequestSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "lab_request_id"

    def get_queryset(self):
        user = self.request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return LabRequest.objects.none()

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return LabRequest.objects.none()

        return LabRequest.objects.filter(
            consultation__doctor=doctor,
            is_active=True,
        ).select_related("consultation", "test")


class ConsultationFinalizeAPIView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, consultation_id):
        user = request.user

        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Response(
                {"detail": "Doctor profile not found."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Response(
                {"detail": "Only active doctors can finalize consultations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            try:
                consultation = Consultation.objects.select_for_update().get(
                    consult_id=consultation_id,
                    doctor=doctor,
                )
            except Consultation.DoesNotExist:
                return Response(
                    {"detail": "Consultation not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            token = Token.objects.select_for_update().get(
                pk=consultation.token_id
            )

            if token.status != Token.StatusChoices.CONSULTING:
                return Response(
                    {"detail": "Only consulting tokens can be finalized."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            pending_lab_requests = LabRequest.objects.filter(
                consultation=consultation,
                is_active=True,
            ).exclude(
                status__in=[
                    LabRequest.StatusChoices.COMPLETED,
                    LabRequest.StatusChoices.CANCELLED,
                ]
            )

            if pending_lab_requests.exists():
                return Response(
                    {
                        "detail": (
                            "Consultation cannot be finalized while "
                            "required lab requests are unfinished."
                        ),
                        "pending_lab_request_ids": list(
                            pending_lab_requests.values_list(
                                "lab_request_id",
                                flat=True,
                            )
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            token.status = Token.StatusChoices.COMPLETED
            token.save(update_fields=["status"])

        return Response(
            {
                "detail": "Consultation finalized successfully.",
                "consultation_id": consultation.consult_id,
                "token_id": token.token_id,
                "token_status": token.status,
            },
            status=status.HTTP_200_OK,
        )

class DoctorCallNextTokenAPIView(APIView):
    """Atomically call a waiting token assigned to the logged-in doctor."""
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, token_id):
        user = request.user
        try:
            staff = user.staff_profile
            doctor = staff.doctor_profile
        except Exception:
            return Response(
                {"detail": "An active doctor account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if (
            not user.is_active
            or not staff.is_active
            or not staff.role.is_active
            or staff.role.role_name.upper() != "DOCTOR"
            or not doctor.is_active
        ):
            return Response(
                {"detail": "An active doctor account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        token = get_object_or_404(
            Token.objects.select_for_update().select_related("patient", "doctor"),
            token_id=token_id,
            doctor=doctor,
            token_date=timezone.localdate(),
        )
        if token.status != Token.StatusChoices.WAITING:
            return Response(
                {"detail": f"Only WAITING tokens can be called. Current status: {token.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token.status = Token.StatusChoices.CALLED
        token.save(update_fields=["status"])
        return Response(
            {
                "detail": "Patient called successfully.",
                "token_id": token.token_id,
                "token_number": token.token_number,
                "patient": token.patient_id,
                "patient_name": token.patient.full_name,
                "status": token.status,
            },
            status=status.HTTP_200_OK,
        )