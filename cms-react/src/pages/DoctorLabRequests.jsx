import React, { useEffect, useState } from 'react';
import { Card, Empty, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { listDoctorLabRequests } from '../services/doctorService';

export default function DoctorLabRequests() {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setRows(await listDoctorLabRequests()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  return <div className="doctor-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}<Card title="Today’s lab requests" subtitle="Requests made from your consultations, filtered by the clinic-local date."><div className="d-flex justify-content-end mb-2"><button className="btn btn-sm btn-outline-primary" disabled={loading} onClick={load}>Refresh</button></div>{loading ? <div className="loading-line"><span/> Loading Lab requests…</div> : error ? <Empty title="Lab requests unavailable" description={error}/> : rows.length ? <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Request</th><th>Patient</th><th>Consultation</th><th>Test</th><th>Ordered</th><th>Priority</th><th>Status</th></tr></thead><tbody>{rows.map((item) => <tr key={item.lab_request_id}><td>#{item.lab_request_id}</td><td>{item.patient_name || `Patient #${item.patient_id}`}</td><td>#{item.consultation}</td><td>{item.test_name}</td><td>{new Date(item.order_date).toLocaleTimeString()}</td><td><Status value={item.priority}/></td><td><Status value={item.status}/></td></tr>)}</tbody></table></div> : <Empty title="No lab requests today" description="Lab requests created during today’s consultations will appear here."/>}</Card></div>;
}
