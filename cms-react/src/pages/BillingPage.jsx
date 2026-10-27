import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../services/api';
import { Card, Empty, Search, Status } from '../components/UI';
import {
  listBills,
  listPatients,
  payRegistrationBill,
} from '../services/receptionistService';

const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI'];

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function resourceId(value) {
  return value && typeof value === 'object'
    ? value.patient_id ?? value.doc_id ?? value.id
    : value;
}

export default function BillingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const workflow = location.state?.workflow || {};
  const [bills, setBills] = useState([]);
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [billsLoaded, setBillsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [patientError, setPatientError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [selectedBill, setSelectedBill] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paying, setPaying] = useState(false);
  const [paidBill, setPaidBill] = useState(null);
  const paymentSubmitLock = useRef(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    setPatientError('');
    const [billResult, patientResult] = await Promise.allSettled([
      listBills(),
      listPatients(),
    ]);
    if (billResult.status === 'fulfilled') {
      setBills(billResult.value);
      setBillsLoaded(true);
    } else {
      setError(errorMessage(billResult.reason));
    }
    if (patientResult.status === 'fulfilled') {
      setPatients(patientResult.value);
    } else {
      setPatientError(errorMessage(patientResult.reason));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [String(patient.patient_id), patient])),
    [patients]
  );
  const visibleBills = useMemo(() => {
    const term = query.trim().toLowerCase();
    const relevantBills = workflow.patientId && workflow.doctorId
      ? bills.filter((bill) =>
        Number(resourceId(bill.patient)) === Number(workflow.patientId) &&
        Number(resourceId(bill.doctor)) === Number(workflow.doctorId)
      )
      : bills;
    if (!term) return relevantBills;
    return relevantBills.filter((bill) => {
      const patient = patientMap.get(String(resourceId(bill.patient)));
      return JSON.stringify({ ...bill, patient_name: patient?.full_name || '' })
        .toLowerCase()
        .includes(term);
    });
  }, [bills, patientMap, query, workflow.doctorId, workflow.patientId]);

  const recordPayment = async (event) => {
    event.preventDefault();
    if (!selectedBill || paymentSubmitLock.current) return;
    paymentSubmitLock.current = true;
    setPaying(true);
    setError('');
    setNotice('');
    try {
      const result = await payRegistrationBill(selectedBill.bill_id, paymentMethod);
      if (result?.payment_status !== 'PAID') {
        throw new Error('Django did not confirm the bill as PAID.');
      }
      setPaidBill({ ...selectedBill, ...result });
      setSelectedBill(null);
      setNotice(`Payment for bill #${selectedBill.bill_id} is confirmed by Django.`);
      await loadData();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      paymentSubmitLock.current = false;
      setPaying(false);
    }
  };

  const continueToToken = (bill) => {
    const sessionContext = workflow.session || '';
    navigate('/app/receptionist/tokens', {
      state: {
        workflow: {
          billId: bill.bill_id,
          patientId: resourceId(bill.patient),
          doctorId: resourceId(bill.doctor),
          session: sessionContext,
          ...(workflow.appointmentId ? { appointmentId: workflow.appointmentId } : {}),
          ...(workflow.appointmentDate ? { appointmentDate: workflow.appointmentDate } : {}),
        },
      },
    });
  };

  const returnToTokenDetails = () => {
    navigate('/app/receptionist/tokens', {
      state: {
        workflow: {
          ...workflow,
          patientId: workflow.patientId || '',
          patientName: workflow.patientName || '',
          doctorId: workflow.doctorId || '',
        },
      },
    });
  };

  const workflowBill = bills.find((bill) => Number(bill.bill_id) === Number(paidBill?.bill_id));
  const workflowPaymentConfirmed = paidBill?.payment_status === 'PAID';

  return (
    <div className="workspace-content">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {patientError && (
        <div className="alert alert-warning" role="alert">
          Patient names could not be resolved from the patient API: {patientError}
        </div>
      )}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {workflow.patientId && (
        <div className="alert alert-info">
          Token workflow for patient {workflow.patientName || `#${workflow.patientId}`}
          {workflow.doctorId ? ` · Doctor #${workflow.doctorId}` : ''}
          {workflow.session ? ` · ${workflow.session} session` : ''}.
        </div>
      )}
      {workflow.patientId && workflow.doctorId && !loading && (
        <div className={`alert ${visibleBills.length ? 'alert-success' : 'alert-warning'}`} role="status">
          {visibleBills.length
            ? `Found ${visibleBills.length} existing bill(s) for this patient and doctor. No duplicate bill will be created.`
            : 'No existing bill matches this patient and doctor. Creating a bill is blocked because the required fee sources are not available through the backend APIs.'}
        </div>
      )}
      {workflowPaymentConfirmed && (
        <div className="alert alert-success d-flex flex-wrap justify-content-between align-items-center gap-2" role="status">
          <span>Bill #{paidBill.bill_id} payment is confirmed as PAID by Django.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => continueToToken(workflowBill || paidBill)}>
            Generate Token
          </button>
        </div>
      )}

      <Card
        title="Registration and consultation billing"
        subtitle="Only backend-confirmed bill data is shown or used for payment"
        action={workflow.patientId && (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={returnToTokenDetails}>
            Back to token details
          </button>
        )}
      >
        {workflow.patientId && (
          <div className="alert alert-info">
            Billing workflow for {workflow.patientName || `patient #${workflow.patientId}`}
            {workflow.doctorId ? ` · Doctor #${workflow.doctorId}` : ''}.
            {workflow.isNewRegistration
              ? ' This patient was just registered, but the backend provides no registration-fee policy/source.'
              : ' This is an existing patient, so no additional registration fee should be charged.'}
          </div>
        )}
        <div className="alert alert-warning" role="alert">
          Bill creation is unavailable from this workflow because the backend requires a
          consultation_fee in the bill request but exposes no receptionist-accessible doctor
          directory/fee lookup. The backend also has no registration-fee policy endpoint.
          Existing bills below remain available for payment and token processing.
        </div>
      </Card>

      <Card title="Registration bills" subtitle="Bill amounts, status and date are returned by Django">
        <div className="cms-toolbar">
          <Search value={query} onChange={setQuery} placeholder="Search bills, patients..." />
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadData} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1" />Refresh
          </button>
        </div>
        {loading ? (
          <div className="loading-line"><span />Loading bills…</div>
        ) : !billsLoaded ? (
          <Empty title="Bills unavailable" description={error || 'The bill API did not return records.'} />
        ) : bills.length === 0 ? (
          <Empty title="No bills found" description="The backend returned no registration bills." />
        ) : workflow.patientId && workflow.doctorId && visibleBills.length === 0 ? (
          <Empty
            title="No matching bill"
            description="No bill for the selected patient and doctor was returned by Django. This page will not create a bill using guessed or manually entered fees."
          />
        ) : visibleBills.length === 0 ? (
          <Empty title="No matching bills" description="No bills match your search." />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead>
                <tr>
                  <th>Bill ID</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Registration fee</th>
                  <th>Consultation fee</th>
                  <th>Total</th>
                  <th>Bill date</th>
                  <th>Status</th>
                  <th>Payment method</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleBills.map((bill) => {
                  const patientId = resourceId(bill.patient);
                  const patient = patientMap.get(String(patientId));
                  const confirmed = paidBill?.bill_id === bill.bill_id && paidBill.payment_status === 'PAID';
                  const status = confirmed ? 'PAID' : bill.payment_status;
                  return (
                    <tr key={bill.bill_id}>
                      <td>{bill.bill_id}</td>
                      <td>{patient ? `${patient.full_name} (#${patient.patient_id})` : `Patient #${patientId}`}</td>
                      <td>Doctor #{resourceId(bill.doctor)}</td>
                      <td>{bill.registration_fee}</td>
                      <td>{bill.consultation_fee}</td>
                      <td>{bill.total_amount}</td>
                      <td>{formatDateTime(bill.bill_date)}</td>
                      <td><Status value={status} /></td>
                      <td>{confirmed ? paidBill.payment_method : bill.payment_method || '—'}</td>
                      <td>
                        {status === 'PENDING' ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              setSelectedBill(bill);
                              setPaymentMethod('CASH');
                            }}
                          >
                            Pay
                          </button>
                        ) : status === 'PAID' ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => continueToToken(bill)}
                                >
                                  Generate Token
                                </button>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedBill && (
        <div className="modal show d-block" tabIndex="-1" role="dialog" aria-modal="true" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <form onSubmit={recordPayment}>
                <div className="modal-header">
                  <h5 className="modal-title">Pay bill #{selectedBill.bill_id}</h5>
                  <button type="button" className="btn-close" onClick={() => setSelectedBill(null)} disabled={paying} aria-label="Close" />
                </div>
                <div className="modal-body">
                  <p>Total due: <strong>{selectedBill.total_amount}</strong></p>
                  <label className="form-label" htmlFor="payment-method">Payment method</label>
                  <select
                    id="payment-method"
                    className="form-select"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setSelectedBill(null)} disabled={paying}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={paying}>
                    {paying ? 'Paying…' : 'Confirm payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}