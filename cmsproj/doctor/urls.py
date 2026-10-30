
from django.urls import path
from .views import (
    DoctorQueueAPIView,
    DoctorPatientDetailsAPIView,
    DoctorTodayAppointmentsAPIView,
    ConsultationCreateAPIView,
    PrescriptionCreateAPIView,
    PrescriptionItemCreateAPIView,
    PrescriptionDetailAPIView,
    LabRequestCreateAPIView,
    LabRequestListAPIView,
    LabRequestDetailAPIView,
    DoctorDashboardAPIView,
    DoctorPatientSearchAPIView,
    DoctorConsultationHistoryAPIView,
    DoctorConsultationDetailAPIView,
    DoctorMedicineListAPIView,
    DoctorDosageListAPIView,
    DoctorLabTestListAPIView,
)

from .views import ConsultationFinalizeAPIView,DoctorCallNextTokenAPIView


urlpatterns = [
    path("dashboard/", DoctorDashboardAPIView.as_view(), name="doctor-dashboard"),
    path("patients/search/", DoctorPatientSearchAPIView.as_view(), name="doctor-patient-search"),
    path("consultations/history/", DoctorConsultationHistoryAPIView.as_view(), name="doctor-consultation-history"),
    path("medicines/", DoctorMedicineListAPIView.as_view(), name="doctor-medicines"),
    path("dosages/", DoctorDosageListAPIView.as_view(), name="doctor-dosages"),
    path("lab-tests/", DoctorLabTestListAPIView.as_view(), name="doctor-lab-tests"),
    path("queue/", DoctorQueueAPIView.as_view(), name="doctor-queue"),
    path(
        "appointments/today/",
        DoctorTodayAppointmentsAPIView.as_view(),
        name="doctor-today-appointments",
    ),
    path(
        "patients/<int:patient_id>/",
        DoctorPatientDetailsAPIView.as_view(),
        name="doctor-patient-details",
    ),
    path("consultations/", ConsultationCreateAPIView.as_view(), name="consultation-create"),
    path("prescriptions/", PrescriptionCreateAPIView.as_view(), name="prescription-create"),
    path(
        "prescription-items/",
        PrescriptionItemCreateAPIView.as_view(),
        name="prescription-item-create",
    ),
    path(
        "consultations/<int:consultation_id>/",
        DoctorConsultationDetailAPIView.as_view(),
        name="doctor-consultation-detail",
    ),
    path(
        "prescriptions/<int:prescription_id>/",
        PrescriptionDetailAPIView.as_view(),
        name="prescription-detail",
    ),
    path("lab-requests/", LabRequestCreateAPIView.as_view(), name="lab-request-create"),
    path(
        "lab-requests/list/",
        LabRequestListAPIView.as_view(),
        name="lab-request-list",
    ),
    path(
        "lab-requests/<int:lab_request_id>/",
        LabRequestDetailAPIView.as_view(),
        name="lab-request-detail",
    ),

    path(
        "consultations/<int:consultation_id>/finalize/",
        ConsultationFinalizeAPIView.as_view(),
        name="consultation-finalize",
    ),
    path(
        "tokens/<int:token_id>/call/",
        DoctorCallNextTokenAPIView.as_view(),
        name="doctor-call-next-token",
    ),
]
