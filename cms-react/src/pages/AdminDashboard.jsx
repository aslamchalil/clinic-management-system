import React, { useEffect, useMemo, useState } from 'react';
import { api, unwrap, errorMessage } from '../services/api';
import { Card, Stat, Empty } from '../components/UI';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

function toDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState({
    patients: [],
    tokens: [],
    appointments: [],
    staff: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [patientsRes, tokensRes, appointmentsRes, staffRes] = await Promise.all([
          api.get('/receptionist/patients/'),
          api.get('/receptionist/tokens/'),
          api.get('/receptionist/appointments/'),
          api.get('/auth/staff/'),
        ]);

        if (!mounted) return;

        setSummary({
          patients: unwrap(patientsRes.data),
          tokens: unwrap(tokensRes.data),
          appointments: unwrap(appointmentsRes.data),
          staff: unwrap(staffRes.data),
        });
      } catch (err) {
        if (mounted) {
          setError(errorMessage(err));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const counts = {
    patients: summary.patients.length,
    tokens: summary.tokens.length,
    appointments: summary.appointments.length,
    staff: summary.staff.length,
  };

  const chartData = useMemo(() => {
    const patientMap = {};
    const tokenMap = {};

    summary.patients.forEach((record) => {
      const dateKey = toDateKey(record.created_at);
      if (!dateKey) return;
      patientMap[dateKey] = (patientMap[dateKey] || 0) + 1;
    });

    summary.tokens.forEach((record) => {
      const dateKey = toDateKey(record.created_at || record.token_date);
      if (!dateKey) return;
      tokenMap[dateKey] = (tokenMap[dateKey] || 0) + 1;
    });

    const allDates = [...new Set([...Object.keys(patientMap), ...Object.keys(tokenMap)])].sort();

    return allDates.map((date) => ({
      date,
      patients: patientMap[date] || 0,
      tokens: tokenMap[date] || 0,
    }));
  }, [summary]);

  return (
    <div className="workspace-content">
      {error && <div className="alert alert-warning">{error}</div>}

      {loading && <div className="loading-line"><span /> Loading live counts from Django…</div>}

      {!loading && (
        <>
          <div className="row g-3 mb-3">
            <div className="col-6 col-xl-3">
              <Stat icon="people-fill" label="Patients" value={counts.patients} tone="primary" />
            </div>
            <div className="col-6 col-xl-3">
              <Stat icon="ticket-perforated" label="Tokens" value={counts.tokens} tone="success" />
            </div>
            <div className="col-6 col-xl-3">
              <Stat icon="calendar-check" label="Appointments" value={counts.appointments} tone="warning" />
            </div>
            <div className="col-6 col-xl-3">
              <Stat icon="person-badge" label="Staff" value={counts.staff} tone="info" />
            </div>
          </div>

          <Card
            title="Patient registrations & token generation"
            subtitle="Daily totals derived from the actual patient and token records returned by Django"
          >
            {chartData.length ? (
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      labelFormatter={(label) => formatShortDate(label)}
                      formatter={(value, name) => [value, name]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="patients"
                      name="New patient registrations"
                      stroke="#1d4ed8"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tokens"
                      name="Tokens generated"
                      stroke="#14b8a6"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty
                title="No date-based activity available"
                description={
                  summary.patients.length || summary.tokens.length
                    ? 'The current API response did not include usable created_at timestamps for daily charting.'
                    : 'The backend returned no patient or token activity, so no daily chart is displayed.'
                }
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}