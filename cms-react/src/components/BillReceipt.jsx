import React from 'react';
import '../styles/billing.css';

function formatBillDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function BillReceipt({ bill, patient, doctor, onClose }) {
  if (!bill) return null;
  const patientId = typeof bill.patient === 'object'
    ? bill.patient.patient_id
    : bill.patient;
  const doctorId = typeof bill.doctor === 'object'
    ? bill.doctor.doc_id ?? bill.doctor.doctor_id
    : bill.doctor;

  return (
    <div className="bill-receipt-backdrop" role="presentation">
      <section
        className="bill-receipt-print"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-receipt-title"
      >
        <header className="bill-receipt-heading">
          <div>
            <h2 id="bill-receipt-title">Clinic payment receipt</h2>
            <p>Persisted bill details</p>
          </div>
          <div className="bill-receipt-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              Print / Save PDF
            </button>
          </div>
        </header>
        <dl className="bill-receipt-grid">
          <div><dt>Bill</dt><dd>#{bill.bill_id}</dd></div>
          <div><dt>Date</dt><dd>{formatBillDate(bill.bill_date)}</dd></div>
          <div><dt>Patient</dt><dd>{patient?.full_name || `Patient #${patientId}`}</dd></div>
          <div><dt>Doctor</dt><dd>{doctor?.display_name || `Doctor #${doctorId}`}</dd></div>
          <div><dt>Registration fee</dt><dd>₹{bill.registration_fee}</dd></div>
          <div><dt>Consultation fee</dt><dd>₹{bill.consultation_fee}</dd></div>
          <div className="bill-receipt-total"><dt>Total</dt><dd>₹{bill.total_amount}</dd></div>
          <div><dt>Payment status</dt><dd>{bill.payment_status}</dd></div>
          <div><dt>Payment method</dt><dd>{bill.payment_method || '—'}</dd></div>
        </dl>
      </section>
    </div>
  );
}
