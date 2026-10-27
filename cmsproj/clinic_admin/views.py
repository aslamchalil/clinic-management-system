

# Create your views here.

from cmsapp.models import Staff
from .serializers import StaffCreateSerializer, StaffSerializer
from .permissions import IsAdminStaff
from rest_framework import generics

from .permissions import IsAdminStaff

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from cmsapp.models import Role, Department, Specialization
from .serializers import (
    RoleSerializer,
    DepartmentSerializer,
    SpecializationSerializer,
)

from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework_simplejwt.tokens import RefreshToken

from cmsapp.models import Staff
from .serializers import LoginSerializer


class LoginAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]

        user = authenticate(
            request,
            username=username,
            password=password
        )

        if user is None or not user.is_active:
            return Response(
                {"detail": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            staff = Staff.objects.select_related(
                "role", "department"
            ).get(user=user)
        except Staff.DoesNotExist:
            return Response(
                {"detail": "No staff profile is linked to this account."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not staff.is_active or not staff.role.is_active:
            return Response(
                {"detail": "This staff account or role is inactive."},
                status=status.HTTP_403_FORBIDDEN
            )

        role = staff.role.role_name.upper()

        # A doctor account must have a corresponding Doctor profile.
        if role == "DOCTOR":
            from cmsapp.models import Doctor

            if not Doctor.objects.filter(staff=staff, is_active=True).exists():
                return Response(
                    {"detail": "No active doctor profile is linked to this account."},
                    status=status.HTTP_403_FORBIDDEN
                )

        refresh = RefreshToken.for_user(user)

        role_pages = {
            "ADMIN": "/admin",
            "DOCTOR": "/doctor",
            "RECEPTIONIST": "/receptionist",
            "PHARMACIST": "/pharmacy",
            "LAB_TECHNICIAN": "/lab",
        }

        return Response(
            {
                "message": "Login successful.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.pk,
                    "username": user.username,
                    "first_name": staff.first_name,
                    "last_name": staff.last_name,
                    "role": role,
                    "staff_id": staff.staff_id,
                    "department": staff.department.department_name,
                },
                "redirect_to": role_pages.get(role),
            },
            status=status.HTTP_200_OK
        )


class TestProtectedAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "message": "JWT authentication successful!",
            "username": request.user.username
        })


class RoleListCreateAPIView(generics.ListCreateAPIView):
    queryset = Role.objects.all().order_by("role_id")
    serializer_class = RoleSerializer
    permission_classes = [IsAdminStaff]


class DepartmentListCreateAPIView(generics.ListCreateAPIView):
    queryset = Department.objects.all().order_by("department_id")
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminStaff]


class SpecializationListCreateAPIView(generics.ListCreateAPIView):
    queryset = Specialization.objects.all().order_by("spec_id")
    serializer_class = SpecializationSerializer
    permission_classes = [IsAdminStaff]



class StaffListCreateAPIView(generics.ListCreateAPIView):
    queryset = Staff.objects.select_related(
        "user", "role", "department"
    ).order_by("staff_id")

    permission_classes = [IsAdminStaff]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return StaffCreateSerializer

        # For GET requests, return staff details without passwords.
        from .serializers import StaffSerializer
        return StaffSerializer



class StaffDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Staff.objects.select_related(
        "user", "role", "department"
    )
    serializer_class = StaffSerializer
    permission_classes = [IsAdminStaff]
    lookup_field = "staff_id"

    def perform_destroy(self, instance):
        # Deactivate instead of permanently deleting the staff record.
        instance.is_active = False
        instance.save(update_fields=["is_active"])

        # Prevent the linked account from logging in.
        instance.user.is_active = False
        instance.user.save(update_fields=["is_active"])
