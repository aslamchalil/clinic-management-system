import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, Stat } from '../components/UI';
import { errorMessage } from '../services/api';
import { getLabDashboard, searchLabPatients } from '../services/labService';
import { submitStockRequest } from '../services/adminService';

const actions = [
  ['Requests', 'clipboard2-pulse', '/app/lab/requests'],
  ['Billing', 'receipt', '/app/lab/billing'],
  ['Processing', 'hourglass-split', '/app/lab/processing'],
  ['Results', 'file-earmark-medical', '/app/lab/results'],
  ['Request Stock', 'boxes', '/app/lab/stock-requests'],
];

export default function LabDashboard() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [stockForm, setStockForm] = useState({ item_name: '', requested_quantity: '1', reason: '' });
  const [stockBusy, setStockBusy] = useState(false);
  const [stockNotice, setStockNotice] = useState('');
  const [stockError, setStockError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setCounts(await getLabDashboard()); }
    catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const search = async (event) => {
    event.preventDefault(); setSearching(true); setSearchError(''); setPatients([]); setHasSearched(true);
    if (!query.trim()) { setSearchError('Enter a patient ID, name, or phone number.'); setSearching(false); return; }
    try { setPatients(await searchLabPatients(query.trim())); }
    catch (err) { setSearchError(errorMessage(err)); }
    finally { setSearching(false); }
  };

  const requestStock = async (event) => {
    event.preventDefault(); setStockBusy(true); setStockError(''); setStockNotice('');
    try {
      await submitStockRequest({ item_name: stockForm.item_name.trim(), requested_quantity: Number(stockForm.requested_quantity), reason: stockForm.reason.trim() });
      setStockNotice('Lab supply request submitted.');
      setStockForm({ item_name: '', requested_quantity: '1', reason: '' });
    } catch (err) { setStockError(errorMessage(err)); }
    finally { setStockBusy(false); }
  };

  return <div className="lab-page">
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="row g-3 mb-3">
      {[
        ['Requested', 'clipboard2-pulse', 'requested'], ['Billed', 'receipt', 'billed'],
        ['Paid', 'cash-coin', 'paid'], ['Completed', 'check2-circle', 'completed'],
      ].map(([label, icon, key]) => <div className="col-6 col-xl-3" key={key}><Stat label={label} icon={icon} value={loading ? '—' : counts?.[key] ?? 0}/></div>)}
    </div>
    {loading && <div className="loading-line"><span/>Loading Lab overview…</div>}
    <Card title="Quick actions" subtitle="Open a Lab workflow">
      <div className="lab-quick-actions">{actions.map(([label, icon, to]) => <Link className="lab-quick-action" to={to} key={to}><span><i className={`bi bi-${icon}`}/></span><b>{label}</b><i className="bi bi-arrow-right ms-auto"/></Link>)}</div>
    </Card>
    <Card title="Patient search" subtitle="Find a patient by ID, name, or phone and open their Lab bills.">
      <form className="lab-search-form" onSubmit={search}>
        <input className="form-control" value={query} onChange={(event) => { setQuery(event.target.value); setPatients([]); setHasSearched(false); setSearchError(''); }} placeholder="Patient ID, name, or phone number" aria-label="Search patients"/>
        <button className="btn btn-primary" disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
      </form>
      {searchError && <div className="alert alert-warning mt-3 mb-0" role="alert">{searchError}</div>}
      {!searching && hasSearched && query.trim() && !searchError && patients.length === 0 && <Empty title="No patients found" description="Try another ID, name, or phone number."/>}
      {patients.length > 0 && <div className="table-responsive mt-3"><table className="table cms-table align-middle"><thead><tr><th>Patient</th><th>ID</th><th>Phone</th><th>Action</th></tr></thead><tbody>{patients.map((patient) => <tr key={patient.patient_id}><td>{patient.full_name}</td><td>#{patient.patient_id}</td><td>{patient.phone_number || '—'}</td><td><Link className="btn btn-sm btn-outline-primary" to={`/app/lab/billing?patientId=${patient.patient_id}`}>View Bills</Link></td></tr>)}</tbody></table></div>}
    </Card>
    <Card title="Request Lab supplies" subtitle="Submit a supply name, quantity, and reason for Admin review.">
      {stockError && <div className="alert alert-danger" role="alert">{stockError}</div>}
      {stockNotice && <div className="alert alert-success" role="status">{stockNotice}</div>}
      <form className="row g-3" onSubmit={requestStock}>
        <div className="col-md-5"><label className="form-label" htmlFor="lab-supply-name">Supply name</label><input id="lab-supply-name" className="form-control" required maxLength="200" value={stockForm.item_name} onChange={(event) => setStockForm({ ...stockForm, item_name: event.target.value })}/></div>
        <div className="col-md-3"><label className="form-label" htmlFor="lab-supply-quantity">Quantity</label><input id="lab-supply-quantity" className="form-control" type="number" min="1" step="1" required value={stockForm.requested_quantity} onChange={(event) => setStockForm({ ...stockForm, requested_quantity: event.target.value })}/></div>
        <div className="col-md-9"><label className="form-label" htmlFor="lab-supply-reason">Reason</label><textarea id="lab-supply-reason" className="form-control" rows="2" required value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })}/></div>
        <div className="col-12"><button className="btn btn-primary" disabled={stockBusy}>{stockBusy ? 'Submitting…' : 'Submit supply request'}</button><Link className="btn btn-link" to="/app/lab/stock-requests">View stock requests</Link></div>
      </form>
    </Card>
  </div>;
}
