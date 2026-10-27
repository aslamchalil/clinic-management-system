import React, { useEffect, useMemo, useState } from 'react';
import '../styles/dashboard.css';
import { Link } from 'react-router-dom';
import { api, errorMessage, unwrap } from '../services/api';
import { listAppointments, listBills, listPatients, listTokens } from '../services/receptionistService';
import { Card, Empty, Stat, Status } from '../components/UI';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

const routes = {
  ADMIN: [['Patients','/receptionist/patients/'],['Tokens','/receptionist/tokens/'],['Appointments','/receptionist/appointments/'],['Staff','/auth/staff/']],
  RECEPTIONIST: [['Patients','/receptionist/patients/'],['Appointments','/receptionist/appointments/'],['Tokens','/receptionist/tokens/'],['Bills','/receptionist/bills/']],
  DOCTOR: [['Queue','/doctor/queue/'],['Appointments','/doctor/appointments/today/'],['Prescriptions','/doctor/prescriptions/'],['Lab requests','/doctor/lab-requests/list/']],
  PHARMACIST: [['Prescriptions','/pharmacy/prescriptions/'],['Stock','/pharmacy/stock/'],['Bills','/pharmacy/bills/']],
  LAB_ASSISTANT: [['Requests','/lab/requests/'],['Tests','/lab/tests/'],['Results','/lab/results/']],
};
const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const personName = (person) => [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();
const patientFields = (patient) => [patient?.patient_id, patient?.full_name, patient?.phone_number].filter((value) => value !== null && value !== undefined).join(' ').toLowerCase();

function ReceptionistDashboard() {
  const [records, setRecords] = useState({ patients: [], appointments: [], tokens: [], bills: [] });
  const [states, setStates] = useState({});
  const [query, setQuery] = useState('');
  const today = localDate();

  useEffect(() => {
    let live = true;
    const requests = { patients: listPatients, appointments: listAppointments, tokens: listTokens, bills: listBills };
    Promise.all(Object.entries(requests).map(async ([key, load]) => {
      try { return [key, { data: await load() }]; }
      catch (error) { return [key, { error: errorMessage(error) }]; }
    })).then((items) => {
      if (!live) return;
      const result = Object.fromEntries(items);
      setRecords((current) => Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.data || current[key]])));
      setStates(Object.fromEntries(items.map(([key, value]) => [key, value.error || ''])));
    });
    return () => { live = false; };
  }, []);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return records.patients.filter((patient) => patientFields(patient).includes(term)).slice(0, 8);
  }, [records.patients, query]);
  const todayAppointments = useMemo(() => records.appointments
    .filter((appointment) => String(appointment.appointment_date || '').slice(0, 10) === today)
    .sort((a, b) => String(a.appointment_time_slot || '').localeCompare(String(b.appointment_time_slot || ''))), [records.appointments, today]);
  const patientsById = useMemo(() => new Map(records.patients.map((p) => [String(p.patient_id), p])), [records.patients]);
  const tokensByAppointment = useMemo(() => new Map(records.tokens.filter((token) => token.appointment != null).map((token) => [String(token.appointment), token])), [records.tokens]);

  const cards = [
    ['Patients', 'people', 'patients'], ['Appointments', 'calendar-check', 'appointments'],
    ['Tokens', 'ticket-perforated', 'tokens'], ['Bills', 'receipt', 'bills'],
  ];
  return <div className="workspace-content">
    {Object.entries(states).filter(([, message]) => message).map(([key, message]) => <div className="alert alert-warning" role="alert" key={key}>Could not load {key}: {message}</div>)}
    <div className="row g-3 mb-3">{cards.map(([label, icon, key]) => <div className="col-6 col-xl-3" key={key}><Stat label={label} icon={icon} value={states[key] ? 'Unavailable' : records[key].length} /></div>)}</div>

    <Card title="Patient search" subtitle="Search live patient records by patient ID, name, or phone number">
      <div className="search-box dashboard-patient-search"><i className="bi bi-search"/><input className="form-control" aria-label="Search patients" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter patient ID, name, or phone number"/></div>
      {states.patients ? <Empty title="Patient search unavailable" description={states.patients}/> : query.trim() ? matches.length ? <div className="dashboard-search-results">{matches.map((patient) => <div className="dashboard-patient-result" key={patient.patient_id}><div><strong>{patient.full_name || 'Name unavailable'}</strong><div className="small text-secondary">Patient #{patient.patient_id}{patient.phone_number ? ` · ${patient.phone_number}` : ''}</div></div><div className="d-flex gap-2 flex-wrap"><Link className="btn btn-sm btn-outline-primary" to="/app/receptionist/appointments" state={{ patientId: patient.patient_id }}>Appointment</Link><Link className="btn btn-sm btn-outline-primary" to="/app/receptionist/tokens" state={{ patientId: patient.patient_id, patientName: patient.full_name, isNewRegistration: false }}>Token Queue</Link></div></div>)}</div> : <p className="small text-secondary mb-0">No matching patients.</p> : <p className="small text-secondary mb-0">Start typing to search the patient list.</p>}
    </Card>

    <Card title="Quick actions" subtitle="Open a receptionist workflow">
      <div className="row g-3">{[
        ['Register Patient', 'person-plus', '/app/receptionist/patient-register'],
        ['Appointments', 'calendar-check', '/app/receptionist/appointments'],
        ['Billing', 'receipt', '/app/receptionist/billing'],
        ['Token Queue', 'ticket-perforated', '/app/receptionist/tokens'],
      ].map(([label, icon, to]) => <div className="col-6 col-xl-3" key={label}><Link className="dashboard-action" to={to}><i className={`bi bi-${icon}`}/><span>{label}</span><i className="bi bi-arrow-right ms-auto"/></Link></div>)}</div>
    </Card>

    <Card title="Today's appointments" subtitle="Appointments scheduled for the clinic's local date, ordered by time">
      {states.appointments ? <Empty title="Appointments unavailable" description={states.appointments}/> : <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Token</th><th>Action</th></tr></thead><tbody>
        {todayAppointments.length ? todayAppointments.map((appointment) => {
          const patient = patientsById.get(String(appointment.patient));
          const token = tokensByAppointment.get(String(appointment.appointment_id));
          return <tr key={appointment.appointment_id}><td>{String(appointment.appointment_time_slot || '—').slice(0, 5)}</td><td>{patient?.full_name || `Patient #${appointment.patient}`}</td><td>Doctor #{appointment.doctor}</td><td><Status value={appointment.status}/></td><td>{token?.token_number ?? '—'}</td><td>—</td></tr>;
        }) : <tr><td colSpan="6"><Empty title="No appointments today" description="There are no appointments scheduled for today."/></td></tr>}
      </tbody></table></div>}
    </Card>
  </div>;
}

export default function Dashboard({ user }) {
  if (user.role === 'RECEPTIONIST') return <ReceptionistDashboard/>;
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const admin = user.role === 'ADMIN';
  const doctor = user.role === 'DOCTOR';
  useEffect(() => {
    let live = true;
    Promise.all((routes[user.role] || []).map(async ([key, url]) => {
      try { return [key, unwrap((await api.get(url)).data)]; }
      catch (error) { return [key, { error: errorMessage(error) }]; }
    })).then((items) => { if (live) { setData(Object.fromEntries(items)); setLoading(false); } });
    return () => { live = false; };
  }, [user.role]);
  const chart = admin && Array.isArray(data.Patients) ? Object.entries(data.Patients.reduce((counts, patient) => { const date = String(patient.created_at || '').slice(0, 10) || 'Unknown'; counts[date] = (counts[date] || 0) + 1; return counts; }, {})).sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, count]) => ({ date: date === 'Unknown' ? date : date.slice(5), patients: count })) : [];
  const queue = Array.isArray(data.Queue) ? data.Queue : [];
  return <div className="workspace-content">{loading && <div className="loading-line"><span/> Loading live records from Django…</div>}{!loading && <>
    <div className="row g-3 mb-3">{(routes[user.role] || []).map(([key]) => <div className="col-6 col-xl-3" key={key}><Stat label={key} value={Array.isArray(data[key]) ? data[key].length : 'Unavailable'} icon="database"/></div>)}</div>
    {admin && <Card title="Patient registrations" subtitle="Daily counts derived from the patient records returned by Django">{chart.length ? <div style={{height: 250}}><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="patients" name="Registrations"/></BarChart></ResponsiveContainer></div> : <Empty title="No registration history" description="No patient records were returned, or the API does not include registration timestamps."/>}</Card>}
    {doctor && <Card title="Your waiting queue" subtitle="Only queue records returned for the authenticated doctor"><TableQueue rows={queue.filter((item) => item.status === 'WAITING')}/><p className="small text-secondary mb-0">Use Token Queue to review patients and call the next eligible token.</p></Card>}
  </>}</div>;
}
function TableQueue({ rows }) { return <div className="table-responsive"><table className="table cms-table"><thead><tr><th>Token</th><th>Patient</th><th>Session</th><th>Status</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.token_id}><td>{row.token_number}</td><td>{row.patient_name || `Patient #${row.patient}`}</td><td>{row.session}</td><td><Status value={row.status}/></td></tr>) : <tr><td colSpan="4"><Empty title="No waiting patients"/></td></tr>}</tbody></table></div>; }