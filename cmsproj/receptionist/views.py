from datetime import date

from django.db import IntegrityError
from django.shortcuts import render

# Create your views here.

from django.utils import timezone
from django.utils.dateparse import parse_date



from django.db import transaction

from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from cmsapp.models import (
    Appointment, Doctor, RegistrationBill, Patient, Token, DoctorSession,
)
from .serializers import (
    AppointmentSerializer, DoctorDirectorySerializer, TokenSerializer,
)
from .permissions import IsAdminOrReceptionist

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from cmsapp.models import Patient
from .serializers import PatientSerializer, RegistrationBillSerializer
from clinic_admin.permissions import IsAdminStaff
from .date_utils import maximum_token_date


class PatientListCreateAPIView(generics.ListCreateAPIView):
    queryset = Patient.objects.all().order_by("patient_id")
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]



class PatientDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]
    lookup_field = "patient_id"

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active"])



class AppointmentListCreateAPIView(generics.ListCreateAPIView):
    queryset = Appointment.objects.select_related(
        "patient", "doctor", "doctor__staff"
    ).order_by("appointment_date", "appointment_time_slot")

    serializer_class = AppointmentSerializer
    permission_classes = [IsAdminOrReceptionist]


class AppointmentDetailAPIView(generics.RetrieveUpdateAPIView):
    queryset = Appointment.objects.select_related(
        "patient", "doctor", "doctor__staff"
    )

    serializer_class = AppointmentSerializer
    permission_classes = [IsAdminOrReceptionist]
    lookup_field = "appointment_id"


class DoctorDirectoryAPIView(generics.ListAPIView):
    queryset = Doctor.objects.select_related(
        "staff", "staff__role"
    ).prefetch_related(
        "sessions"
    ).filter(
        is_active=True,
        staff__is_active=True,
        staff__role__is_active=True,
    ).order_by("staff__first_name", "staff__last_name")
    serializer_class = DoctorDirectorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]



class RegistrationBillListCreateAPIView(generics.ListCreateAPIView):
    queryset = RegistrationBill.objects.select_related(
        "patient", "doctor"
    ).order_by("-bill_date")

    serializer_class = RegistrationBillSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
        except IntegrityError:
            # A concurrent retry may win the unique visit-identity insert.
            fields = serializer.validated_data
            appointment = fields.get("appointment")
            existing = (
                RegistrationBill.objects.filter(appointment=appointment).first()
                if appointment is not None
                else RegistrationBill.objects.filter(
                    visit_key=fields.get("visit_key")
                ).first()
            )
            if existing is None:
                raise
            if (
                existing.patient_id != fields["patient"].patient_id
                or existing.doctor_id != fields["doctor"].doc_id
            ):
                return Response(
                    {"detail": "This visit identity is already in use."},
                    status=status.HTTP_409_CONFLICT,
                )
            serializer.instance = existing
            serializer.was_reused = True

        headers = self.get_success_headers(serializer.data)
        response_status = (
            status.HTTP_200_OK if serializer.was_reused
            else status.HTTP_201_CREATED
        )
        return Response(serializer.data, status=response_status, headers=headers)


class RegistrationBillDetailAPIView(generics.RetrieveAPIView):
    queryset = RegistrationBill.objects.select_related(
        "patient", "doctor"
    )

    serializer_class = RegistrationBillSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]
    lookup_field = "bill_id"



class RegistrationBillPaymentAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]

    @transaction.atomic
    def post(self, request, bill_id):
        bill = get_object_or_404(
            RegistrationBill.objects.select_for_update(),
            bill_id=bill_id
        )

        if bill.payment_status == "PAID":
            requested_method = request.data.get("payment_method")
            response_data = {
                "detail": "Payment was already recorded; the persisted payment was not changed.",
                "bill_id": bill.bill_id,
                "total_amount": str(bill.total_amount),
                "payment_status": bill.payment_status,
                "payment_method": bill.payment_method,
            }
            response_status = (
                status.HTTP_200_OK
                if requested_method == bill.payment_method
                else status.HTTP_409_CONFLICT
            )
            return Response(
                response_data,
                status=response_status
            )

        if bill.payment_status != "PENDING":
            return Response(
                {"detail": "Only pending bills can be paid."},
                status=status.HTTP_400_BAD_REQUEST
            )

        payment_method = request.data.get("payment_method")

        allowed_methods = [
            choice[0]
            for choice in RegistrationBill.PaymentMethodChoices.choices
        ]

        if payment_method not in allowed_methods:
            return Response(
                {
                    "payment_method":
                    f"Choose one of: {', '.join(allowed_methods)}."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        bill.payment_method = payment_method
        bill.payment_status = "PAID"
        bill.save(
            update_fields=["payment_method", "payment_status"]
        )

        return Response(
            {
                "detail": "Payment recorded successfully.",
                "bill_id": bill.bill_id,
                "total_amount": str(bill.total_amount),
                "payment_status": bill.payment_status,
                "payment_method": bill.payment_method,
            },
            status=status.HTTP_200_OK
        )


class TokenGenerateAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]

    @transaction.atomic
    def post(self, request):
        bill_id = request.data.get("bill_id")
        token_date = request.data.get("token_date")
        session = request.data.get("session")
        appointment_id = request.data.get("appointment")

        if appointment_id in (None, ""):
            appointment_id = None
        else:
            try:
                appointment_id = int(appointment_id)
            except (TypeError, ValueError):
                return Response(
                    {"appointment": "Provide a valid appointment ID."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if not bill_id or not token_date or not session:
            return Response(
                {
                    "detail": (
                        "bill_id, token_date and session are required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if session not in Token.SessionChoices.values:
            return Response(
                {"session": "Choose MORNING or EVENING."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bill = get_object_or_404(
            RegistrationBill.objects.select_for_update(),
            bill_id=bill_id,
        )

        if bill.payment_status != RegistrationBill.PaymentStatusChoices.PAID:
            return Response(
                {"detail": "The registration bill must be paid first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not bill.patient.is_active or not bill.doctor.is_active:
            return Response(
                {"detail": "The patient and doctor must be active."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Token.objects.filter(bill=bill).exists():
            return Response(
                {"detail": "A token already exists for this bill."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if bill.appointment_id and appointment_id != bill.appointment_id:
            return Response(
                {"appointment": "Use the appointment linked to this bill."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appointment = None

        if appointment_id:
            appointment = get_object_or_404(
                Appointment,
                appointment_id=appointment_id,
            )

            if (
                appointment.patient_id != bill.patient_id
                or appointment.doctor_id != bill.doctor_id
            ):
                return Response(
                    {
                        "appointment": (
                            "The appointment patient and doctor must "
                            "match the registration bill."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if appointment.appointment_date.isoformat() != token_date:
                return Response(
                    {
                        "token_date": (
                            "The token date must match the appointment date."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if appointment.status != Appointment.StatusChoices.BOOKED:
                return Response(
                    {
                        "appointment": (
                            "Only booked appointments can receive tokens."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            appointment_session = DoctorSession.objects.filter(
                doctor=bill.doctor,
                is_active=True,
                start_time__lte=appointment.appointment_time_slot,
                end_time__gt=appointment.appointment_time_slot,
                session=session,
            ).exists()

            if not appointment_session:
                return Response(
                    {
                        "session": (
                            "The selected session does not match "
                            "the appointment time."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        else:
            if not DoctorSession.objects.filter(
                doctor=bill.doctor,
                session=session,
                is_active=True,
            ).exists():
                return Response(
                    {
                        "session": (
                            "The doctor does not have an active "
                            "session of this type."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Validate date format and enforce the two-calendar-month window.
        try:
            parsed_date = date.fromisoformat(token_date)
        except (TypeError, ValueError):
            return Response(
                {"token_date": "Use YYYY-MM-DD format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if parsed_date < timezone.localdate():
            return Response(
                {"token_date": "Tokens cannot be generated for past dates."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if parsed_date > maximum_token_date():
            return Response(
                {
                    "token_date": (
                        "Choose a date no more than two calendar months "
                        "from today."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        doctor = get_object_or_404(
            Doctor.objects.select_for_update(), doc_id=bill.doctor_id
        )
        if not doctor.is_active:
            return Response(
                {"detail": "The doctor must be active."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_tokens = Token.objects.filter(
            doctor=doctor,
            token_date=parsed_date,
        )

        if existing_tokens.count() >= 30:
            return Response(
                {
                    "detail": (
                        "This doctor has reached the limit of "
                        "30 tokens for this date."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        last_token = Token.objects.filter(
            doctor=doctor,
            token_date=parsed_date,
            session=session,
        ).order_by("-token_number").first()

        next_number = (
            last_token.token_number + 1 if last_token else 1
        )

        token = Token.objects.create(
            patient=bill.patient,
            doctor=doctor,
            bill=bill,
            appointment=appointment,
            token_number=next_number,
            token_date=parsed_date,
            session=session,
        )

        return Response(
            {
                "detail": "Token generated successfully.",
                "token_id": token.token_id,
                "token_number": token.token_number,
                "patient": token.patient_id,
                "doctor": token.doctor_id,
                "bill": token.bill_id,
                "appointment": token.appointment_id,
                "token_date": token.token_date,
                "session": token.session,
                "status": token.status,
            },
            status=status.HTTP_201_CREATED,
        )


class TokenListAPIView(generics.ListAPIView):
    queryset = Token.objects.select_related(
        "patient", "doctor", "bill", "appointment"
    ).order_by("token_date", "session", "token_number")

    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]

    def get_queryset(self):
        queryset = super().get_queryset()
        bill_id = self.request.query_params.get("bill_id")
        if bill_id is not None:
            try:
                return queryset.filter(bill_id=int(bill_id))
            except (TypeError, ValueError):
                return queryset.none()

        token_date = self.request.query_params.get("token_date")
        if token_date == "all":
            return queryset
        if token_date:
            parsed_date = parse_date(token_date)
            return queryset.filter(token_date=parsed_date) if parsed_date else queryset.none()

        # The unfiltered endpoint is the receptionist's live queue: clinic-local today.
        return queryset.filter(token_date=timezone.localdate())


class TokenDetailAPIView(generics.RetrieveAPIView):
    queryset = Token.objects.select_related(
        "patient", "doctor", "bill", "appointment"
    )

    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]
    lookup_field = "token_id"



class TokenStatusUpdateAPIView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrReceptionist]

    @transaction.atomic
    def patch(self, request, token_id):
        token = get_object_or_404(
            Token.objects.select_for_update(),
            token_id=token_id,
        )

        new_status = request.data.get("status")

        allowed_transitions = {
            "WAITING": ["CALLED", "CANCELLED"],
            "CALLED": ["CANCELLED"],
            "CONSULTING": [],
            "COMPLETED": [],
            "CANCELLED": [],
        }

        if new_status not in Token.StatusChoices.values:
            return Response(
                {
                    "status": (
                        "Choose WAITING, CALLED, CONSULTING, COMPLETED, or CANCELLED."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_status not in allowed_transitions[token.status]:
            return Response(
                {
                    "detail": (
                        f"Cannot change token status from "
                        f"{token.status} to {new_status}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        token.status = new_status
        token.save(update_fields=["status"])

        return Response(
            {
                "detail": "Token status updated successfully.",
                "token_id": token.token_id,
                "token_number": token.token_number,
                "status": token.status,
            },
            status=status.HTTP_200_OK,
        )
