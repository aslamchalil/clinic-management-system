
from rest_framework.permissions import BasePermission


class IsAdminOrReceptionist(BasePermission):
    message = "Only Admin or Receptionist staff can access this resource."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated or not user.is_active:
            return False

        try:
            staff = user.staff_profile
        except Exception:
            return False

        return (
            staff.is_active
            and staff.role.is_active
            and staff.role.role_name.upper()
            in ["ADMIN", "RECEPTIONIST"]
        )
