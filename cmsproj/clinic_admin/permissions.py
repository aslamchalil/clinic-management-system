
from rest_framework.permissions import BasePermission


class IsAdminStaff(BasePermission):
    message = "Only administrators can access this resource."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        try:
            staff = user.staff_profile
        except Exception:
            return False

        return (
            staff.is_active
            and staff.role.is_active
            and staff.role.role_name.upper() == "ADMIN"
        )