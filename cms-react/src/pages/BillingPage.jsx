import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../services/api';
import { Card, Empty, Search, Status } from '../components/UI';
import DoctorSelect from '../components/DoctorSelect';
import BillReceipt from '../components/BillReceipt';
import { localDate as clinicDate } from '../services/dateUtils';
import {
  clearWalkInVisitKey,
  createRegistrationBill,
  getOrCreateWalkInVisitKey,
  listBills,
  listDoctors,
  listPatients,
  listTokens,
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
    ? value.patient_id ?? value.doc_id ?? value.doctor_id ?? value.id
    : value;
}

export default function BillingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const workflow = location.state?.workflow || {};
  const visitKeyRef = useRef(workflow.visitKey
    ? { patientId: String(workflow.patientId || ''), key: workflow.visitKey }
    : null);
  const payLocks = useRef(new Set());
  const [bills, setBills] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(workflow.patientId ? String(workflow.patientId) : '');
  const [selectedDoctorId, setSelectedDoctorId] = useState(workflow.doctorId ? String(workflow.doctorId) : '');
  const [paymentMethods, setPaymentMethods] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [billsLoaded, setBillsLoaded] = useState(false);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [error, setError] = useState('');
  const [patientError, setPatientError] = useState('');
  const [doctorError, setDoctorError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [payingBillId, setPayingBillId] = useState(null);
  const [creatingBill, setCreatingBill] = useState(false);
  const [createdBillId, setCreatedBillId] = useState(null);
  const [receiptBill, setReceiptBill] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    setPatientError('');
    setDoctorError('');
    const [billResult, patientResult, doctorResult, tokenResult] = await Promise.allSettled([
      listBills(),
      listPatients(),
      listDoctors(),
      listTokens({ tokenDate: 'all' }),
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
    if (doctorResult.status === 'fulfilled') setDoctors(doctorResult.value);
    else setDoctorError(errorMessage(doctorResult.reason));
    if (tokenResult.status === 'fulfilled') {
      setTokens(tokenResult.value);
      setTokensLoaded(true);
      setTokenError('');
    } else {
      setTokensLoaded(false);
      setTokenError(errorMessage(tokenResult.reason));
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
  const doctorMap = useMemo(
    () => new Map(doctors.map((doctor) => [String(doctor.doc_id), doctor])),
    [doctors]
  );
  const tokenByBill = useMemo(
    () => new Map(tokens.map((token) => [String(resourceId(token.bill)), token])),
    [tokens]
  );
  const visibleBills = useMemo(() => {
    const term = query.trim().toLowerCase();
    const relevantBills = workflow.billId
      ? bills.filter((bill) => Number(bill.bill_id) === Number(workflow.billId))
      : workflow.patientId && workflow.doctorId
      ? bills.filter((bill) =>
        Number(resourceId(bill.patient)) === Number(workflow.patientId) &&
        Number(resourceId(bill.doctor)) === Number(workflow.doctorId)
      )
      : bills;
    if (!term) return relevantBills;
    return relevantBills.filter((bill) => {
      const patient = patientMap.get(String(resourceId(bill.patient)));
      const doctor = doctorMap.get(String(resourceId(bill.doctor)));
      return JSON.stringify({ ...bill, patient_name: patient?.full_name || '', doctor_name: doctor?.display_name || '' })
        .toLowerCase()
        .includes(term);
    });
  }, [bills, doctorMap, patientMap, query, workflow.billId, workflow.doctorId, workflow.patientId]);

  const createBill = async (event) => {
    event.preventDefault();
    if (creatingBill) return;
    const patientId = workflow.patientId || selectedPatientId;
    const doctorId = workflow.doctorId || selectedDoctorId;
    const patient = patientMap.get(String(patientId));
    if (!patient?.is_active) return setError('Select an active patient returned by Django.');
    if (!doctorMap.has(String(doctorId))) return setError('Select an active doctor returned by Django.');
    if (patient.registration_fee_status === 'REVIEW') {
      return setError('This patient needs a manual registration-fee eligibility review before billing.');
    }
    setCreatingBill(true);
    setError('');
    setNotice('');
    try {
      const visitKey = workflow.appointmentId ? null : workflow.visitKey || (
        visitKeyRef.current?.patientId === String(patientId)
          ? visitKeyRef.current.key
          : getOrCreateWalkInVisitKey(patientId)
      );
      if (visitKey) visitKeyRef.current = { patientId: String(patientId), key: visitKey };
      const payload = {
        patient: Number(patientId),
        doctor: Number(doctorId),
        ...(workflow.appointmentId
          ? { appointment: Number(workflow.appointmentId) }
          : { visit_key: visitKey }),
      };
      const bill = await createRegistrationBill(payload);
      if (!bill?.bill_id) throw new Error('Django did not return a persisted bill.');
      if (visitKey) clearWalkInVisitKey(patientId);
      setCreatedBillId(bill.bill_id);
      setBills((current) => [bill, ...current.filter((item) => item.bill_id !== bill.bill_id)]);
      setNotice(`Bill #${bill.bill_id} is ${bill.payment_status?.toLowerCase() || 'pending'} payment. Amounts were calculated by Django.`);
      await loadData();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setCreatingBill(false);
    }
  };

  const recordPayment = async (bill) => {
    if (payLocks.current.has(bill.bill_id)) return;
    payLocks.current.add(bill.bill_id);
    setPayingBillId(bill.bill_id);
    setError('');
    try {
      const method = paymentMethods[bill.bill_id] || 'CASH';
      const result = await payRegistrationBill(bill.bill_id, method);
      if (result?.payment_status !== 'PAID') {
        throw new Error('Django did not confirm the bill as PAID.');
      }
      setBills((current) => current.map((item) => item.bill_id === bill.bill_id
        ? { ...item, ...result }
        : item));
      setNotice(`Payment for bill #${bill.bill_id} is confirmed by Django.`);
      await loadData();
    } catch (requestError) {
      const persisted = requestError?.response?.data;
      if (persisted?.payment_status === 'PAID') {
        setBills((current) => current.map((item) => item.bill_id === bill.bill_id
          ? { ...item, ...persisted }
          : item));
        setError('');
        setNotice(
          persisted.payment_method === (paymentMethods[bill.bill_id] || 'CASH')
            ? `Bill #${bill.bill_id} was already paid. Its persisted payment is confirmed.`
            : `Bill #${bill.bill_id} was already paid using ${persisted.payment_method || 'the recorded method'}. The payment method was not changed.`
        );
        await loadData();
      } else {
        setError(errorMessage(requestError));
      }
    } finally {
      payLocks.current.delete(bill.bill_id);
      setPayingBillId(null);
    }
  };

  const continueToToken = (bill) => {
    navigate('/app/receptionist/tokens', {
      state: {
        workflow: {
          billId: bill.bill_id,
          patientId: resourceId(bill.patient),
          doctorId: resourceId(bill.doctor),
          session: workflow.session || '',
          tokenDate: workflow.tokenDate || workflow.appointmentDate || clinicDate(),
          appointmentId: resourceId(bill.appointment) || workflow.appointmentId || '',
          visitKey: bill.visit_key || workflow.visitKey,
          followUp: workflow.followUp || 'WALK_IN',
        },
      },
    });
  };

  const workflowAlreadyHasBill = bills.some((bill) => workflow.billId
    ? Number(bill.bill_id) === Number(workflow.billId)
    : workflow.appointmentId
      ? Number(resourceId(bill.appointment)) === Number(workflow.appointmentId)
      : workflow.visitKey ? bill.visit_key === workflow.visitKey : false);
  const showBillForm = !workflow.billId && !workflowAlreadyHasBill && !createdBillId;

  return (
    <div className="workspace-content">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {patientError && (
        <div className="alert alert-warning" role="alert">
          Patient names could not be resolved from the patient API: {patientError}
        </div>
      )}
      {doctorError && <div className="alert alert-warning" role="alert">Doctor list unavailable: {doctorError}</div>}
      {tokenError && <div className="alert alert-warning" role="alert">Token status could not be checked. Refresh before generating a token: {tokenError}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {workflow.patientId && (
        <div className="alert alert-info">
          Token workflow for patient {workflow.patientName || `#${workflow.patientId}`}
          {workflow.doctorId ? ` · Doctor #${workflow.doctorId}` : ''}
          {workflow.session ? ` · ${workflow.session} session` : ''}.
        </div>
      )}
      {showBillForm && (
        <Card title="Create registration and consultation bill" subtitle="Django reads doctor fees and registration eligibility from persisted records">
          <form onSubmit={createBill} noValidate>
            <div className="alert alert-info">Registration is ₹50 once, on the first assessed bill. Repeat visits have no registration fee. There is no token fee.</div>
            <div className="row g-3 align-items-end">
              <div className="col-md-6">
                <label className="form-label" htmlFor="billing-patient">Patient</label>
                {workflow.patientId ? (
                  <input id="billing-patient" className="form-control" value={workflow.patientName || `Patient #${workflow.patientId}`} readOnly />
                ) : (
                  <select id="billing-patient" className="form-select" value={selectedPatientId} onChange={(event) => setSelectedPatientId(event.target.value)} required>
                    <option value="">Select a patient</option>
                    {patients.filter((patient) => patient.is_active).map((patient) => (
                      <option key={patient.patient_id} value={patient.patient_id}>{patient.full_name} (#{patient.patient_id})</option>
                    ))}
                  </select>
                )}
                {patientMap.get(String(workflow.patientId || selectedPatientId))?.registration_fee_status === 'REVIEW' && (
                  <div className="form-text text-danger">Manual review is required before billing.</div>
                )}
              </div>
              <div className="col-md-6">
                <DoctorSelect id="billing-doctor" value={workflow.doctorId || selectedDoctorId} doctors={doctors} loading={loading} error={doctorError} onChange={setSelectedDoctorId} disabled={Boolean(workflow.doctorId)} />
              </div>
              <div className="col-12 d-flex justify-content-end">
                <button type="submit" className="btn btn-primary" disabled={creatingBill || loading || !patients.length || !doctors.length || patientMap.get(String(workflow.patientId || selectedPatientId))?.registration_fee_status === 'REVIEW'}>
                  {creatingBill ? 'Creating bill…' : 'Create pending bill'}
                </button>
              </div>
            </div>
          </form>
        </Card>
      )}
      {workflowAlreadyHasBill && !workflow.billId && <div className="alert alert-info" role="status">A persisted bill already exists for this visit and is shown below.</div>}
      {workflow.patientId && workflow.doctorId && (
        <div className="alert alert-info">Billing workflow for {workflow.patientName || `patient #${workflow.patientId}`} · Doctor #{workflow.doctorId}.</div>
      )}

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
            description="No bill for this workflow was returned by Django. Use the form above to create a visit-linked bill."
          />
        ) : visibleBills.length === 0 ? (
          <Empty title="No matching bills" description="No bills match your search." />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Registration</th>
                  <th>Consultation</th>
                  <th>Total</th>
                  <th>Bill date</th>
                  <th>Payment</th>
                  <th>Token / next step</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {visibleBills.map((bill) => {
                  const patientId = resourceId(bill.patient);
                  const patient = patientMap.get(String(patientId));
                  const doctor = doctorMap.get(String(resourceId(bill.doctor)));
                  const token = tokenByBill.get(String(bill.bill_id));
                  return (
                    <tr key={bill.bill_id}>
                      <td>#{bill.bill_id}</td>
                      <td>{patient ? `${patient.full_name} (#${patient.patient_id})` : `Patient #${patientId}`}</td>
                      <td>{doctor?.display_name || `Doctor #${resourceId(bill.doctor)}`}</td>
                      <td>₹{bill.registration_fee}</td>
                      <td>₹{bill.consultation_fee}</td>
                      <td>₹{bill.total_amount}</td>
                      <td>{formatDateTime(bill.bill_date)}</td>
                      <td>
                        {bill.payment_status === 'PENDING' ? (
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <select className="form-select form-select-sm" aria-label={`Payment method for bill ${bill.bill_id}`} value={paymentMethods[bill.bill_id] || 'CASH'} onChange={(event) => setPaymentMethods((current) => ({ ...current, [bill.bill_id]: event.target.value }))}>
                              {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                            </select>
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => recordPayment(bill)} disabled={payingBillId === bill.bill_id}>
                              {payingBillId === bill.bill_id ? 'Paying…' : 'Pay'}
                            </button>
                          </div>
                        ) : <><Status value={bill.payment_status} />{bill.payment_method ? ` · ${bill.payment_method}` : ''}</>}
                      </td>
                      <td>
                        {token ? (
                          <span>Token #{token.token_number}</span>
                        ) : bill.payment_status === 'PAID' ? (
                          tokensLoaded
                            ? <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => continueToToken(bill)}>Generate Token</button>
                            : <span className="text-secondary">Checking token…</span>
                        ) : '—'}
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setReceiptBill(bill)}>View / Print</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {receiptBill && (
        <BillReceipt
          bill={receiptBill}
          patient={patientMap.get(String(resourceId(receiptBill.patient)))}
          doctor={doctorMap.get(String(resourceId(receiptBill.doctor)))}
          onClose={() => setReceiptBill(null)}
        />
      )}
    </div>
  );
}
