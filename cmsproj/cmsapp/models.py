from django.conf import settings
from django.db import models


# ============================================================
# 1. ROLE
# ============================================================

class Role(models.Model):
    role_id = models.AutoField(primary_key=True)

    role_name = models.CharField(
        max_length=50,
        unique=True
    )

    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.role_name


# ============================================================
# 2. DEPARTMENT
# ============================================================

class Department(models.Model):
    department_id = models.AutoField(primary_key=True)

    department_name = models.CharField(
        max_length=100,
        unique=True
    )

    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.department_name


# ============================================================
# 3. SPECIALIZATION
# ============================================================

class Specialization(models.Model):
    spec_id = models.AutoField(primary_key=True)

    spec_name = models.CharField(
        max_length=100,
        unique=True
    )

    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.spec_name


# ============================================================
# 4. STAFF
# ============================================================

class Staff(models.Model):

    staff_id = models.AutoField(primary_key=True)

    # Django's built-in User model
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile"
    )

    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="staff_members"
    )

    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="staff_members"
    )

    first_name = models.CharField(
        max_length=100
    )

    last_name = models.CharField(
        max_length=100
    )

    dob = models.DateField()

    gender = models.CharField(
        max_length=20,
        choices=[
            ("MALE", "Male"),
            ("FEMALE", "Female"),
            ("OTHER", "Other"),
        ]
    )

    phone_number = models.CharField(
        max_length=20
    )

    email = models.EmailField()

    is_active = models.BooleanField(
        default=True
    )

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


# ============================================================
# 5. DOCTOR
# ============================================================

class Doctor(models.Model):

    doc_id = models.AutoField(primary_key=True)

    # One Staff member can have only one Doctor profile
    staff = models.OneToOneField(
        Staff,
        on_delete=models.CASCADE,
        related_name="doctor_profile"
    )

    specialization = models.ForeignKey(
        Specialization,
        on_delete=models.PROTECT,
        related_name="doctors"
    )

    consultation_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    qualification = models.CharField(
        max_length=200,
        blank=True
    )

    exp_year = models.PositiveIntegerField(
        default=0
    )

    license_no = models.CharField(
        max_length=100,
        unique=True
    )

    is_active = models.BooleanField(
        default=True
    )

    def __str__(self):
        return f"Dr. {self.staff.first_name} {self.staff.last_name}"


# ============================================================
# 6. DOCTOR SESSION
# ============================================================

class DoctorSession(models.Model):

    class SessionChoices(models.TextChoices):
        MORNING = "MORNING", "Morning"
        EVENING = "EVENING", "Evening"

    session_id = models.AutoField(primary_key=True)

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name="sessions"
    )

    session = models.CharField(
        max_length=20,
        choices=SessionChoices.choices
    )

    start_time = models.TimeField()

    end_time = models.TimeField()

    is_active = models.BooleanField(
        default=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["doctor", "session"],
                name="unique_doctor_session"
            )
        ]

    def __str__(self):
        return f"{self.doctor} - {self.session}"


# ============================================================
# 7. PATIENT
# ============================================================

class Patient(models.Model):

    patient_id = models.AutoField(primary_key=True)

    full_name = models.CharField(
        max_length=200
    )

    dob = models.DateField()

    gender = models.CharField(
        max_length=20,
        choices=[
            ("MALE", "Male"),
            ("FEMALE", "Female"),
            ("OTHER", "Other"),
        ]
    )

    phone_number = models.CharField(
        max_length=20
    )

    email = models.EmailField(
        blank=True
    )

    address = models.TextField(
        blank=True
    )

    blood_group = models.CharField(
        max_length=5,
        blank=True
    )

    emergency_contact = models.CharField(
        max_length=20,
        blank=True
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return self.full_name


# ============================================================
# 8. APPOINTMENT
# ============================================================

class Appointment(models.Model):

    class StatusChoices(models.TextChoices):
        BOOKED = "BOOKED", "Booked"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        NO_SHOW = "NO_SHOW", "No Show"

    class AdvancePaymentChoices(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        REFUNDED = "REFUNDED", "Refunded"

    appointment_id = models.AutoField(primary_key=True)

    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="appointments"
    )

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.PROTECT,
        related_name="appointments"
    )

    appointment_date = models.DateField()

    appointment_time_slot = models.TimeField()

    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.BOOKED
    )

    advance_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    advance_payment_status = models.CharField(
        max_length=20,
        choices=AdvancePaymentChoices.choices,
        default=AdvancePaymentChoices.PENDING
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return (
            f"{self.patient} - "
            f"{self.doctor} - "
            f"{self.appointment_date}"
        )


# ============================================================
# 9. REGISTRATION BILL
# ============================================================

class RegistrationBill(models.Model):

    class PaymentStatusChoices(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"
        REFUNDED = "REFUNDED", "Refunded"

    class PaymentMethodChoices(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        UPI = "UPI", "UPI"

    bill_id = models.AutoField(primary_key=True)

    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="registration_bills"
    )

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.PROTECT,
        related_name="registration_bills"
    )

    registration_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    consultation_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatusChoices.choices,
        default=PaymentStatusChoices.PENDING
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethodChoices.choices,
        blank=True
    )

    bill_date = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return f"Registration Bill #{self.bill_id}"


# ============================================================
# 10. TOKEN
# ============================================================

class Token(models.Model):

    class SessionChoices(models.TextChoices):
        MORNING = "MORNING", "Morning"
        EVENING = "EVENING", "Evening"

    class StatusChoices(models.TextChoices):
        WAITING = "WAITING", "Waiting"
        CALLED = "CALLED", "Called"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    token_id = models.AutoField(primary_key=True)

    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="tokens"
    )

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.PROTECT,
        related_name="tokens"
    )

    # One paid registration bill creates one token
    bill = models.OneToOneField(
        RegistrationBill,
        on_delete=models.PROTECT,
        related_name="token"
    )

    # NULL for walk-in patients
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tokens"
    )

    token_number = models.PositiveIntegerField()

    token_date = models.DateField()

    session = models.CharField(
        max_length=20,
        choices=SessionChoices.choices
    )

    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.WAITING
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=[
                    "doctor",
                    "token_date",
                    "session",
                    "token_number"
                ],
                name="unique_doctor_token_per_session"
            )
        ]

    def __str__(self):
        return (
            f"Token {self.token_number} - "
            f"{self.doctor} - "
            f"{self.token_date}"
        )


# ============================================================
# 11. CONSULTATION
# ============================================================

class Consultation(models.Model):

    consult_id = models.AutoField(primary_key=True)

    # One valid token results in one consultation
    token = models.OneToOneField(
        Token,
        on_delete=models.PROTECT,
        related_name="consultation"
    )

    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="consultations"
    )

    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.PROTECT,
        related_name="consultations"
    )

    symptoms = models.TextField(
        blank=True
    )

    diagnosis = models.TextField(
        blank=True
    )

    remarks = models.TextField(
        blank=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return f"Consultation #{self.consult_id}"


# ============================================================
# 12. PRESCRIPTION
# ============================================================

class Prescription(models.Model):

    prescription_id = models.AutoField(primary_key=True)

    # One consultation has one prescription
    consultation = models.OneToOneField(
        Consultation,
        on_delete=models.PROTECT,
        related_name="prescription"
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def __str__(self):
        return f"Prescription #{self.prescription_id}"


# ============================================================
# 13. MASTER MEDICINE
# ============================================================

class MasterMedicine(models.Model):

    medicine_id = models.AutoField(primary_key=True)

    name = models.CharField(
        max_length=200
    )

    generic_name = models.CharField(
        max_length=200,
        blank=True
    )

    category = models.CharField(
        max_length=100,
        blank=True
    )

    is_active = models.BooleanField(
        default=True
    )

    def __str__(self):
        return self.name


# ============================================================
# 14. DOSAGE
# ============================================================

class Dosage(models.Model):

    dosage_id = models.AutoField(primary_key=True)

    medicine = models.ForeignKey(
        MasterMedicine,
        on_delete=models.PROTECT,
        related_name="dosages"
    )

    dosage_value = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    unit = models.CharField(
        max_length=50
    )

    description = models.CharField(
        max_length=200,
        blank=True
    )

    is_active = models.BooleanField(
        default=True
    )

    def __str__(self):
        return f"{self.medicine} - {self.dosage_value} {self.unit}"


# ============================================================
# 15. PRESCRIPTION ITEM
# ============================================================

class PrescriptionItem(models.Model):

    class DispensedStatusChoices(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DISPENSED = "DISPENSED", "Dispensed"

    prescription_item_id = models.AutoField(
        primary_key=True
    )

    prescription = models.ForeignKey(
        Prescription,
        on_delete=models.PROTECT,
        related_name="items"
    )

    medicine = models.ForeignKey(
        MasterMedicine,
        on_delete=models.PROTECT,
        related_name="prescription_items"
    )

    dosage = models.ForeignKey(
        Dosage,
        on_delete=models.PROTECT,
        related_name="prescription_items"
    )

    frequency = models.CharField(
        max_length=100
    )

    duration = models.CharField(
        max_length=100
    )

    instructions = models.TextField(
        blank=True
    )

    dispensed_status = models.CharField(
        max_length=20,
        choices=DispensedStatusChoices.choices,
        default=DispensedStatusChoices.PENDING
    )

    is_active = models.BooleanField(
        default=True
    )

    def __str__(self):
        return (
            f"{self.prescription} - "
            f"{self.medicine}"
        )


# ============================================================
# 16. PHARMACY STOCK
# ============================================================

class PharmacyStock(models.Model):

    stock_id = models.AutoField(primary_key=True)

    # One stock record per medicine
    medicine = models.OneToOneField(
        MasterMedicine,
        on_delete=models.PROTECT,
        related_name="stock"
    )

    quantity = models.PositiveIntegerField(
        default=0
    )

    unit_cost_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    reorder_level = models.PositiveIntegerField(
        default=0
    )

    def __str__(self):
        return f"{self.medicine} - Stock: {self.quantity}"


# ============================================================
# 17. PHARMACY BILL
# ============================================================

class PharmacyBill(models.Model):

    class PaymentStatusChoices(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMethodChoices(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        UPI = "UPI", "UPI"

    pharmacy_bill_id = models.AutoField(
        primary_key=True
    )

    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="pharmacy_bills"
    )

    pharmacist = models.ForeignKey(
        Staff,
        on_delete=models.PROTECT,
        related_name="pharmacy_bills"
    )

    bill_date = models.DateTimeField(
        auto_now_add=True
    )

    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatusChoices.choices,
        default=PaymentStatusChoices.PENDING
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethodChoices.choices,
        blank=True
    )

    def __str__(self):
        return f"Pharmacy Bill #{self.pharmacy_bill_id}"


# ============================================================
# 18. PHARMACY BILL ITEM
# ============================================================

class PharmacyBillItem(models.Model):

    item_bill_id = models.AutoField(
        primary_key=True
    )

    pharmacy_bill = models.ForeignKey(
        PharmacyBill,
        on_delete=models.CASCADE,
        related_name="items"
    )

    medicine = models.ForeignKey(
        MasterMedicine,
        on_delete=models.PROTECT,
        related_name="pharmacy_bill_items"
    )

    quantity_dispensed = models.PositiveIntegerField()

    # Snapshot of the price charged at the time of billing
    unit_selling_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    line_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    def __str__(self):
        return f"{self.medicine} - {self.quantity_dispensed}"


# ============================================================
# 19. MASTER LAB TEST
# ============================================================

class MasterLabTest(models.Model):

    test_id = models.AutoField(primary_key=True)

    test_name = models.CharField(
        max_length=200
    )

    test_type = models.CharField(
        max_length=100,
        blank=True
    )

    description = models.TextField(
        blank=True
    )

    test_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    min_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    max_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    is_active = models.BooleanField(
        default=True
    )

    def __str__(self):
        return self.test_name


# ============================================================
# 20. LAB REQUEST
# ============================================================

class LabRequest(models.Model):

    class PriorityChoices(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        URGENT = "URGENT", "Urgent"

    class StatusChoices(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        BILLED = "BILLED", "Billed"
        PAID = "PAID", "Paid"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    lab_request_id = models.AutoField(
        primary_key=True
    )

    consultation = models.ForeignKey(
        Consultation,
        on_delete=models.PROTECT,
        related_name="lab_requests"
    )

    test = models.ForeignKey(
        MasterLabTest,
        on_delete=models.PROTECT,
        related_name="lab_requests"
    )

    order_date = models.DateTimeField(
        auto_now_add=True
    )

    priority = models.CharField(
        max_length=20,
        choices=PriorityChoices.choices,
        default=PriorityChoices.NORMAL
    )

    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.REQUESTED
    )

    is_active = models.BooleanField(
        default=True
    )

    def __str__(self):
        return (
            f"Lab Request #{self.lab_request_id} - "
            f"{self.test}"
        )


# ============================================================
# 21. LAB BILL
# ============================================================

class LabBill(models.Model):

    class PaymentStatusChoices(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

    class PaymentMethodChoices(models.TextChoices):
        CASH = "CASH", "Cash"
        CARD = "CARD", "Card"
        UPI = "UPI", "UPI"

    lab_bill_id = models.AutoField(
        primary_key=True
    )

    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="lab_bills"
    )

    bill_date = models.DateTimeField(
        auto_now_add=True
    )

    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatusChoices.choices,
        default=PaymentStatusChoices.PENDING
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethodChoices.choices,
        blank=True
    )

    def __str__(self):
        return f"Lab Bill #{self.lab_bill_id}"


# ============================================================
# 22. LAB BILL ITEM
# ============================================================

class LabBillItem(models.Model):

    lab_bill_item_id = models.AutoField(
        primary_key=True
    )

    lab_bill = models.ForeignKey(
        LabBill,
        on_delete=models.CASCADE,
        related_name="items"
    )

    lab_request = models.ForeignKey(
        LabRequest,
        on_delete=models.PROTECT,
        related_name="bill_items"
    )

    quantity = models.PositiveIntegerField(
        default=1
    )

    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    line_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    def __str__(self):
        return (
            f"{self.lab_bill} - "
            f"{self.lab_request}"
        )


# ============================================================
# 23. LAB RESULT
# ============================================================

class LabResult(models.Model):

    result_id = models.AutoField(
        primary_key=True
    )

    # One lab request produces one result
    lab_request = models.OneToOneField(
        LabRequest,
        on_delete=models.PROTECT,
        related_name="result"
    )

    # Lab technician is a Staff member with the
    # LAB_TECHNICIAN role
    technician = models.ForeignKey(
        Staff,
        on_delete=models.PROTECT,
        related_name="lab_results"
    )

    # Result is associated with the bill that was paid
    bill = models.ForeignKey(
        LabBill,
        on_delete=models.PROTECT,
        related_name="results"
    )

    result_value = models.CharField(
        max_length=200
    )

    unit = models.CharField(
        max_length=50,
        blank=True
    )

    reference_range = models.CharField(
        max_length=100,
        blank=True
    )

    result_date = models.DateTimeField(
        auto_now_add=True
    )

    report = models.TextField(
        blank=True
    )

    def __str__(self):
        return f"Result #{self.result_id}"