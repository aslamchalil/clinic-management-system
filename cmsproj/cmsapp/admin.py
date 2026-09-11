from django.contrib import admin

# Register your models here.

from django.contrib import admin

from .models import (
    Role,
    Department,
    Specialization,
    Staff,
    Doctor,
    DoctorSession,
    Patient,
    Appointment,
    RegistrationBill,
    Token,
    Consultation,
    Prescription,
    MasterMedicine,
    Dosage,
    PrescriptionItem,
    PharmacyStock,
    PharmacyBill,
    PharmacyBillItem,
    MasterLabTest,
    LabRequest,
    LabBill,
    LabBillItem,
    LabResult,
)


admin.site.register(Role)
admin.site.register(Department)
admin.site.register(Specialization)
admin.site.register(Staff)
admin.site.register(Doctor)
admin.site.register(DoctorSession)

admin.site.register(Patient)
admin.site.register(Appointment)
admin.site.register(RegistrationBill)
admin.site.register(Token)

admin.site.register(Consultation)
admin.site.register(Prescription)
admin.site.register(PrescriptionItem)

admin.site.register(MasterMedicine)
admin.site.register(Dosage)
admin.site.register(PharmacyStock)
admin.site.register(PharmacyBill)
admin.site.register(PharmacyBillItem)

admin.site.register(MasterLabTest)
admin.site.register(LabRequest)
admin.site.register(LabBill)
admin.site.register(LabBillItem)
admin.site.register(LabResult)