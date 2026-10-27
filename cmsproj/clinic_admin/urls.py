
from .views import StaffDetailAPIView

from django.urls import path

from .views import StaffListCreateAPIView

from .views import LoginAPIView
from .views import (
    LoginAPIView,
    TestProtectedAPIView,
    RoleListCreateAPIView,
    DepartmentListCreateAPIView,
    SpecializationListCreateAPIView,
)

urlpatterns = [
    path("login/", LoginAPIView.as_view(), name="login"),
    path("test-protected/", TestProtectedAPIView.as_view(), name="test-protected"),

    path("roles/", RoleListCreateAPIView.as_view(), name="roles"),
    path("departments/", DepartmentListCreateAPIView.as_view(), name="departments"),
    path("specializations/", SpecializationListCreateAPIView.as_view(), name="specializations"),

    path("staff/", StaffListCreateAPIView.as_view(), name="staff-list-create"),

    path("staff/<int:staff_id>/",StaffDetailAPIView.as_view(),name="staff-detail",),

]
