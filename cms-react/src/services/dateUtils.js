const CLINIC_TIME_ZONE = 'Asia/Kolkata';

function clinicTodayParts(from = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(from);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function localDate() {
  const { year, month, day } = clinicTodayParts();
  return `${year}-${month}-${day}`;
}

export function maximumTokenDate(from = new Date()) {
  const { year, month, day } = clinicTodayParts(from);
  const monthIndex = Number(month) - 1 + 2;
  const targetYear = Number(year) + Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(Number(day), lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}
