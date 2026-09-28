# lab/permissions.py
"""
Role-based permissions for the Lab module.

Architecture reminder (from the master context):
    Django User -> Staff (OneToOne) -> Role

We look the Staff record up with an explicit query (Staff.objects.filter(user=...))
instead of `request.user.staff`, so this keeps working even if the reverse
accessor name on Staff.user is ever changed with `related_name=`.
"""
from rest_framework.permissions import BasePermission

from cmsapp.models import Staff

LAB_TECHNICIAN = "LAB_TECHNICIAN"
DOCTOR = "DOCTOR"


def get_active_staff(user):
    """Return the active Staff row for this Django user, or None."""
    if not (user and user.is_authenticated):
        return None
    return (
        Staff.objects.select_related("role")
        .filter(user=user, is_active=True)
        .first()
    )


def get_role_name(user):
    """Return the role_name ('DOCTOR', 'LAB_TECHNICIAN', ...) or None."""
    staff = get_active_staff(user)
    if staff is None or not staff.role.is_active:
        return None
    return staff.role.role_name


class IsLabTechnician(BasePermission):
    """Only authenticated, active Staff whose role is LAB_TECHNICIAN."""

    message = "Only lab technicians can access this endpoint."

    def has_permission(self, request, view):
        return get_role_name(request.user) == LAB_TECHNICIAN


class IsLabTechnicianOrDoctor(BasePermission):
    """
    Read access shared by lab technicians and doctors.
    Doctors are further restricted to their OWN patients' records inside the
    views (see `limit_to_own_consultations`).
    """

    message = "Only lab technicians or doctors can access this endpoint."

    def has_permission(self, request, view):
        return get_role_name(request.user) in (LAB_TECHNICIAN, DOCTOR)


def limit_to_own_consultations(queryset, user, doctor_user_path):
    """
    If the caller is a DOCTOR, keep only rows that belong to a consultation
    this doctor created. Lab technicians see everything.

    doctor_user_path is the ORM path from the queryset's model to the
    Django user of the consulting doctor, e.g.
        LabRequest -> "consultation__doctor__staff__user"
        LabResult  -> "lab_request__consultation__doctor__staff__user"
    """
    if get_role_name(user) == DOCTOR:
        return queryset.filter(**{doctor_user_path: user})
    return queryset