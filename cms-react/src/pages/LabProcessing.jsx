import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { enterLabResult, listLabRequests, startLabProcessing } from '../services/labService';

const blank = { result_value: '', unit: '', reference_range: '', report: '' };

export default function LabProcessing() {
  const [requests, setRequests] = useState([]); const [forms, setForms] = useState({});
  const [loading, setLoading] = useState(true); const [busyId, setBusyId] = useState(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = async () => { setLoading(true); setError(''); try { setRequests(await listLabRequests()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const start = async (row) => { setBusyId(row.lab_request_id); setError(''); setNotice(''); try { await startLabProcessing(row.lab_request_id); setNotice(`Request #${row.lab_request_id} is now in progress.`); await load(); } catch (err) { setError(errorMessage(err)); } finally { setBusyId(null); } };
  const submit = async (event, row) => { event.preventDefault(); const form = forms[row.lab_request_id] || blank; if (!form.result_value.trim()) { setError('Result value is required.'); return; } setBusyId(row.lab_request_id); setError(''); setNotice(''); try { await enterLabResult(row.lab_request_id, form); setNotice(`Result saved for request #${row.lab_request_id}; the request is complete.`); await load(); } catch (err) { setError(errorMessage(err)); } finally { setBusyId(null); } };
  const rows = requests.filter((row) => ['PAID', 'IN_PROGRESS'].includes(row.status));
  return <div className="lab-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    <Card title="Lab processing" subtitle="Start only paid requests, then record and save the result." action={<button className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>Refresh</button>}>
      {loading ? <div className="loading-line"><span/>Loading eligible requests…</div> : rows.length === 0 ? <Empty title="Nothing to process" description="Paid requests ready for work will appear here."/> : <div className="lab-processing-list">{rows.map((row) => <article className="lab-processing-item" key={row.lab_request_id}>
        <div className="lab-processing-heading"><div><strong>Request #{row.lab_request_id}</strong><div className="small text-secondary">{row.patient_name} · Patient #{row.patient_id} · {row.test_name}</div></div><Status value={row.status}/></div>
        {row.status === 'PAID' ? <button className="btn btn-primary btn-sm" disabled={busyId === row.lab_request_id} onClick={() => start(row)}>{busyId === row.lab_request_id ? 'Starting…' : 'Start Processing'}</button> : <form className="row g-2" onSubmit={(event) => submit(event, row)}>
          <div className="col-md-5"><label className="form-label" htmlFor={`result-${row.lab_request_id}`}>Result value</label><input id={`result-${row.lab_request_id}`} className="form-control" required maxLength="200" value={(forms[row.lab_request_id] || blank).result_value} onChange={(event) => setForms({ ...forms, [row.lab_request_id]: { ...(forms[row.lab_request_id] || blank), result_value: event.target.value } })}/></div>
          <div className="col-md-3"><label className="form-label" htmlFor={`unit-${row.lab_request_id}`}>Unit</label><input id={`unit-${row.lab_request_id}`} className="form-control" maxLength="50" value={(forms[row.lab_request_id] || blank).unit} onChange={(event) => setForms({ ...forms, [row.lab_request_id]: { ...(forms[row.lab_request_id] || blank), unit: event.target.value } })}/></div>
          <div className="col-md-4"><label className="form-label" htmlFor={`range-${row.lab_request_id}`}>Reference range</label><input id={`range-${row.lab_request_id}`} className="form-control" maxLength="100" value={(forms[row.lab_request_id] || blank).reference_range} onChange={(event) => setForms({ ...forms, [row.lab_request_id]: { ...(forms[row.lab_request_id] || blank), reference_range: event.target.value } })}/></div>
          <div className="col-12"><label className="form-label" htmlFor={`report-${row.lab_request_id}`}>Report / notes</label><textarea id={`report-${row.lab_request_id}`} className="form-control" rows="2" value={(forms[row.lab_request_id] || blank).report} onChange={(event) => setForms({ ...forms, [row.lab_request_id]: { ...(forms[row.lab_request_id] || blank), report: event.target.value } })}/></div>
          <div className="col-12"><button className="btn btn-success btn-sm" disabled={busyId === row.lab_request_id}>{busyId === row.lab_request_id ? 'Saving…' : 'Save Result'}</button></div>
        </form>}
      </article>)}</div>}
      <div className="mt-3"><Link to="/app/lab/results">View completed results</Link></div>
    </Card>
  </div>;
}
