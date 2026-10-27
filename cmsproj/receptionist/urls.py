
from .views import (
    RegistrationBillListCreateAPIView,
    RegistrationBillDetailAPIView,
    TokenListAPIView,
)

from .views import RegistrationBillPaymentAPIView

from .views import TokenGenerateAPIView,TokenDetailAPIView

from django.urls import path
from .views import PatientDetailAPIView, PatientListCreateAPIView

from .views import (AppointmentListCreateAPIView,AppointmentDetailAPIView,)

from .views import TokenStatusUpdateAPIView

urlpatterns = [
    path("patients/", PatientListCreateAPIView.as_view(), name="patient-list-create"),
    path("patients/<int:patient_id>/", PatientDetailAPIView.as_view(), name="patient-detail"),

    path("appointments/",AppointmentListCreateAPIView.as_view(),name="appointment-list-create"),
    path("appointments/<int:appointment_id>/",AppointmentDetailAPIView.as_view(),name="appointment-detail"),

    path("bills/",RegistrationBillListCreateAPIView.as_view(),name="registration-bill-list-create"),
    path("bills/<int:bill_id>/",RegistrationBillDetailAPIView.as_view(),name="registration-bill-detail"),

    path("bills/<int:bill_id>/pay/",RegistrationBillPaymentAPIView.as_view(),name="registration-bill-payment"),

    path("tokens/generate/",TokenGenerateAPIView.as_view(),name="token-generate"),

    path("tokens/",TokenListAPIView.as_view(),name="token-list"),
    path("tokens/<int:token_id>/",TokenDetailAPIView.as_view(),name="token-detail"),

    path("tokens/<int:token_id>/status/",TokenStatusUpdateAPIView.as_view(),name="token-status-update"),
]
