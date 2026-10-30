
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from cmsapp.models import (
    Appointment,
    Doctor,
    DoctorSession,
    Patient,
    RegistrationBill,
    Token,
)
from .date_utils import maximum_token_date


class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "patient_id",
            "full_name",
            "dob",
            "gender",
            "phone_number",
            "email",
            "address",
            "blood_group",
            "emergency_contact",
            "is_active",
            "created_at",
            "registration_fee_status",
        ]
        read_only_fields = [
            "patient_id",
            "created_at",
            "registration_fee_status",
        ]

    def create(self, validated_data):
        validated_data["registration_fee_status"] = (
            Patient.RegistrationFeeStatusChoices.ELIGIBLE
        )
        return super().create(validated_data)


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = [
            "appointment_id",
            "patient",
            "doctor",
            "appointment_date",
            "appointment_time_slot",
            "status",
            "advance_amount",
            "advance_payment_status",
            "created_at",
        ]
        read_only_fields = [
            "appointment_id",
            "status",
            "advance_payment_status",
            "created_at",
        ]

    def validate(self, attrs):
        # For PATCH, use the existing values for fields not supplied.
        instance = getattr(self, "instance", None)

        patient = attrs.get(
            "patient", instance.patient if instance else None
        )
        doctor = attrs.get(
            "doctor", instance.doctor if instance else None
        )
        appointment_date = attrs.get(
            "appointment_date",
            instance.appointment_date if instance else None,
        )
        appointment_time = attrs.get(
            "appointment_time_slot",
            instance.appointment_time_slot if instance else None,
        )

        if patient and not patient.is_active:
            raise serializers.ValidationError({
                "patient": "This patient is inactive."
            })

        if doctor and not doctor.is_active:
            raise serializers.ValidationError({
                "doctor": "This doctor is inactive."
            })

        if appointment_date and appointment_date < timezone.localdate():
            raise serializers.ValidationError({
                "appointment_date": "Appointments cannot be booked in the past."
            })

        if appointment_date and (instance is None or appointment_date != instance.appointment_date):
            if appointment_date > maximum_token_date():
                raise serializers.ValidationError({
                    "appointment_date": "Appointments must be within two calendar months."
                })

        if doctor and appointment_time:
            session_exists = DoctorSession.objects.filter(
                doctor=doctor,
                is_active=True,
                start_time__lte=appointment_time,
                end_time__gt=appointment_time,
            ).exists()

            if not session_exists:
                raise serializers.ValidationError({
                    "appointment_time_slot":
                        "The time must fall within an active doctor session."
                })

        if doctor and appointment_date:
            existing = Appointment.objects.filter(
                doctor=doctor,
                appointment_date=appointment_date,
            ).exclude(status=Appointment.StatusChoices.CANCELLED)

            if instance:
                existing = existing.exclude(
                    appointment_id=instance.appointment_id
                )

            if existing.count() >= 10:
                raise serializers.ValidationError({
                    "appointment_date":
                        "This doctor has reached the limit of 10 appointments for this date."
                })

            if appointment_time and existing.filter(
                appointment_time_slot=appointment_time
            ).exists():
                raise serializers.ValidationError({
                    "appointment_time_slot":
                        "This doctor already has an appointment at this time."
                })

        return attrs

    @staticmethod
    def _validate_locked_slot(doctor, appointment_date, appointment_time, exclude_id=None):
        existing = Appointment.objects.filter(
            doctor=doctor, appointment_date=appointment_date,
        ).exclude(status=Appointment.StatusChoices.CANCELLED)
        if exclude_id is not None:
            existing = existing.exclude(appointment_id=exclude_id)
        if existing.count() >= 10:
            raise serializers.ValidationError({
                "appointment_date": "This doctor has reached the limit of 10 appointments for this date."
            })
        if existing.filter(appointment_time_slot=appointment_time).exists():
            raise serializers.ValidationError({
                "appointment_time_slot": "This doctor already has an appointment at this time."
            })

    @transaction.atomic
    def create(self, validated_data):
        # MySQL has no portable partial unique constraint for non-cancelled rows.
        # Lock the doctor row as a per-doctor serialization point, then recheck.
        doctor = Doctor.objects.select_for_update().get(
            doc_id=validated_data["doctor"].doc_id
        )
        self._validate_locked_slot(
            doctor,
            validated_data["appointment_date"],
            validated_data["appointment_time_slot"],
        )
        validated_data["doctor"] = doctor
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        current = Appointment.objects.select_for_update().get(
            appointment_id=instance.appointment_id
        )
        doctor_id = validated_data.get("doctor", current.doctor).doc_id
        doctor_ids = sorted({current.doctor_id, doctor_id})
        locked_doctors = {
            doctor.doc_id: doctor
            for doctor in Doctor.objects.select_for_update().filter(
                doc_id__in=doctor_ids
            ).order_by("doc_id")
        }
        doctor = locked_doctors[doctor_id]
        appointment_date = validated_data.get("appointment_date", current.appointment_date)
        appointment_time = validated_data.get("appointment_time_slot", current.appointment_time_slot)
        self._validate_locked_slot(
            doctor, appointment_date, appointment_time, current.appointment_id
        )
        validated_data["doctor"] = doctor
        return super().update(current, validated_data)


class DoctorDirectorySerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    sessions = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = ["doc_id", "display_name", "consultation_fee", "sessions"]

    def get_display_name(self, doctor):
        return str(doctor)

    def get_sessions(self, doctor):
        active_sessions = [session for session in doctor.sessions.all() if session.is_active]
        return [session.session for session in sorted(active_sessions, key=lambda item: item.start_time)]



class RegistrationBillSerializer(serializers.ModelSerializer):

    appointment = serializers.PrimaryKeyRelatedField(
        queryset=Appointment.objects.all(), required=False, allow_null=True
    )
    visit_key = serializers.UUIDField(required=False, allow_null=True)
    was_reused = False

    class Meta:
        model = RegistrationBill
        fields = [
            "bill_id",
            "patient",
            "doctor",
            "appointment",
            "visit_key",
            "registration_fee",
            "consultation_fee",
            "total_amount",
            "payment_status",
            "payment_method",
            "bill_date",
        ]

        read_only_fields = [
            "bill_id",
            "registration_fee",
            "consultation_fee",
            "total_amount",
            "payment_status",
            "payment_method",
            "bill_date",
        ]

    def validate(self, attrs):
        patient = attrs.get("patient")
        doctor = attrs.get("doctor")
        appointment = attrs.get("appointment")
        visit_key = attrs.get("visit_key")

        if bool(appointment) == bool(visit_key):
            raise serializers.ValidationError(
                "Provide exactly one of appointment or visit_key."
            )

        if patient is not None and not patient.is_active:
            raise serializers.ValidationError({
                "patient": "This patient is inactive."
            })

        if doctor is not None and not doctor.is_active:
            raise serializers.ValidationError({
                "doctor": "This doctor is inactive."
            })

        if appointment is not None:
            if patient and appointment.patient_id != patient.patient_id:
                raise serializers.ValidationError({
                    "appointment": "The appointment must belong to this patient."
                })
            if doctor and appointment.doctor_id != doctor.doc_id:
                raise serializers.ValidationError({
                    "appointment": "The appointment must use this doctor."
                })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        self.was_reused = False
        patient = Patient.objects.select_for_update().get(
            patient_id=validated_data["patient"].patient_id
        )
        doctor = Doctor.objects.select_for_update().select_related(
            "staff", "staff__role"
        ).get(doc_id=validated_data["doctor"].doc_id)
        appointment = validated_data.get("appointment")
        visit_key = validated_data.get("visit_key")

        existing_bills = RegistrationBill.objects.select_related(
            "patient", "doctor"
        )
        existing = (
            existing_bills.filter(appointment=appointment).first()
            if appointment is not None
            else existing_bills.filter(visit_key=visit_key).first()
        )
        if existing is not None:
            if (
                existing.patient_id != patient.patient_id
                or existing.doctor_id != doctor.doc_id
            ):
                raise serializers.ValidationError(
                    "This visit identity is already linked to a different bill."
                )
            self.was_reused = True
            return existing

        if appointment is not None:
            appointment = Appointment.objects.select_for_update().get(
                appointment_id=appointment.appointment_id
            )
            if (
                appointment.patient_id != patient.patient_id
                or appointment.doctor_id != doctor.doc_id
                or appointment.status != Appointment.StatusChoices.BOOKED
            ):
                raise serializers.ValidationError({
                    "appointment": "The appointment is no longer available for billing."
                })

        if (
            not patient.is_active
            or not doctor.is_active
            or not doctor.staff.is_active
            or not doctor.staff.role.is_active
        ):
            raise serializers.ValidationError(
                "The patient and doctor must be active."
            )

        if patient.registration_fee_status not in {
            Patient.RegistrationFeeStatusChoices.ELIGIBLE,
            Patient.RegistrationFeeStatusChoices.ASSESSED,
        }:
            raise serializers.ValidationError({
                "patient": (
                    "Registration-fee history needs review before billing."
                )
            })

        registration_fee = (
            Decimal("50.00")
            if patient.registration_fee_status
            == Patient.RegistrationFeeStatusChoices.ELIGIBLE
            else Decimal("0.00")
        )
        consultation_fee = doctor.consultation_fee
        bill = RegistrationBill.objects.create(
            patient=patient,
            doctor=doctor,
            appointment=appointment,
            visit_key=visit_key,
            registration_fee=registration_fee,
            consultation_fee=consultation_fee,
            total_amount=registration_fee + consultation_fee,
        )

        if patient.registration_fee_status == Patient.RegistrationFeeStatusChoices.ELIGIBLE:
            patient.registration_fee_status = (
                Patient.RegistrationFeeStatusChoices.ASSESSED
            )
            patient.save(update_fields=["registration_fee_status"])

        return bill

class TokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Token
        fields = [
            "token_id",
            "patient",
            "doctor",
            "bill",
            "appointment",
            "token_number",
            "token_date",
            "session",
            "status",
            "created_at",
        ]
        read_only_fields = fields
