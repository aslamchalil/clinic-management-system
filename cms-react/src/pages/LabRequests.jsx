import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { listLabRequests } from '../services/labService';

export default function LabRequests() {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setRows(await listLabRequests()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  return <div className="lab-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}
    <Card title="Lab requests" subtitle="Doctor-created test requests from active consultations." action={<button className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>Refresh</button>}>
      {loading ? <div className="loading-line"><span/>Loading requests…</div> : rows.length === 0 ? <Empty title="No Lab requests" description="Doctor-created requests will appear here."/> :
        <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Request</th><th>Patient</th><th>Test</th><th>Source</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.lab_request_id}><td>#{row.lab_request_id}</td><td>{row.patient_name || `Patient #${row.patient_id}`}</td><td>{row.test_name}</td><td>Doctor</td><td><Status value={row.priority}/></td><td><Status value={row.status}/></td><td className="text-nowrap">{row.status === 'REQUESTED' && <Link className="btn btn-sm btn-outline-primary me-1" to={`/app/lab/billing?requestId=${row.lab_request_id}`}>Bill</Link>}{['PAID', 'IN_PROGRESS'].includes(row.status) && <Link className="btn btn-sm btn-outline-primary me-1" to="/app/lab/processing">Processing</Link>}{row.status === 'COMPLETED' && <Link className="btn btn-sm btn-outline-secondary" to={`/app/lab/results?requestId=${row.lab_request_id}`}>View result</Link>}{!['REQUESTED', 'PAID', 'IN_PROGRESS', 'COMPLETED'].includes(row.status) && '—'}</td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
