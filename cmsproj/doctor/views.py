import token
from datetime import datetime, time, timedelta

from django.db.models import F, Q

from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from django.db.migrations import serializer
from django.shortcuts import render

# Create your views here.
from django.http import HttpResponse

from .serializers import DoctorTodayAppointmentSerializer, PrescriptionDetailSerializer

from cmsapp.models import Appointment, Prescription, PrescriptionItem, Doctor, DoctorSession, Dosage, MasterMedicine, MasterLabTest, RegistrationBill
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
    DoctorConsultationSerializer,
    DoctorPatientSearchSerializer,
    DoctorMedicineSerializer,
    DoctorDosageSerializer,
    DoctorLabTestSerializer,
)

from cmsapp.models import LabRequest
from .serializers import LabRequestSerializer
from .permissions import IsActiveDoctor, get_active_doctor


def _current_doctor_session(doctor, session_name=None):
    current_time = timezone.localtime().time()
    sessions = doctor.sessions.filter(
        is_active=True,
        start_time__lte=current_time,
        end_time__gt=current_time,
    )
    if session_name:
        sessions = sessions.filter(session=session_name)
    return sessions.exists()


def _token_eligibility_error(token_record, doctor, *, require_current_session=True):
    today = timezone.localdate()
    if token_record.doctor_id != doctor.doc_id:
        return "This token does not belong to you."
    if token_record.token_date != today:
        return "Only today's clinic tokens can be processed."
    if not token_record.patient.is_active or not doctor.is_active:
        return "The patient and Doctor profile must be active."
    if token_record.bill.payment_status != "PAID":
        return "The linked registration bill must be paid first."
    if not doctor.sessions.filter(is_active=True, session=token_record.session).exists():
        return "This token does not have an active Doctor session."
    if require_current_session and not _current_doctor_session(doctor, token_record.session):
        return "The Doctor session for this token is not active right now."
    appointment = token_record.appointment
    if token_record.bill.doctor_id != doctor.doc_id or token_record.bill.patient_id != token_record.patient_id:
        return "The linked bill does not match this token."
    if token_record.bill.appointment_id and token_record.bill.appointment_id != token_record.appointment_id:
        return "The token appointment does not match its bill."
    if appointment and (
        appointment.doctor_id != doctor.doc_id
        or appointment.patient_id != token_record.patient_id
        or appointment.appointment_date != token_record.token_date
        or appointment.status != Appointment.StatusChoices.BOOKED
    ):
        return "The linked appointment is not eligible for this token."
    if appointment and not doctor.sessions.filter(
        is_active=True,
        session=token_record.session,
        start_time__lte=appointment.appointment_time_slot,
        end_time__gt=appointment.appointment_time_slot,
    ).exists():
        return "The token session does not match its appointment time."
    return None


class DoctorDashboardAPIView(APIView):
    permission_classes = [IsActiveDoctor]

    def get(self, request):
        doctor = get_active_doctor(request.user)
        today = timezone.localdate()
        tokens = Token.objects.filter(doctor=doctor, token_date=today)
        appointments = Appointment.objects.filter(doctor=doctor, appointment_date=today).select_related(
            "patient", "doctor"
        ).prefetch_related("tokens")
        recent = Consultation.objects.filter(doctor=doctor).select_related(
            "patient", "token"
        ).order_by("-created_at")[:8]
        now = timezone.localtime().time()
        sessions = [
            {
                "session": item.session,
                "start_time": item.start_time.isoformat(),
                "end_time": item.end_time.isoformat(),
                "is_current": item.start_time <= now < item.end_time,
            }
            for item in doctor.sessions.filter(is_active=True).order_by("start_time")
        ]
        completed = Consultation.objects.filter(
            doctor=doctor,
            token__token_date=today,
            token__status=Token.StatusChoices.COMPLETED,
        ).count()
        return Response({
            "date": today.isoformat(),
            "sessions": sessions,
            "counts": {
                "waiting": tokens.filter(status=Token.StatusChoices.WAITING).count(),
                "called": tokens.filter(status=Token.StatusChoices.CALLED).count(),
                "consultations_done": completed,
                "booked_appointments": appointments.filter(status=Appointment.StatusChoices.BOOKED).count(),
            },
            "appointments": DoctorTodayAppointmentSerializer(appointments, many=True).data,
            "queue": DoctorQueueSerializer(
                tokens.filter(status__in=[
                    Token.StatusChoices.WAITING,
                    Token.StatusChoices.CALLED,
                    Token.StatusChoices.CONSULTING,
                ]).select_related("patient", "bill", "appointment").order_by("session", "token_number"),
                many=True,
            ).data,
            "recent_consultations": DoctorConsultationSerializer(recent, many=True).data,
        })


class DoctorPatientSearchAPIView(generics.ListAPIView):
    serializer_class = DoctorPatientSearchSerializer
    permission_classes = [IsActiveDoctor]

    def get_queryset(self):
        doctor = get_active_doctor(self.request.user)
        query = self.request.query_params.get("q", "").strip()
        if not query:
            return Patient.objects.none()
        linked = Patient.objects.filter(
            Q(tokens__doctor=doctor) | Q(consultations__doctor=doctor),
            is_active=True,
        )
        search = Q(full_name__icontains=query) | Q(phone_number__icontains=query)
        if query.isdigit():
            search |= Q(patient_id=int(query))
        return linked.filter(search).distinct().order_by("full_name", "patient_id")[:20]


class DoctorConsultationHistoryAPIView(generics.ListAPIView):
    serializer_class = DoctorConsultationSerializer
    permission_classes = [IsActiveDoctor]

    def get_queryset(self):
        doctor = get_active_doctor(self.request.user)
        return Consultation.objects.filter(doctor=doctor).select_related(
            "patient", "token"
        ).order_by("-created_at")


class DoctorConsultationDetailAPIView(generics.RetrieveAPIView):
    serializer_class = DoctorConsultationSerializer
    permission_classes = [IsActiveDoctor]
    lookup_url_kwarg = "consultation_id"

    def get_queryset(self):
        doctor = get_active_doctor(self.request.user)
        return Consultation.objects.filter(doctor=doctor).select_related("patient", "token")


class DoctorMedicineListAPIView(generics.ListAPIView):
    serializer_class = DoctorMedicineSerializer
    permission_classes = [IsActiveDoctor]
    queryset = MasterMedicine.objects.filter(is_active=True).order_by("name")


class DoctorDosageListAPIView(generics.ListAPIView):
    serializer_class = DoctorDosageSerializer
    permission_classes = [IsActiveDoctor]

    def get_queryset(self):
        queryset = Dosage.objects.filter(is_active=True, medicine__is_active=True)
        medicine_id = self.request.query_params.get("medicine_id")
        if medicine_id:
            queryset = queryset.filter(medicine_id=medicine_id)
        return queryset.select_related("medicine").order_by("medicine__name", "dosage_value")


class DoctorLabTestListAPIView(generics.ListAPIView):
    serializer_class = DoctorLabTestSerializer
    permission_classes = [IsActiveDoctor]
    queryset = MasterLabTest.objects.filter(is_active=True).order_by("test_name")

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
            "bill",
            "appointment",
            "consultation",
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
        ).prefetch_related("tokens").order_by("appointment_time_slot")



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
            end_time__gt=current_time,
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
            bill__payment_status=RegistrationBill.PaymentStatusChoices.PAID,
        )

        return Patient.objects.filter(
            patient_id=self.kwargs["patient_id"],
            tokens__in=valid_tokens,
            is_active=True,
        ).filter(
            Q(tokens__appointment__isnull=True)
            | Q(
                tokens__appointment__status=Appointment.StatusChoices.BOOKED,
                tokens__appointment__appointment_date=today,
                tokens__appointment__patient_id=F("patient_id"),
                tokens__appointment__doctor=doctor,
            )
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

        submitted_token = serializer.validated_data["token"]
        if submitted_token.doctor_id != doctor.doc_id:
            return Response(
                {"detail": "This token does not belong to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        with transaction.atomic():
            token = Token.objects.select_for_update().select_related(
                "patient", "doctor", "bill", "appointment"
            ).get(pk=submitted_token.pk)

            eligibility_error = _token_eligibility_error(token, doctor)
            if eligibility_error:
                return Response({"detail": eligibility_error}, status=status.HTTP_400_BAD_REQUEST)

            if token.status != Token.StatusChoices.CALLED:
                return Response(
                    {"detail": "Only a called token can start a consultation."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if Consultation.objects.filter(token=token).exists():
                return Response(
                    {"detail": "A consultation already exists for this token."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create the consultation.
            serializer.validated_data["token"] = token
            consultation = serializer.save()

            # Mark the token as being in progress.
            token.status = Token.StatusChoices.CONSULTING
            token.save(update_fields=["status"])
        return Response(
            DoctorConsultationSerializer(consultation).data,
            status=status.HTTP_201_CREATED,
        )



class PrescriptionCreateAPIView(generics.ListCreateAPIView):
    serializer_class = PrescriptionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        doctor = get_active_doctor(self.request.user)
        if not doctor:
            return Prescription.objects.none()
        return Prescription.objects.filter(
            consultation__doctor=doctor
        ).select_related(
            "consultation__patient", "consultation__doctor"
        ).prefetch_related("items__medicine", "items__dosage").order_by("-created_at")

    def get_serializer_class(self):
        if self.request.method == "GET":
            return PrescriptionDetailSerializer
        return PrescriptionSerializer

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
            consultation = Consultation.objects.select_for_update().select_related(
                "token", "token__bill", "token__appointment", "token__patient", "token__doctor"
            ).get(
                pk=consultation.pk, doctor=doctor
            )

            token = Token.objects.select_for_update().select_related(
                "bill", "appointment", "patient", "doctor"
            ).get(pk=consultation.token_id)
            eligibility_error = _token_eligibility_error(token, doctor, require_current_session=False)
            if eligibility_error:
                return Response({"detail": eligibility_error}, status=status.HTTP_400_BAD_REQUEST)
            if token.status != Token.StatusChoices.CONSULTING:
                return Response({"detail": "Prescriptions can only be created during an active consultation."}, status=status.HTTP_400_BAD_REQUEST)

            if hasattr(consultation, "prescription"):
                return Response(
                    {
                        "detail":
                        "A prescription already exists for this consultation."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer.validated_data["consultation"] = consultation
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

        with transaction.atomic():
            prescription = Prescription.objects.select_related(
                "consultation"
            ).select_for_update().get(
                pk=prescription.pk,
                consultation__doctor=doctor,
            )
            consultation = Consultation.objects.select_for_update().get(
                pk=prescription.consultation_id,
                doctor=doctor,
            )
            token = Token.objects.select_for_update().select_related(
                "bill", "appointment", "patient", "doctor"
            ).get(pk=consultation.token_id)
            eligibility_error = _token_eligibility_error(
                token, doctor, require_current_session=False
            )
            if eligibility_error:
                return Response({"detail": eligibility_error}, status=status.HTTP_400_BAD_REQUEST)
            if token.status != Token.StatusChoices.CONSULTING:
                return Response({"detail": "Prescription items can only be added during an active consultation."}, status=status.HTTP_400_BAD_REQUEST)
            serializer.validated_data["prescription"] = prescription
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

        with transaction.atomic():
            consultation = Consultation.objects.select_for_update().get(
                pk=consultation.pk,
                doctor=doctor,
            )
            token = Token.objects.select_for_update().select_related(
                "bill", "appointment", "patient", "doctor"
            ).get(pk=consultation.token_id)
            eligibility_error = _token_eligibility_error(
                token, doctor, require_current_session=False
            )
            if eligibility_error:
                return Response({"detail": eligibility_error}, status=status.HTTP_400_BAD_REQUEST)
            if token.status != Token.StatusChoices.CONSULTING:
                return Response({"detail": "Lab requests can only be created during an active consultation."}, status=status.HTTP_400_BAD_REQUEST)
            serializer.validated_data["consultation"] = consultation
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

        local_today = timezone.localdate()
        local_day_start = timezone.make_aware(datetime.combine(local_today, time.min))
        local_day_end = timezone.make_aware(datetime.combine(local_today + timedelta(days=1), time.min))
        return LabRequest.objects.filter(
            consultation__doctor=doctor,
            is_active=True,
            order_date__gte=local_day_start,
            order_date__lt=local_day_end,
        ).select_related(
            "consultation", "consultation__patient",
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
            Token.objects.select_for_update().select_related(
                "patient", "doctor", "bill", "appointment", "consultation"
            ),
            token_id=token_id,
            doctor=doctor,
            token_date=timezone.localdate(),
        )
        eligibility_error = _token_eligibility_error(token, doctor)
        if eligibility_error:
            return Response({"detail": eligibility_error}, status=status.HTTP_400_BAD_REQUEST)
        if token.status != Token.StatusChoices.WAITING:
            return Response(
                {"detail": f"Only WAITING tokens can be called. Current status: {token.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Consultation.objects.filter(token=token).exists():
            return Response(
                {"detail": "A token with an existing consultation cannot be called again."},
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
