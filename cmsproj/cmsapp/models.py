from django.db import models


# =========================
# ADMIN MODULE
# =========================

class Role(models.Model):
    pass


class Department(models.Model):
    pass


class Specialization(models.Model):
    pass


class Staff(models.Model):
    pass


# =========================
# DOCTOR MODULE
# =========================

class Doctor(models.Model):
    pass


class DoctorSession(models.Model):
    pass


class Consultation(models.Model):
    pass


class Prescription(models.Model):
    pass


class PrescriptionItem(models.Model):
    pass


class LabRequest(models.Model):
    pass


# =========================
# RECEPTIONIST MODULE
# =========================

class Patient(models.Model):
    pass


class Appointment(models.Model):
    pass


class Token(models.Model):
    pass


class RegistrationBill(models.Model):
    pass


# =========================
# PHARMACY MODULE
# =========================

class MasterMedicine(models.Model):
    pass


class Dosage(models.Model):
    pass


class PharmacyStock(models.Model):
    pass


class PharmacyBill(models.Model):
    pass


class PharmacyBillItem(models.Model):
    pass


# =========================
# LAB MODULE
# =========================

class MasterLabTest(models.Model):
    pass


class LabResult(models.Model):
    pass


class LabBill(models.Model):
    pass


class LabBillItem(models.Model):
    pass