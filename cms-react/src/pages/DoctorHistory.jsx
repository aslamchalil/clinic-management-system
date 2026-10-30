import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, Empty, Search, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { listConsultationHistory } from '../services/doctorService';

export default function DoctorHistory() {
  const location = useLocation(); const navigate = useNavigate();
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  const patientId = location.state?.patientId;
  const load = async () => { setLoading(true); setError(''); try { setRows(await listConsultationHistory()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => rows.filter((row) => {
    if (patientId && Number(row.patient) !== Number(patientId)) return false;
    return `${row.consult_id} ${row.patient_name} ${row.patient} ${row.diagnosis} ${row.token_number}`.toLowerCase().includes(query.toLowerCase());
  }), [rows, query, patientId]);
  return <div className="doctor-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}<Card title="Consultation history" subtitle={patientId ? `Read-only records for Patient #${patientId}, limited to your consultations.` : 'Read-only history of consultations belonging to your Doctor profile.'}><div className="cms-toolbar"><Search value={query} onChange={setQuery} placeholder="Search patient or diagnosis…"/><button className="btn btn-sm btn-outline-primary" disabled={loading} onClick={load}>Refresh</button></div>{loading ? <div className="loading-line"><span/> Loading consultation history…</div> : error ? <Empty title="History unavailable" description={error}/> : visible.length ? <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Date</th><th>Patient</th><th>Token</th><th>Diagnosis</th><th>Token status</th><th>Action</th></tr></thead><tbody>{visible.map((item) => <tr key={item.consult_id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.patient_name} · #{item.patient}</td><td>#{item.token_number} · {item.session}</td><td>{item.diagnosis || '—'}</td><td><Status value={item.token_status}/></td><td><button className="btn btn-sm btn-outline-primary" onClick={() => navigate(`/app/doctor/consultation?consultationId=${item.consult_id}`)}>View / Print</button></td></tr>)}</tbody></table></div> : <Empty title="No consultations found" description="Your Doctor-owned consultation records will appear here."/>}</Card></div>;
}
