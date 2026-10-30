import React, { useEffect, useState } from 'react';
import { Card, Empty } from '../components/UI';
import { errorMessage } from '../services/api';
import { listMonthlyBills } from '../services/adminService';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
const groups = [
  ['reception', 'Reception'], ['pharmacy', 'Pharmacy'], ['lab', 'Lab'], ['general_total', 'General Total'],
];
const pendingGroups = [['reception', 'Reception'], ['pharmacy', 'Pharmacy'], ['lab', 'Lab']];

export default function MonthlyBills() {
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (value = month) => {
    const [year, monthNumber] = value.split('-').map(Number);
    if (!year || !monthNumber) return;
    setLoading(true); setError('');
    try { setData(await listMonthlyBills(year, monthNumber)); }
    catch (err) { setError(errorMessage(err)); setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const applyFilter = (event) => { event.preventDefault(); load(month); };

  return <div className="admin-phase-b">
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <Card title="Monthly bills" subtitle="Billed amounts, confirmed collections, and pending balances from persisted department bills.">
      <form className="d-flex flex-wrap align-items-end gap-2 mb-3" onSubmit={applyFilter}>
        <div><label className="form-label" htmlFor="billing-month">Month</label><input id="billing-month" className="form-control" type="month" required value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Loading…' : 'Apply filter'}</button>
      </form>
      {loading && <div className="loading-line"><span/> Loading monthly totals…</div>}
      {!loading && data && <div className="row g-3">
        {groups.map(([key, label]) => <div className="col-12 col-sm-6 col-xl-3" key={key}><div className="admin-billing-summary">
          <div className="admin-billing-summary-title">{label}</div>
          <div className="admin-billing-stat"><span>Billed</span><strong>{money(data.summary[key]?.billed)}</strong></div>
          <div className="admin-billing-stat"><span>Collected</span><strong>{money(data.summary[key]?.collected)}</strong></div>
          <div className="admin-billing-stat"><span>Outstanding</span><strong>{money(data.summary[key]?.outstanding)}</strong></div>
        </div></div>)}
      </div>}
      {!loading && data && <p className="small text-secondary mt-3 mb-0">Cancelled and refunded bills are excluded from the billed, collected, and outstanding totals. General Total sums each department’s distinct bill records once.</p>}
    </Card>
    {pendingGroups.map(([key, label]) => <Card key={key} title={`${label} pending bills`} subtitle={`Pending bills in ${data ? `${String(data.month).padStart(2, '0')}/${data.year}` : 'the selected month'}`}>
      {loading ? <div className="loading-line"><span/> Loading pending bills…</div> : !data ? <Empty title="Bills unavailable" description="Monthly bill records could not be loaded." /> : (data.pending[key] || []).length === 0 ? <Empty title="No pending bills" description={`There are no pending ${label.toLowerCase()} bills for this month.`} /> :
        <div className="table-responsive"><table className="table align-middle cms-table"><thead><tr><th>Bill</th><th>Patient</th><th>Date</th><th>Amount</th><th>Department</th><th>Payment status</th></tr></thead><tbody>
          {data.pending[key].map((bill) => <tr key={`${key}-${bill.bill_id}`}><td>#{bill.bill_id}</td><td>{bill.patient || '—'}</td><td>{new Date(bill.date).toLocaleString()}</td><td>{money(bill.amount)}</td><td>{bill.department}</td><td><span className="badge text-bg-warning">{bill.payment_status}</span></td></tr>)}
        </tbody></table></div>}
    </Card>)}
  </div>;
}
