import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, Empty, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { listLabResults } from '../services/labService';

export default function LabResults() {
  const location = useLocation(); const requestId = new URLSearchParams(location.search).get('requestId') || '';
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setRows(await listLabResults()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => rows.filter((row) => !requestId || String(row.lab_request) === String(requestId)), [rows, requestId]);
  const printReport = (row) => {
    const popup = window.open('', '_blank', 'width=760,height=700');
    if (!popup) { setError('Allow pop-ups to print this report.'); return; }
    const doc = popup.document; doc.title = `Lab result ${row.result_id}`;
    const heading = doc.createElement('h1'); heading.textContent = 'Laboratory Result'; doc.body.appendChild(heading);
    const details = [
      `Patient: ${row.patient_name || `#${row.patient_id}`}`, `Test: ${row.test_name}`, `Request: #${row.lab_request}`,
      `Result: ${row.result_value} ${row.unit || ''}`, `Reference range: ${row.reference_range || '—'}`,
      `Date: ${row.result_date ? new Date(row.result_date).toLocaleString() : '—'}`, `Report: ${row.report || '—'}`,
    ];
    details.forEach((detail) => { const p = doc.createElement('p'); p.textContent = detail; doc.body.appendChild(p); });
    popup.focus(); popup.print();
  };
  return <div className="lab-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}
    <Card title="Lab results" subtitle="Persisted results for completed laboratory requests." action={<button className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>Refresh</button>}>
      {loading ? <div className="loading-line"><span/>Loading results…</div> : visible.length === 0 ? <Empty title="No results found" description="Completed tests and their saved reports will appear here."/> : <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Patient</th><th>Test</th><th>Request</th><th>Result</th><th>Reference range</th><th>Date</th><th>Report</th><th>Action</th></tr></thead><tbody>{visible.map((row) => <tr key={row.result_id}><td>{row.patient_name || `Patient #${row.patient_id}`}</td><td>{row.test_name}</td><td>#{row.lab_request}</td><td>{row.result_value} {row.unit}</td><td>{row.reference_range || '—'}</td><td>{row.result_date ? new Date(row.result_date).toLocaleString() : '—'}</td><td>{row.report || '—'}</td><td><button className="btn btn-sm btn-outline-secondary" onClick={() => printReport(row)}>Print / Save PDF</button></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
