import calendar
from datetime import date

from django.utils import timezone


def maximum_token_date(today=None):
    """Return two calendar months ahead, clamping to the target month's end."""
    today = today or timezone.localdate()
    month_index = today.month - 1 + 2
    year = today.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(today.day, last_day))
