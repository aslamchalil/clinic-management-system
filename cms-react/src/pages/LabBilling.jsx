import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, Empty, Status } from '../components/UI';
import { errorMessage } from '../services/api';
import { createLabBill, listLabBills, listLabRequests, payLabBill } from '../services/labService';

export default function LabBilling() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const patientFilter = params.get('patientId') || '';
  const requestFilter = params.get('requestId') || '';
  const [requests, setRequests] = useState([]); const [bills, setBills] = useState([]);
  const [selected, setSelected] = useState([]); const [paymentMethods, setPaymentMethods] = useState({});
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const load = async () => { setLoading(true); setError(''); try { const [requestRows, billRows] = await Promise.all([listLabRequests(), listLabBills(patientFilter)]); setRequests(requestRows); setBills(billRows); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [patientFilter]);
  useEffect(() => { setSelected([]); }, [patientFilter, requestFilter]);
  const eligible = useMemo(() => requests.filter((row) => row.status === 'REQUESTED' && row.is_active && (!patientFilter || String(row.patient_id) === String(patientFilter))), [requests, patientFilter]);
  useEffect(() => { if (requestFilter && eligible.some((row) => String(row.lab_request_id) === String(requestFilter))) setSelected([Number(requestFilter)]); }, [requestFilter, eligible]);
  const selectedRows = eligible.filter((row) => selected.includes(row.lab_request_id));
  const selectedPatient = selectedRows[0]?.patient_id;
  const toggle = (row) => setSelected((current) => current.includes(row.lab_request_id) ? current.filter((id) => id !== row.lab_request_id) : (!selectedPatient || String(selectedPatient) === String(row.patient_id) ? [...current, row.lab_request_id] : current));
  const create = async () => { if (!selected.length) return; setBusy(true); setError(''); setNotice(''); try { const bill = await createLabBill(selected); setNotice(`Bill #${bill.lab_bill_id} created for ${bill.patient_name}.`); setSelected([]); await load(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } };
  const pay = async (bill) => { setBusy(true); setError(''); setNotice(''); try { await payLabBill(bill.lab_bill_id, paymentMethods[bill.lab_bill_id] || 'CASH'); setNotice(`Bill #${bill.lab_bill_id} paid successfully.`); await load(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } };
  const printBill = (bill) => {
    const popup = window.open('', '_blank', 'width=760,height=700');
    if (!popup) { setError('Allow pop-ups to print this bill.'); return; }
    const doc = popup.document; doc.title = `Lab bill ${bill.lab_bill_id}`;
    const heading = doc.createElement('h1'); heading.textContent = 'Laboratory Bill'; doc.body.appendChild(heading);
    [`Bill #${bill.lab_bill_id}`, `Patient: ${bill.patient_name} (#${bill.patient})`, `Date: ${new Date(bill.bill_date).toLocaleString()}`, `Payment: ${bill.payment_status}${bill.payment_method ? ` · ${bill.payment_method}` : ''}`].forEach((detail) => { const p = doc.createElement('p'); p.textContent = detail; doc.body.appendChild(p); });
    const table = doc.createElement('table'); table.style.width = '100%'; table.border = '1';
    const header = table.insertRow(); ['Test', 'Quantity', 'Unit price', 'Amount'].forEach((label) => { const cell = doc.createElement('th'); cell.textContent = label; header.appendChild(cell); });
    (bill.items || []).forEach((item) => { const row = table.insertRow(); [item.test_name, item.quantity, `₹${item.unit_price}`, `₹${item.line_amount}`].forEach((value) => { const cell = row.insertCell(); cell.textContent = String(value); }); });
    doc.body.appendChild(table); const total = doc.createElement('h2'); total.textContent = `Total: ₹${bill.total_amount}`; doc.body.appendChild(total);
    popup.focus(); popup.print();
  };
  return <div className="lab-page">{error && <div className="alert alert-danger" role="alert">{error}</div>}{notice && <div className="alert alert-success" role="status">{notice}</div>}
    <Card title="Create a Lab bill" subtitle="Select one or more requested tests for the same patient. Django calculates and snapshots the total.">
      {loading ? <div className="loading-line"><span/>Loading billable requests…</div> : eligible.length === 0 ? <Empty title="No billable requests" description="Only active, unbilled Doctor requests can be added to a bill."/> : <>
        <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Select</th><th>Request</th><th>Patient</th><th>Test</th><th>Priority</th></tr></thead><tbody>{eligible.map((row) => <tr key={row.lab_request_id}><td><input type="checkbox" aria-label={`Select request ${row.lab_request_id}`} checked={selected.includes(row.lab_request_id)} disabled={!!selectedPatient && String(selectedPatient) !== String(row.patient_id)} onChange={() => toggle(row)}/></td><td>#{row.lab_request_id}</td><td>{row.patient_name} · #{row.patient_id}</td><td>{row.test_name}</td><td>{row.priority}</td></tr>)}</tbody></table></div>
        <button className="btn btn-primary" disabled={busy || selected.length === 0} onClick={create}>{busy ? 'Saving…' : `Create bill${selected.length ? ` (${selected.length} tests)` : ''}`}</button>
      </>}
    </Card>
    <Card title={patientFilter ? `Bills for patient #${patientFilter}` : 'Lab bills'} subtitle="Payment is recorded by Django; a repeated or invalid payment is rejected by the backend." action={<button className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>Refresh</button>}>
      {loading ? <div className="loading-line"><span/>Loading bills…</div> : bills.length === 0 ? <Empty title="No Lab bills" description="Bills appear here after a requested test is billed."/> : <div className="table-responsive"><table className="table cms-table align-middle"><thead><tr><th>Bill</th><th>Patient</th><th>Date</th><th>Tests</th><th>Total</th><th>Status</th><th>Payment</th><th>Receipt</th></tr></thead><tbody>{bills.map((bill) => <tr key={bill.lab_bill_id}><td>#{bill.lab_bill_id}</td><td>{bill.patient_name} · #{bill.patient}</td><td>{new Date(bill.bill_date).toLocaleString()}</td><td>{(bill.items || []).map((item) => <div key={item.lab_bill_item_id}>{item.test_name} · ₹{item.line_amount}</div>)}</td><td>₹{bill.total_amount}</td><td><Status value={bill.payment_status}/></td><td>{bill.payment_status === 'PENDING' ? <div className="lab-pay-controls"><select className="form-select form-select-sm" aria-label={`Payment method for bill ${bill.lab_bill_id}`} value={paymentMethods[bill.lab_bill_id] || 'CASH'} onChange={(event) => setPaymentMethods({ ...paymentMethods, [bill.lab_bill_id]: event.target.value })}><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Credit card</option></select><button className="btn btn-sm btn-success" disabled={busy} onClick={() => pay(bill)}>{busy ? 'Saving…' : 'Record payment'}</button></div> : bill.payment_method || '—'}</td><td><button className="btn btn-sm btn-outline-secondary" onClick={() => printBill(bill)}>Print / Save PDF</button></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
