
from django.urls import path
from .views import (
    PharmacyPrescriptionListAPIView,
    PharmacyMedicineListCreateAPIView,
    PharmacyMedicineDetailAPIView,
    PharmacyStockListCreateAPIView,
    PharmacyStockDetailAPIView,
    PharmacyBillAPIView,
    PharmacyBillPaymentAPIView,
    PharmacyBillDispenseAPIView,
    PharmacyDashboardAPIView,
    PharmacyPatientSearchAPIView,
)

urlpatterns = [
    path("dashboard/", PharmacyDashboardAPIView.as_view(), name="pharmacy-dashboard"),
    path("patients/search/", PharmacyPatientSearchAPIView.as_view(), name="pharmacy-patient-search"),
    path("bills/<int:bill_id>/dispense/", PharmacyBillDispenseAPIView.as_view(), name="pharmacy-bill-dispense"),

    path(
        "bills/<int:bill_id>/payment/",
        PharmacyBillPaymentAPIView.as_view(),
        name="pharmacy-bill-payment",
    ),

    path(
        "prescriptions/",
        PharmacyPrescriptionListAPIView.as_view(),
        name="pharmacy-prescriptions",
    ),
    path(
        "medicines/",
        PharmacyMedicineListCreateAPIView.as_view(),
        name="pharmacy-medicines",
    ),
    path(
        "medicines/<int:medicine_id>/",
        PharmacyMedicineDetailAPIView.as_view(),
        name="pharmacy-medicine-detail",
    ),
    path(
        "stock/",
        PharmacyStockListCreateAPIView.as_view(),
        name="pharmacy-stock",
    ),
    path(
        "stock/<int:stock_id>/",
        PharmacyStockDetailAPIView.as_view(),
        name="pharmacy-stock-detail",
    ),
    path(
        "bills/",
        PharmacyBillAPIView.as_view(),
        name="pharmacy-bills",
    ),
]
