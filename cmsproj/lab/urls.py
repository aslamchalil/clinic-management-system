# lab/urls.py

from rest_framework.routers import DefaultRouter
from .views import LabRequestViewSet, LabBillViewSet, LabResultViewSet

router = DefaultRouter()
router.register(r"lab-requests", LabRequestViewSet, basename="lab-request")
router.register(r"lab-bills", LabBillViewSet, basename="lab-bill")
router.register(r"lab-results", LabResultViewSet, basename="lab-result")

urlpatterns = router.urls

# Resulting endpoints:
#
# GET    /lab/lab-requests/                     list lab requests (filter ?status=PAID etc.)
# GET    /lab/lab-requests/<pk>/                 retrieve one
# POST   /lab/lab-requests/<pk>/start-processing/  REQUESTED->... PAID -> IN_PROGRESS
#
# GET    /lab/lab-bills/                         list bills (filter ?payment_status=PENDING)
# GET    /lab/lab-bills/<pk>/                     retrieve one bill with its items
# POST   /lab/lab-bills/                          create bill + items for a set of lab_request_ids
# POST   /lab/lab-bills/<pk>/mark-paid/           confirm payment, cascades PAID to LabRequests
#
# GET    /lab/lab-results/                        list results
# GET    /lab/lab-results/<pk>/                   retrieve one result
# POST   /lab/lab-results/                        enter a result (only if bill PAID & request IN_PROGRESS)