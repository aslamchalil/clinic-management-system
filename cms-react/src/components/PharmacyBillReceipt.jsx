import React from 'react';

export default function PharmacyBillReceipt({ bill, onClose }) {
  if (!bill) return null;
  return <div className="pharmacy-receipt-backdrop" role="presentation" onClick={onClose}>
    <section className="pharmacy-receipt" role="dialog" aria-modal="true" aria-labelledby="pharmacy-receipt-title" onClick={(event) => event.stopPropagation()}>
      <div className="pharmacy-receipt-actions"><button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Close</button><button className="btn btn-primary btn-sm" onClick={() => window.print()}>Print / Save PDF</button></div>
      <h2 id="pharmacy-receipt-title">Pharmacy receipt</h2>
      <p>Persisted bill #{bill.pharmacy_bill_id} · {bill.bill_date ? new Date(bill.bill_date).toLocaleString() : '—'}</p>
      <p><strong>Patient:</strong> {bill.patient_name || `Patient #${bill.patient}`} · <strong>Status:</strong> {bill.payment_status} · <strong>Method:</strong> {bill.payment_method || '—'}</p>
      <table className="table"><thead><tr><th>Medicine</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{(bill.items || []).map((item) => <tr key={item.item_bill_id}><td>{item.medicine_name}</td><td>{item.quantity_dispensed}</td><td>₹{item.unit_selling_price}</td><td>₹{item.line_amount}</td></tr>)}</tbody><tfoot><tr><th colSpan="3">Total</th><th>₹{bill.total_amount}</th></tr></tfoot></table>
    </section>
  </div>;
}
