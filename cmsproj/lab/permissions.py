
from rest_framework.permissions import BasePermission
from cmsapp.models import Staff


class IsLabAssistant(BasePermission):
    message = "Active Lab Assistant account required."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        return Staff.objects.filter(
            user=request.user,
            role__role_name="LAB_ASSISTANT",
            role__is_active=True,
            is_active=True,
        ).exists()
