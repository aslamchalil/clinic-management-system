from rest_framework.permissions import BasePermission

from cmsapp.models import Staff


def get_active_doctor(user):
    if not user or not user.is_authenticated or not user.is_active:
        return None
    staff = (
        Staff.objects.select_related("role", "doctor_profile")
        .filter(user=user, is_active=True, role__is_active=True, role__role_name__iexact="DOCTOR")
        .first()
    )
    if not staff:
        return None
    doctor = getattr(staff, "doctor_profile", None)
    return doctor if doctor and doctor.is_active else None


class IsActiveDoctor(BasePermission):
    message = "An active Doctor account and profile are required."

    def has_permission(self, request, view):
        return get_active_doctor(request.user) is not None
