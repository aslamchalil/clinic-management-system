# lab/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    LabBillViewSet,
    LabRequestViewSet,
    LabResultViewSet,
    MasterLabTestViewSet,
)

router = DefaultRouter()
router.register(r"master-tests", MasterLabTestViewSet, basename="lab-master-tests")
router.register(r"requests", LabRequestViewSet, basename="lab-requests")
router.register(r"bills", LabBillViewSet, basename="lab-bills")
router.register(r"results", LabResultViewSet, basename="lab-results")

urlpatterns = [path("", include(router.urls))]

# Resulting endpoints (mounted at /lab/ in the project urls.py):
#
# GET  /lab/master-tests/                       active tests (read-only)
# GET  /lab/requests/                           ?status= ?priority= ?patient=
# GET  /lab/requests/<id>/
# POST /lab/requests/<id>/start-processing/     PAID -> IN_PROGRESS
#
# GET  /lab/bills/                              ?payment_status= ?patient=
# POST /lab/bills/                              {"lab_request_ids": [1, 2]}  -> BILLED
# GET  /lab/bills/<id>/                         bill + items
# POST /lab/bills/<id>/mark-paid/               {"payment_method": "CASH"}   -> PAID
# POST /lab/bills/<id>/cancel/                  unpaid only -> REQUESTED
#
# GET  /lab/results/                            ?lab_request= ?consultation= ?patient=
# GET  /lab/results/<id>/
# POST /lab/results/                            IN_PROGRESS -> COMPLETED