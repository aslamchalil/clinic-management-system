import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DoctorAppointmentTable from '../components/DoctorAppointmentTable';
import DoctorTokenTable from '../components/DoctorTokenTable';
import { Card, Empty, Search, Stat, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { callDoctorToken, getDoctorDashboard, searchDoctorPatients } from '../services/doctorService';

function formatTime(value) {
  if (!value) return '—';
  return String(value).slice(0, 5);
}

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await getDoctorDashboard()); }
    catch (err) { setError(errorMessage(err)); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setPatients([]); setSearchError(''); return undefined; }
    let live = true;
    setSearching(true); setSearchError('');
    const timer = setTimeout(async () => {
      try { const results = await searchDoctorPatients(term); if (live) setPatients(results); }
      catch (err) { if (live) { setPatients([]); setSearchError(errorMessage(err)); } }
      finally { if (live) setSearching(false); }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  const call = async (token) => {
    setBusyId(token.token_id); setError(''); setNotice('');
    try {
      const result = await callDoctorToken(token.token_id);
      setNotice(result.detail || `Patient for token #${token.token_number} called.`);
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyId(null); }
  };
  const openToken = (token) => navigate('/app/doctor/consultation', { state: { tokenId: token.token_id, consultationId: token.consultation_id } });
  const counts = data?.counts || {};

  return <div className="doctor-page">
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    <div className="d-flex justify-content-end mb-2"><button className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}><i className="bi bi-arrow-clockwise me-1"/>Refresh dashboard</button></div>
    {loading ? <div className="loading-line"><span/> Loading your clinic dashboard…</div> : error ? <Empty title="Dashboard unavailable" description={error}/> : <>
      <div className="row g-3 mb-3">
        <div className="col-6 col-xl-3"><Stat icon="people" label="Waiting" value={counts.waiting ?? 0} tone="warning"/></div>
        <div className="col-6 col-xl-3"><Stat icon="megaphone" label="Called" value={counts.called ?? 0} tone="primary"/></div>
        <div className="col-6 col-xl-3"><Stat icon="clipboard2-check" label="Consultations done" value={counts.consultations_done ?? 0} tone="success"/></div>
        <div className="col-6 col-xl-3"><Stat icon="calendar-check" label="Booked appointments" value={counts.booked_appointments ?? 0} tone="info"/></div>
      </div>
      <Card title="Doctor sessions" subtitle={`Clinic date: ${data?.date || '—'}`}>
        {data?.sessions?.length ? <div className="d-flex flex-wrap gap-2">{data.sessions.map((session) => <div className="doctor-session-chip" key={session.session}><strong>{session.session}</strong><span>{formatTime(session.start_time)}–{formatTime(session.end_time)}</span><Status value={session.is_current ? 'ACTIVE NOW' : 'SCHEDULED'}/></div>)}</div> : <Empty title="No active sessions configured" description="The backend returned no active Doctor sessions."/>}
      </Card>
      <Card title="Patient search" subtitle="Search patients previously linked to your tokens or consultations.">
        <Search value={query} onChange={setQuery} placeholder="Search patient ID, name, or phone number…" />
        {searchError && <div className="alert alert-danger mt-3" role="alert">{searchError}</div>}
        {query.trim() && (searching ? <div className="loading-line mt-2"><span/> Searching patients…</div> : patients.length ? <div className="doctor-search-results">{patients.map((patient) => <div className="doctor-search-result" key={patient.patient_id}><div><strong>{patient.full_name}</strong><small>Patient #{patient.patient_id} · {patient.phone_number || 'No phone recorded'}</small></div><Link className="btn btn-sm btn-outline-primary" to="/app/doctor/history" state={{ patientId: patient.patient_id }}>View consultation history</Link></div>)}</div> : <Empty title="No matching patients" description="No linked patient records match this search." />)}
      </Card>
      <Card title="Today’s appointments" subtitle="Only appointments assigned to you for the clinic-local date.">
        <DoctorAppointmentTable rows={data?.appointments || []} onOpen={openToken}/>
      </Card>
      <Card title="Today’s token queue" subtitle="Call a waiting patient or continue a consultation that has already started.">
        <DoctorTokenTable rows={data?.queue || []} busyId={busyId} onCall={call} onOpen={openToken}/>
      </Card>
      <Card title="Recent consultations" subtitle="Your latest persisted consultation records.">
        {data?.recent_consultations?.length ? <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Date</th><th>Patient</th><th>Token</th><th>Diagnosis</th><th>Action</th></tr></thead><tbody>{data.recent_consultations.map((item) => <tr key={item.consult_id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.patient_name}</td><td>#{item.token_number}</td><td>{item.diagnosis || '—'}</td><td><button className="btn btn-sm btn-outline-primary" onClick={() => navigate('/app/doctor/consultation', { state: { consultationId: item.consult_id } })}>View report</button></td></tr>)}</tbody></table></div> : <Empty title="No recent consultations" description="Completed or in-progress consultation records will appear here."/>}
      </Card>
    </>}
  </div>;
}
