
from django.utils import timezone
from rest_framework import serializers
from cmsapp.models import (
    Appointment,
    Doctor,
    Patient,
    DoctorSession,
    RegistrationBill,
)

from cmsapp.models import Token


from django.utils import timezone
from rest_framework import serializers
from cmsapp.models import Appointment, Doctor, Patient, DoctorSession

from rest_framework import serializers
from cmsapp.models import Patient


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
        ]
        read_only_fields = [
            "patient_id",
            "created_at",
        ]


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



class RegistrationBillSerializer(serializers.ModelSerializer):

    class Meta:
        model = RegistrationBill
        fields = [
            "bill_id",
            "patient",
            "doctor",
            "registration_fee",
            "consultation_fee",
            "total_amount",
            "payment_status",
            "payment_method",
            "bill_date",
        ]

        read_only_fields = [
            "bill_id",
            "total_amount",
            "payment_status",
            "bill_date",
        ]

    def validate(self, attrs):
        patient = attrs.get("patient")
        doctor = attrs.get("doctor")

        if patient is not None and not patient.is_active:
            raise serializers.ValidationError({
                "patient": "This patient is inactive."
            })

        if doctor is not None and not doctor.is_active:
            raise serializers.ValidationError({
                "doctor": "This doctor is inactive."
            })

        return attrs

    def create(self, validated_data):
        registration_fee = validated_data.get("registration_fee", 0)
        consultation_fee = validated_data["consultation_fee"]

        validated_data["total_amount"] = (
            registration_fee + consultation_fee
        )

        return super().create(validated_data)

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