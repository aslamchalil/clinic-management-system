from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from rest_framework import serializers
from cmsapp.models import (
    Department,
    Doctor,
    DoctorSession,
    MasterLabTest,
    MasterMedicine,
    Role,
    Specialization,
    StockRequest,
    Staff,
)


# Authentication
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False
    )


# Admin module
def validate_staff_age(dob):
    today = timezone.localdate()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    if age < 26:
        raise serializers.ValidationError("Staff must be older than 25 years.")
    return dob


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = "__all__"


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = "__all__"


class SpecializationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Specialization
        fields = "__all__"


class StaffSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.role_name", read_only=True)
    department_name = serializers.CharField(source="department.department_name", read_only=True)

    class Meta:
        model = Staff
        fields = [
            "staff_id",
            "user",
            "role",
            "role_name",
            "department",
            "department_name",
            "first_name",
            "last_name",
            "dob",
            "gender",
            "phone_number",
            "email",
            "is_active",
        ]
        read_only_fields = ["staff_id", "user"]

    def validate_role(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Choose an active role.")
        return value

    def validate_department(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Choose an active department.")
        return value

    def validate_dob(self, value):
        return validate_staff_age(value)

    @transaction.atomic
    def update(self, instance, validated_data):
        synchronize_account = "is_active" in validated_data
        staff = super().update(instance, validated_data)
        if synchronize_account:
            user = staff.user
            user.is_active = staff.is_active
            user.save(update_fields=["is_active"])
        return staff


class DoctorSessionAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorSession
        fields = ["session", "start_time", "end_time", "is_active"]

    def validate(self, attrs):
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time is not None and end_time is not None and start_time >= end_time:
            raise serializers.ValidationError({"end_time": "End time must be later than start time."})
        return attrs


class DoctorAdminSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    staff_email = serializers.CharField(source="staff.email", read_only=True)
    staff_phone = serializers.CharField(source="staff.phone_number", read_only=True)
    department_name = serializers.CharField(source="staff.department.department_name", read_only=True)
    staff_is_active = serializers.BooleanField(source="staff.is_active", read_only=True)
    account_is_active = serializers.BooleanField(source="staff.user.is_active", read_only=True)
    specialization_name = serializers.CharField(source="specialization.spec_name", read_only=True)
    specialization = serializers.PrimaryKeyRelatedField(
        queryset=Specialization.objects.filter(is_active=True)
    )
    sessions = DoctorSessionAdminSerializer(many=True, required=False)

    class Meta:
        model = Doctor
        fields = [
            "doc_id", "staff", "staff_name", "staff_email", "staff_phone",
            "department_name", "staff_is_active", "account_is_active",
            "specialization", "specialization_name", "consultation_fee",
            "qualification", "exp_year", "license_no", "is_active",
            "sessions",
        ]
        read_only_fields = [
            "doc_id", "staff_name", "staff_email", "staff_phone",
            "department_name", "staff_is_active", "account_is_active",
            "specialization_name",
        ]

    def get_staff_name(self, doctor):
        return str(doctor.staff)

    def validate_consultation_fee(self, value):
        if value < 0:
            raise serializers.ValidationError("Consultation fee cannot be negative.")
        return value

    def validate_staff(self, staff):
        if staff.role.role_name.upper() != "DOCTOR" or not staff.role.is_active:
            raise serializers.ValidationError("Select staff with an active Doctor role.")
        existing = Doctor.objects.filter(staff=staff)
        if self.instance is not None:
            existing = existing.exclude(doc_id=self.instance.doc_id)
        if existing.exists():
            raise serializers.ValidationError("This staff member already has a Doctor profile.")
        return staff

    def validate(self, attrs):
        sessions = attrs.get("sessions")
        if self.instance is None and not sessions:
            raise serializers.ValidationError({"sessions": "Assign at least one Doctor session with start and end times."})
        if sessions is not None and not sessions:
            raise serializers.ValidationError({"sessions": "A Doctor must have at least one session."})
        if sessions is not None:
            names = [row["session"] for row in sessions]
            if len(names) != len(set(names)):
                raise serializers.ValidationError({"sessions": "Each session can be assigned only once."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        sessions = validated_data.pop("sessions")
        doctor = super().create(validated_data)
        for session_data in sessions:
            DoctorSession.objects.create(doctor=doctor, **session_data)
        return doctor

    @transaction.atomic
    def update(self, instance, validated_data):
        sessions = validated_data.pop("sessions", None)
        doctor = super().update(instance, validated_data)
        if sessions is not None:
            selected = {row["session"]: row for row in sessions}
            existing = {row.session: row for row in doctor.sessions.all()}
            for session_name, session_data in selected.items():
                session = existing.get(session_name)
                if session is None:
                    DoctorSession.objects.create(doctor=doctor, **session_data)
                else:
                    for field, value in session_data.items():
                        setattr(session, field, value)
                    session.is_active = True
                    session.save()
            for session_name, session in existing.items():
                if session_name not in selected and session.is_active:
                    session.is_active = False
                    session.save(update_fields=["is_active"])
        return doctor


class AdminLabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterLabTest
        fields = [
            "test_id", "test_name", "test_type", "description", "test_price",
            "min_value", "max_value", "is_active",
        ]
        read_only_fields = ["test_id"]

    def validate_test_name(self, value):
        duplicate = MasterLabTest.objects.filter(test_name__iexact=value)
        if self.instance is not None:
            duplicate = duplicate.exclude(test_id=self.instance.test_id)
        if duplicate.exists():
            raise serializers.ValidationError("A lab test with this name already exists.")
        return value

    def validate(self, attrs):
        min_value = attrs.get("min_value", getattr(self.instance, "min_value", None))
        max_value = attrs.get("max_value", getattr(self.instance, "max_value", None))
        if min_value is not None and max_value is not None and min_value > max_value:
            raise serializers.ValidationError({"max_value": "Must be greater than or equal to minimum value."})
        return attrs


class StockRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by", read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by", read_only=True)
    medicine_name = serializers.CharField(source="medicine.name", read_only=True, allow_null=True)

    class Meta:
        model = StockRequest
        fields = [
            "request_id", "department", "item_name", "medicine", "medicine_name",
            "requested_quantity", "approved_quantity", "reason", "status", "requested_by",
            "requested_by_name", "reviewed_by", "reviewed_by_name", "review_note",
            "created_at", "updated_at", "reviewed_at",
        ]
        read_only_fields = fields


class StockRequestCreateSerializer(serializers.Serializer):
    medicine = serializers.PrimaryKeyRelatedField(
        queryset=MasterMedicine.objects.filter(is_active=True), required=False, allow_null=True
    )
    item_name = serializers.CharField(max_length=200, required=False, allow_blank=False)
    requested_quantity = serializers.IntegerField(min_value=1, max_value=2147483647)
    reason = serializers.CharField()

    def validate_reason(self, value):
        value = value.strip()
        if len(value) < 5:
            raise serializers.ValidationError("Provide a meaningful reason of at least 5 characters.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        staff = Staff.objects.select_related("role", "department").get(user=request.user)
        role_name = staff.role.role_name.strip().upper()
        department_name = staff.department.department_name.strip().casefold()

        if not staff.is_active or not staff.role.is_active or not staff.department.is_active:
            raise serializers.ValidationError("An active staff account, role, and department are required.")

        if role_name == "PHARMACIST" and "pharm" in department_name:
            attrs["department"] = StockRequest.DepartmentChoices.PHARMACY
            medicine = attrs.get("medicine")
            if medicine is None:
                raise serializers.ValidationError({"medicine": "Select an active medicine for a Pharmacy request."})
            attrs["item_name"] = medicine.name
            pending = StockRequest.objects.filter(
                department=StockRequest.DepartmentChoices.PHARMACY,
                medicine=medicine,
                status=StockRequest.StatusChoices.PENDING,
            )
            if pending.exists():
                raise serializers.ValidationError({"medicine": "A pending stock request already exists for this medicine."})
        elif role_name in ("LAB_ASSISTANT", "LAB_TECHNICIAN") and "lab" in department_name:
            attrs["department"] = StockRequest.DepartmentChoices.LABORATORY
            if attrs.get("medicine") is not None:
                raise serializers.ValidationError({"medicine": "Laboratory supplies must not be submitted as medicines."})
            if not attrs.get("item_name", "").strip():
                raise serializers.ValidationError({"item_name": "Enter the laboratory supply name."})
            attrs["item_name"] = attrs["item_name"].strip()
            if StockRequest.objects.filter(
                department=StockRequest.DepartmentChoices.LABORATORY,
                item_name__iexact=attrs["item_name"],
                status=StockRequest.StatusChoices.PENDING,
            ).exists():
                raise serializers.ValidationError({"item_name": "A pending stock request already exists for this supply."})
        else:
            raise serializers.ValidationError("Your active role and department cannot submit this stock request.")

        attrs["requested_by"] = staff
        return attrs

    def create(self, validated_data):
        return StockRequest.objects.create(**validated_data)


class StockRequestReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["APPROVED", "REJECTED"])
    review_note = serializers.CharField(required=False, allow_blank=True)
    approved_quantity = serializers.IntegerField(min_value=1, max_value=2147483647, required=False)

    def validate(self, attrs):
        if attrs["status"] == "REJECTED" and attrs.get("approved_quantity") is not None:
            raise serializers.ValidationError({"approved_quantity": "A rejected request cannot have an approved quantity."})
        return attrs

# Staf Creating Serializer
class StaffCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        trim_whitespace=False
    )
    first_name = serializers.CharField(max_length=100)
    last_name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    dob = serializers.DateField()
    gender = serializers.ChoiceField(
        choices=["MALE", "FEMALE", "OTHER"]
    )
    phone_number = serializers.CharField(max_length=20)
    role = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.filter(is_active=True)
    )
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True)
    )

    def validate_dob(self, value):
        return validate_staff_age(value)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(
                "This username is already taken."
            )
        return value

    def validate_email(self, value):
        if Staff.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "This email is already registered."
            )
        return value

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")
        role = validated_data.pop("role")
        department = validated_data.pop("department")

        user = User.objects.create_user(
            username=validated_data.pop("username"),
            password=password,
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            email=validated_data["email"],
        )

        staff = Staff.objects.create(
            user=user,
            role=role,
            department=department,
            **validated_data,
        )

        return staff

    def to_representation(self, instance):
        return {
            "staff_id": instance.staff_id,
            "username": instance.user.username,
            "first_name": instance.first_name,
            "last_name": instance.last_name,
            "email": instance.email,
            "dob": instance.dob,
            "gender": instance.gender,
            "phone_number": instance.phone_number,
            "role": instance.role.role_name,
            "department": instance.department.department_name,
            "is_active": instance.is_active,
        }
