from django.db import migrations, models


def mark_legacy_paid_pharmacy_bills_dispensed(apps, schema_editor):
    """The former payment endpoint deducted stock and updated Rx quantities."""
    PharmacyBill = apps.get_model("cmsapp", "PharmacyBill")
    PharmacyBillItem = apps.get_model("cmsapp", "PharmacyBillItem")
    alias = schema_editor.connection.alias
    linked_bill_ids = PharmacyBillItem.objects.using(alias).filter(
        prescription_item__isnull=False,
    ).values_list("pharmacy_bill_id", flat=True).distinct()
    PharmacyBill.objects.using(alias).filter(
        payment_status="PAID",
        pk__in=linked_bill_ids,
    ).update(
        dispensed_at=models.F("bill_date")
    )


def backfill_approved_quantities(apps, schema_editor):
    StockRequest = apps.get_model("cmsapp", "StockRequest")
    StockRequest.objects.using(schema_editor.connection.alias).filter(
        status="APPROVED",
        approved_quantity__isnull=True,
    ).update(approved_quantity=models.F("requested_quantity"))


class Migration(migrations.Migration):
    dependencies = [("cmsapp", "0006_stockrequest")]

    operations = [
        migrations.AddField(
            model_name="pharmacybill",
            name="dispensed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="stockrequest",
            name="approved_quantity",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(
            mark_legacy_paid_pharmacy_bills_dispensed,
            migrations.RunPython.noop,
        ),
        migrations.RunPython(
            backfill_approved_quantities,
            migrations.RunPython.noop,
        ),
    ]
