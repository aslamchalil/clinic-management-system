from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("cmsapp", "0005_billing_eligibility_visit_identity"),
    ]

    operations = [
        migrations.CreateModel(
            name="StockRequest",
            fields=[
                ("request_id", models.AutoField(primary_key=True, serialize=False)),
                ("department", models.CharField(choices=[("PHARMACY", "Pharmacy"), ("LABORATORY", "Laboratory")], max_length=20)),
                ("item_name", models.CharField(max_length=200)),
                ("requested_quantity", models.PositiveIntegerField()),
                ("reason", models.TextField()),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected")], default="PENDING", max_length=20)),
                ("review_note", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("medicine", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="stock_requests", to="cmsapp.mastermedicine")),
                ("requested_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="stock_requests_submitted", to="cmsapp.staff")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="stock_requests_reviewed", to="cmsapp.staff")),
            ],
        ),
    ]
