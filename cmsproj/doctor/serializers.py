
from rest_framework import serializers
from cmsapp.models import (
    Token,
    Consultation,
    Patient,
    Prescription,
    PrescriptionItem,
    MasterMedicine,
    Dosage,
    LabRequest,
    Appointment,
)

class DoctorTodayAppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )

    class Meta:
        model = Appointment
        fields = [
            "appointment_id",
            "patient",
            "patient_name",
            "doctor",
            "appointment_date",
            "appointment_time_slot",
            "status",
        ]
        read_only_fields = fields

class DoctorQueueSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True
    )

    class Meta:
        model = Token
        fields = [
            "token_id",
            "token_number",
            "patient",
            "patient_name",
            "token_date",
            "session",
            "status",
        ]

class PatientDetailsSerializer(serializers.ModelSerializer):
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
        read_only_fields = fields


class ConsultationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Consultation
        fields = [
            "consult_id",
            "token",
            "patient",
            "doctor",
            "symptoms",
            "diagnosis",
            "remarks",
            "created_at",
        ]
        read_only_fields = [
            "consult_id",
            "patient",
            "doctor",
            "created_at",
        ]

    def validate_token(self, token):
        if token.status != Token.StatusChoices.CALLED:
            raise serializers.ValidationError(
                "Only a called token can start a consultation."
            )

        if hasattr(token, "consultation"):
            raise serializers.ValidationError(
                "A consultation already exists for this token."
            )

        return token

    def create(self, validated_data):
        token = validated_data["token"]

        validated_data["patient"] = token.patient
        validated_data["doctor"] = token.doctor
        return super().create(validated_data)



class PrescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Prescription
        fields = [
            "prescription_id",
            "consultation",
            "created_at",
        ]
        read_only_fields = [
            "prescription_id",
            "created_at",
        ]

    def validate_consultation(self, consultation):
        if not consultation.doctor.is_active:
            raise serializers.ValidationError(
                "This doctor's profile is inactive."
            )

        if hasattr(consultation, "prescription"):
            raise serializers.ValidationError(
                "A prescription already exists for this consultation."
            )

        return consultation


class PrescriptionItemSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(
        source="medicine.name",
        read_only=True
    )
    dosage_details = serializers.CharField(
        source="dosage.__str__",
        read_only=True
    )

    class Meta:
        model = PrescriptionItem
        fields = [
            "prescription_item_id",
            "prescription",
            "medicine",
            "medicine_name",
            "dosage",
            "dosage_details",
            "frequency",
            "duration",
            "instructions",
            "prescribed_quantity",
            "dispensed_quantity",
            "dispensed_status",
            "is_active",
        ]
        read_only_fields = [
            "prescription_item_id",
            "medicine_name",
            "dosage_details",
            "dispensed_status",
            "is_active",
        ]


    def validate_prescribed_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Prescribed quantity must be greater than zero."
            )
        return value

    def validate(self, attrs):
        medicine = attrs["medicine"]
        dosage = attrs["dosage"]
        prescription = attrs["prescription"]

        if not medicine.is_active:
            raise serializers.ValidationError(
                {"medicine": "This medicine is inactive."}
            )

        if not dosage.is_active:
            raise serializers.ValidationError(
                {"dosage": "This dosage is inactive."}
            )

        if dosage.medicine_id != medicine.medicine_id:
            raise serializers.ValidationError(
                {"dosage": "This dosage does not belong to the selected medicine."}
            )

        request = self.context.get("request")
        user = request.user

        try:
            doctor = user.staff_profile.doctor_profile
        except Exception:
            raise serializers.ValidationError(
                {"prescription": "Doctor profile not found."}
            )

        if prescription.consultation.doctor_id != doctor.doc_id:
            raise serializers.ValidationError(
                {"prescription": "This prescription does not belong to you."}
            )

        return attrs


class PrescriptionDetailSerializer(serializers.ModelSerializer):
    items = PrescriptionItemSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Prescription
        fields = [
            "prescription_id",
            "consultation",
            "created_at",
            "items",
        ]
        read_only_fields = fields



class LabRequestSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(
        source="test.test_name",
        read_only=True,
    )

    class Meta:
        model = LabRequest
        fields = [
            "lab_request_id",
            "consultation",
            "test",
            "test_name",
            "order_date",
            "priority",
            "status",
            "is_active",
        ]
        read_only_fields = [
            "lab_request_id",
            "order_date",
            "status",
            "is_active",
            "test_name",
        ]

    def validate(self, attrs):
        consultation = attrs["consultation"]
        test = attrs["test"]

        if not consultation.doctor.is_active:
            raise serializers.ValidationError({
                "consultation": "This doctor's profile is inactive."
            })

        if not test.is_active:
            raise serializers.ValidationError({
                "test": "This laboratory test is inactive."
            })

        request = self.context.get("request")

        try:
            doctor = request.user.staff_profile.doctor_profile
        except Exception:
            raise serializers.ValidationError({
                "consultation": "Doctor profile not found."
            })

        if consultation.doctor_id != doctor.doc_id:
            raise serializers.ValidationError({
                "consultation": "This consultation does not belong to you."
            })

        return attrs
