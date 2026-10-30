import React, { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { listAdminMedicines, listAdminStockRequests, listMyStockRequests, reviewStockRequest, submitStockRequest } from '../services/adminService';

export default function StockRequestsPage({ user }) {
  const isAdmin = user?.role === 'ADMIN';
  const isPharmacy = user?.role === 'PHARMACIST';
  const [requests, setRequests] = useState([]);
  const [reviewForms, setReviewForms] = useState({});
  const [medicines, setMedicines] = useState([]);
  const [form, setForm] = useState({ medicine: '', item_name: '', requested_quantity: '1', reason: '' });
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [rows, catalog] = await Promise.all([
        isAdmin ? listAdminStockRequests() : listMyStockRequests(),
        isAdmin || !isPharmacy ? Promise.resolve([]) : listAdminMedicines(),
      ]);
      setRequests(rows);
      setReviewForms((current) => Object.fromEntries(rows.map((row) => [row.request_id, current[row.request_id] || { approved_quantity: String(row.requested_quantity), review_note: '' }])));
      if (!isAdmin && isPharmacy) setMedicines(catalog.filter((item) => item.is_active));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [isAdmin, isPharmacy]);

  const visible = useMemo(() => statusFilter === 'ALL' ? requests : requests.filter((item) => item.status === statusFilter), [requests, statusFilter]);

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    const payload = { requested_quantity: Number(form.requested_quantity), reason: form.reason.trim() };
    if (isPharmacy) payload.medicine = Number(form.medicine);
    else payload.item_name = form.item_name.trim();
    try {
      await submitStockRequest(payload);
      setNotice('Stock request submitted. Approval does not change inventory; stock is updated only through the existing receiving workflow.');
      setForm({ medicine: '', item_name: '', requested_quantity: '1', reason: '' }); await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const review = async (request, decision) => {
    const action = decision.toLowerCase();
    setBusyId(request.request_id); setError(''); setNotice('');
    try {
      const form = reviewForms[request.request_id] || {};
      if (decision === 'APPROVED' && (!Number.isInteger(Number(form.approved_quantity)) || Number(form.approved_quantity) < 1)) {
        throw new Error('Approved quantity must be a positive whole number.');
      }
      await reviewStockRequest(request.request_id, decision, form.review_note || '', decision === 'APPROVED' ? form.approved_quantity : undefined);
      setNotice(request.department === 'PHARMACY' && decision === 'APPROVED'
        ? `Request #${request.request_id} approved for ${form.approved_quantity}. Pharmacy stock was increased.`
        : request.department === 'LABORATORY' && decision === 'APPROVED'
          ? `Request #${request.request_id} approved. Lab inventory is not changed because no Lab inventory model exists.`
          : `Request #${request.request_id} ${action}.`);
      await load();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyId(null); }
  };

  return <div className="admin-phase-b">
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {!isAdmin && <Card title="Submit a stock request" subtitle={isPharmacy ? 'Choose an existing medicine from the Pharmacy catalogue.' : 'Enter the laboratory supply name. Lab supplies are not stored as medicines.'}>
      <form className="row g-3" onSubmit={submit}>
        {isPharmacy ? <div className="col-md-6"><label className="form-label" htmlFor="request-medicine">Medicine</label><select id="request-medicine" className="form-select" required value={form.medicine} onChange={(e) => setForm({ ...form, medicine: e.target.value })}><option value="">Select medicine</option>{medicines.map((medicine) => <option key={medicine.medicine_id} value={medicine.medicine_id}>{medicine.name}</option>)}</select></div> : <div className="col-md-6"><label className="form-label" htmlFor="request-item">Supply name</label><input id="request-item" className="form-control" required maxLength={200} value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} /></div>}
        <div className="col-md-3"><label className="form-label" htmlFor="request-quantity">Requested quantity</label><input id="request-quantity" type="number" min="1" step="1" className="form-control" required value={form.requested_quantity} onChange={(e) => setForm({ ...form, requested_quantity: e.target.value })} /></div>
        <div className="col-md-9"><label className="form-label" htmlFor="request-reason">Reason</label><textarea id="request-reason" className="form-control" rows="2" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        <div className="col-12"><button className="btn btn-primary" disabled={saving || (isPharmacy && medicines.length === 0)}>{saving ? 'Submitting…' : 'Submit request'}</button></div>
      </form>
    </Card>}
    <Card title={isAdmin ? 'Stock requests' : 'My stock requests'} subtitle={isAdmin ? 'Pharmacy approval adds the approved quantity to its stock record. Lab approval records the decision without changing medicine stock.' : 'Live request status and review details from Django.'}>
      <div className="cms-toolbar"><div className="d-flex align-items-center gap-2"><label className="form-label mb-0" htmlFor="stock-request-filter">Status</label><select id="stock-request-filter" className="form-select form-select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></div><button className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading || saving || !!busyId}><i className="bi bi-arrow-clockwise me-1"/>Refresh</button></div>
      {loading ? <div className="loading-line"><span/> Loading requests…</div> : visible.length === 0 ? <Empty title="No stock requests" description={error ? 'The request API could not be loaded.' : 'There are no requests in this status.'} /> :
        <div className="table-responsive"><table className="table align-middle cms-table"><thead><tr><th>Request</th><th>Department</th><th>Item</th><th>Requested qty</th><th>Approved qty</th><th>Reason</th><th>Status</th><th>Requested by</th><th>Requested</th><th>Reviewed by</th>{isAdmin && <th>Review</th>}</tr></thead><tbody>
          {visible.map((request) => {
            const reviewForm = reviewForms[request.request_id] || { approved_quantity: String(request.requested_quantity), review_note: '' };
            return <tr key={request.request_id}><td>#{request.request_id}</td><td>{request.department === 'PHARMACY' ? 'Pharmacy' : 'Laboratory'}</td><td>{request.item_name}</td><td>{request.requested_quantity}</td><td>{request.approved_quantity ?? '—'}</td><td>{request.reason}</td><td><Status value={request.status}/></td><td>{request.requested_by_name || `Staff #${request.requested_by}`}</td><td>{request.created_at ? new Date(request.created_at).toLocaleString() : '—'}</td><td>{request.reviewed_by_name || '—'}{request.review_note && <div className="small text-secondary">{request.review_note}</div>}</td>{isAdmin && <td className="text-nowrap">{request.status === 'PENDING' ? <><label className="small" htmlFor={`approve-qty-${request.request_id}`}>Final quantity</label><input id={`approve-qty-${request.request_id}`} className="form-control form-control-sm mb-1" type="number" min="1" step="1" value={reviewForm.approved_quantity} disabled={busyId === request.request_id} onChange={(event) => setReviewForms({ ...reviewForms, [request.request_id]: { ...reviewForm, approved_quantity: event.target.value } })}/><input className="form-control form-control-sm mb-1" aria-label={`Review note for request ${request.request_id}`} placeholder="Optional review note" value={reviewForm.review_note} disabled={busyId === request.request_id} onChange={(event) => setReviewForms({ ...reviewForms, [request.request_id]: { ...reviewForm, review_note: event.target.value } })}/><button type="button" className="btn btn-sm btn-success me-1" disabled={busyId === request.request_id} onClick={() => review(request, 'APPROVED')}>{busyId === request.request_id ? 'Saving…' : 'Approve'}</button><button type="button" className="btn btn-sm btn-outline-danger" disabled={busyId === request.request_id} onClick={() => review(request, 'REJECTED')}>Reject</button></> : 'Reviewed'}</td>}</tr>;
          })}
        </tbody></table></div>}
    </Card>
  </div>;
}
