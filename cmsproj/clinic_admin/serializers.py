from django.contrib.auth.models import User
from django.db import transaction

from rest_framework import serializers
from cmsapp.models import Role, Department, Specialization, Staff


# Authentication
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False
    )


# Admin module
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
    class Meta:
        model = Staff
        fields = [
            "staff_id",
            "user",
            "role",
            "department",
            "first_name",
            "last_name",
            "dob",
            "gender",
            "phone_number",
            "email",
            "is_active",
        ]
        read_only_fields = ["staff_id", "user"]

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
