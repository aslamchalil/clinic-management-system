
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),

    # Authentication
    path("api/auth/", include("clinic_admin.urls")),
    path(
        "api/auth/token/refresh/",
        TokenRefreshView.as_view(),
        name="token_refresh",
    ),

    # Application modules
    path("api/receptionist/", include("receptionist.urls")),
    path("api/doctor/", include("doctor.urls")),
    path("api/pharmacy/", include("pharmacy.urls")),
    path("api/lab/", include("lab.urls")),
]