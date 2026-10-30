
from django.urls import path
from .views import (
    LoginAPIView,
    TestProtectedAPIView,
    RoleListCreateAPIView,
    DepartmentListCreateAPIView,
    DepartmentDetailAPIView,
    SpecializationListCreateAPIView,
    SpecializationDetailAPIView,
    DoctorProfileListCreateAPIView,
    DoctorProfileDetailAPIView,
    AdminLabTestListCreateAPIView,
    AdminLabTestDetailAPIView,
    StaffListCreateAPIView,
    StaffDetailAPIView,
    StaffStockRequestListCreateAPIView,
    AdminStockRequestListAPIView,
    AdminStockRequestReviewAPIView,
    AdminMonthlyBillsAPIView,
)

urlpatterns = [
    path("login/", LoginAPIView.as_view(), name="login"),
    path("test-protected/", TestProtectedAPIView.as_view(), name="test-protected"),

    path("roles/", RoleListCreateAPIView.as_view(), name="roles"),
    path("departments/", DepartmentListCreateAPIView.as_view(), name="departments"),
    path("departments/<int:department_id>/", DepartmentDetailAPIView.as_view(), name="department-detail"),
    path("specializations/", SpecializationListCreateAPIView.as_view(), name="specializations"),
    path("specializations/<int:spec_id>/", SpecializationDetailAPIView.as_view(), name="specialization-detail"),
    path("doctors/", DoctorProfileListCreateAPIView.as_view(), name="doctor-profile-list-create"),
    path("doctors/<int:doc_id>/", DoctorProfileDetailAPIView.as_view(), name="doctor-profile-detail"),
    path("lab-tests/", AdminLabTestListCreateAPIView.as_view(), name="admin-lab-test-list-create"),
    path("lab-tests/<int:test_id>/", AdminLabTestDetailAPIView.as_view(), name="admin-lab-test-detail"),
    path("stock-requests/", StaffStockRequestListCreateAPIView.as_view(), name="staff-stock-requests"),
    path("stock-requests/admin/", AdminStockRequestListAPIView.as_view(), name="admin-stock-requests"),
    path("stock-requests/<int:request_id>/review/", AdminStockRequestReviewAPIView.as_view(), name="admin-stock-request-review"),
    path("monthly-bills/", AdminMonthlyBillsAPIView.as_view(), name="admin-monthly-bills"),

    path("staff/", StaffListCreateAPIView.as_view(), name="staff-list-create"),

    path("staff/<int:staff_id>/",StaffDetailAPIView.as_view(),name="staff-detail",),

]
