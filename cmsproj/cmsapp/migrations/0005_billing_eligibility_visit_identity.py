from django.db import migrations, models
import django.db.models.deletion


def backfill_registration_fee_status(apps, schema_editor):
    Patient = apps.get_model("cmsapp", "Patient")
    RegistrationBill = apps.get_model("cmsapp", "RegistrationBill")
    database = schema_editor.connection.alias

    patients_with_assessed_fee = RegistrationBill.objects.using(database).filter(
        registration_fee__gt=0
    ).values_list("patient_id", flat=True).distinct()

    Patient.objects.using(database).exclude(
        patient_id__in=patients_with_assessed_fee
    ).update(registration_fee_status="REVIEW")
    Patient.objects.using(database).filter(
        patient_id__in=patients_with_assessed_fee
    ).update(registration_fee_status="ASSESSED")


class Migration(migrations.Migration):
    dependencies = [
        ("cmsapp", "0004_pharmacybillitem_prescription_item"),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="registration_fee_status",
            field=models.CharField(
                choices=[
                    ("ELIGIBLE", "Eligible"),
                    ("ASSESSED", "Assessed"),
                    ("REVIEW", "Needs review"),
                ],
                default="REVIEW",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="registrationbill",
            name="appointment",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="registration_bill",
                to="cmsapp.appointment",
            ),
        ),
        migrations.AddField(
            model_name="registrationbill",
            name="visit_key",
            field=models.UUIDField(blank=True, null=True, unique=True),
        ),
        migrations.RunPython(
            backfill_registration_fee_status,
            migrations.RunPython.noop,
        ),
    ]
