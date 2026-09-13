from django.db import models

# Create your models here.
# ============================================================
# PROPOSED ADDITION TO cmsapp/models.py — LAB MODULE MODELS
# ============================================================
# Per team rule: do NOT paste this into cmsapp/models.py without
# team agreement. This file only shows the 5 lab-related models
# (#19-23 in the master model list) for review.
#
# These models depend on Staff and Consultation, which belong to
# other teammates' modules (Admin / Doctor). They are referenced
# here assuming they already exist in cmsapp/models.py.
# ============================================================

from django.db import models
from django.core.exceptions import ValidationError


# ----------------------------------------------------------
# 19. MasterLabTest
# ----------------------------------------------------------
class MasterLabTest(models.Model):
    """
    Lab test catalog, managed by Admin.
    Corresponds to 'Master_Lab_test' in the ER diagram.
    """
    test_id = models.AutoField(primary_key=True)
    test_name = models.CharField(max_length=150)
    test_type = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    test_price = models.DecimalField(max_digits=10, decimal_places=2)
    min_value = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    max_value = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "master_lab_test"

    def __str__(self):
        return self.test_name


# ----------------------------------------------------------
# 20. LabRequest
# ----------------------------------------------------------
class LabRequest(models.Model):
    """
    Created by the Doctor module during a Consultation.
    The Lab module only reads this and moves it through its
    status lifecycle — it never creates a LabRequest.
    """

    class Priority(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        URGENT = "URGENT", "Urgent"

    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        BILLED = "BILLED", "Billed"
        PAID = "PAID", "Paid"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    lab_request_id = models.AutoField(primary_key=True)
    consultation = models.ForeignKey(
        "cmsapp.Consultation",
        on_delete=models.CASCADE,
        related_name="lab_requests",
    )
    test = models.ForeignKey(
        MasterLabTest,
        on_delete=models.PROTECT,
        related_name="lab_requests",
    )
    order_date = models.DateTimeField(auto_now_add=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.REQUESTED)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "lab_request"

    def __str__(self):
        return f"LabRequest #{self.lab_request_id} - {self.test.test_name}"


# ----------------------------------------------------------
# 21. LabBill
# ----------------------------------------------------------
class LabBill(models.Model):

    class PaymentStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        UPI = "UPI", "UPI"

    lab_bill_id = models.AutoField(primary_key=True)
    patient = models.ForeignKey(
        "cmsapp.Patient",
        on_delete=models.PROTECT,
        related_name="lab_bills",
    )
    bill_date = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.PENDING
    )
    payment_method = models.CharField(
        max_length=10, choices=PaymentMethod.choices, blank=True, null=True
    )

    class Meta:
        db_table = "lab_bill"

    def __str__(self):
        return f"LabBill #{self.lab_bill_id} - {self.patient}"


# ----------------------------------------------------------
# 22. LabBillItem
# ----------------------------------------------------------
class LabBillItem(models.Model):
    """
    Links a LabBill to a specific LabRequest (not just a test id),
    because the same test can be requested more than once and the
    exact request instance must stay identifiable.
    """
    lab_bill_item_id = models.AutoField(primary_key=True)
    lab_bill = models.ForeignKey(
        LabBill, on_delete=models.CASCADE, related_name="items"
    )
    lab_request = models.ForeignKey(
        LabRequest, on_delete=models.PROTECT, related_name="bill_items"
    )
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = "lab_bill_item"
        constraints = [
            models.UniqueConstraint(
                fields=["lab_bill", "lab_request"],
                name="uniq_billitem_per_request_per_bill",
            )
        ]

    def __str__(self):
        return f"BillItem #{self.lab_bill_item_id}"


# ----------------------------------------------------------
# 23. LabResult
# ----------------------------------------------------------
class LabResult(models.Model):
    """
    One LabRequest -> exactly one LabResult.
    technician must be Staff with role LAB_TECHNICIAN (enforced
    in serializer/view business logic, not at the DB layer).
    """
    result_id = models.AutoField(primary_key=True)
    lab_request = models.OneToOneField(
        LabRequest, on_delete=models.CASCADE, related_name="result"
    )
    technician = models.ForeignKey(
        "cmsapp.Staff", on_delete=models.PROTECT, related_name="lab_results"
    )
    bill = models.ForeignKey(
        LabBill, on_delete=models.PROTECT, related_name="results"
    )
    result_value = models.CharField(max_length=255)
    unit = models.CharField(max_length=50, blank=True, null=True)
    reference_range = models.CharField(max_length=100, blank=True, null=True)
    result_date = models.DateTimeField(auto_now_add=True)
    report = models.FileField(upload_to="lab_reports/", blank=True, null=True)

    class Meta:
        db_table = "lab_result"

    def __str__(self):
        return f"Result #{self.result_id} for Request #{self.lab_request_id}"