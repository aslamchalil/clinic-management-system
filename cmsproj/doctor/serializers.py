import re

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
    MasterLabTest,
)


class DoctorTokenSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Token
        fields = ["token_id", "token_number", "token_date", "session", "status"]
        read_only_fields = fields


class DoctorMedicineSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterMedicine
        fields = ["medicine_id", "name", "generic_name", "category"]
        read_only_fields = fields


class DoctorDosageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dosage
        fields = ["dosage_id", "medicine", "dosage_value", "unit", "description"]
        read_only_fields = fields


class DoctorLabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterLabTest
        fields = ["test_id", "test_name", "test_type", "description", "test_price"]
        read_only_fields = fields

class DoctorTodayAppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True,
    )
    tokens = DoctorTokenSummarySerializer(many=True, read_only=True)

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
            "tokens",
        ]
        read_only_fields = fields

class DoctorQueueSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(
        source="patient.full_name",
        read_only=True
    )
    bill_payment_status = serializers.CharField(source="bill.payment_status", read_only=True)
    appointment_id = serializers.IntegerField(read_only=True, allow_null=True)
    consultation_id = serializers.SerializerMethodField()

    def get_consultation_id(self, token):
        consultation = getattr(token, "consultation", None)
        return consultation.consult_id if consultation else None

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
            "bill_payment_status",
            "appointment_id",
            "consultation_id",
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


class DoctorPatientSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ["patient_id", "full_name", "phone_number"]
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


class DoctorConsultationSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    token_number = serializers.IntegerField(source="token.token_number", read_only=True)
    token_date = serializers.DateField(source="token.token_date", read_only=True)
    session = serializers.CharField(source="token.session", read_only=True)
    token_status = serializers.CharField(source="token.status", read_only=True)
    prescription_id = serializers.SerializerMethodField()

    class Meta:
        model = Consultation
        fields = [
            "consult_id", "patient", "patient_name", "doctor", "token",
            "token_number", "token_date", "session", "token_status",
            "symptoms", "diagnosis", "remarks", "created_at", "prescription_id",
        ]
        read_only_fields = fields

    def get_prescription_id(self, consultation):
        prescription = getattr(consultation, "prescription", None)
        return prescription.prescription_id if prescription else None



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


def calculate_prescription_quantity(frequency, duration):
    frequency_match = re.fullmatch(r"\s*([1-4])\s+times?\s+per\s+day\s*", frequency or "", re.IGNORECASE)
    if not frequency_match:
        raise serializers.ValidationError({"frequency": "Choose a supported frequency from 1 to 4 times per day."})
    duration_match = re.fullmatch(r"\s*([1-9]\d{0,2})\s+days?\s*", duration or "", re.IGNORECASE)
    if not duration_match or int(duration_match.group(1)) > 365:
        raise serializers.ValidationError({"duration": "Enter a duration from 1 to 365 days."})
    return int(frequency_match.group(1)) * int(duration_match.group(1))


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
        expected_quantity = calculate_prescription_quantity(
            attrs.get("frequency"), attrs.get("duration")
        )
        if attrs["prescribed_quantity"] != expected_quantity:
            raise serializers.ValidationError({
                "prescribed_quantity": f"Quantity must equal frequency per day × duration ({expected_quantity})."
            })

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
    patient_id = serializers.IntegerField(source="consultation.patient_id", read_only=True)
    patient_name = serializers.CharField(source="consultation.patient.full_name", read_only=True)
    doctor_name = serializers.CharField(source="consultation.doctor", read_only=True)
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
            "patient_id",
            "patient_name",
            "doctor_name",
            "items",
        ]
        read_only_fields = fields



class LabRequestSerializer(serializers.ModelSerializer):
    patient_id = serializers.IntegerField(source="consultation.patient_id", read_only=True)
    patient_name = serializers.CharField(source="consultation.patient.full_name", read_only=True)
    test_name = serializers.CharField(
        source="test.test_name",
        read_only=True,
    )

    class Meta:
        model = LabRequest
        fields = [
            "lab_request_id",
            "consultation",
            "patient_id",
            "patient_name",
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
