# lab/permissions.py

from rest_framework.permissions import BasePermission


class IsLabTechnician(BasePermission):
    """
    Allows access only to authenticated users whose Staff record
    has role.role_name == 'LAB_TECHNICIAN'.

    Assumes the unified login architecture:
        request.user -> Staff (OneToOne) -> Role
    """
    message = "Only lab technicians can access this endpoint."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        staff = getattr(user, "staff", None)
        if staff is None:
            return False

        return staff.is_active and staff.role.role_name == "LAB_TECHNICIAN"