import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../services/api';
import { Card, Empty, Status } from '../components/UI';
import {
  generateToken,
  listBills,
  listPatients,
  listTokens,
} from '../services/receptionistService';

const SESSION_OPTIONS = ['MORNING', 'EVENING'];

function relatedId(value) {
  return value && typeof value === 'object'
    ? value.patient_id ?? value.doctor_id ?? value.bill_id ?? value.id
    : value;
}

function todayDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function maxTokenDate() {
  const date = new Date();
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 2);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

export default function TokenQueue() {
  const location = useLocation();
  const navigate = useNavigate();
  const workflow = location.state?.workflow || {};
  const billId = workflow.billId;
  const initialPatientId = workflow.patientId || location.state?.patientId || '';
  const initialPatientName = workflow.patientName || location.state?.patientName || '';
  const isNewRegistration = Boolean(workflow.isNewRegistration ?? location.state?.isNewRegistration);
  const [patients, setPatients] = useState([]);
  const [bills, setBills] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [patientId, setPatientId] = useState(initialPatientId ? String(initialPatientId) : '');
  const [session, setSession] = useState(workflow.session || '');
  const [tokenDate, setTokenDate] = useState(workflow.tokenDate || workflow.appointmentDate || todayDate());
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [patientError, setPatientError] = useState('');
  const doctorDirectoryError = 'The backend does not expose a doctor directory or a receptionist-accessible doctor-fee endpoint.';
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState(null);
  const generateLock = useRef(false);

  const loadPatientRecords = async () => {
    const records = await listPatients();
    setPatients(records);
    return records;
  };

  const loadBillAndTokenRecords = async () => {
    const [billRecords, tokenRecords] = await Promise.all([listBills(), listTokens()]);
    setBills(billRecords);
    setTokens(tokenRecords);
    return { billRecords, tokenRecords };
  };

  const loadData = async () => {
    setLoading(true);
    setDataError('');
    setPatientError('');
    setError('');
    try {
      if (billId) {
        const [patientResult, transactionResult] = await Promise.allSettled([
          loadPatientRecords(),
          loadBillAndTokenRecords(),
        ]);
        if (patientResult.status === 'rejected') {
          setPatientError(errorMessage(patientResult.reason));
        }
        if (transactionResult.status === 'rejected') {
          throw transactionResult.reason;
        }
      } else {
        await loadPatientRecords();
      }
    } catch (requestError) {
      setDataError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [billId]);

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [String(patient.patient_id), patient])),
    [patients]
  );
  const selectedPatient = patientMap.get(String(patientId));
  const bill = bills.find((record) => Number(record.bill_id) === Number(billId));
  const existingToken = tokens.find(
    (record) => Number(relatedId(record.bill)) === Number(billId)
  );

  const openTokenDetails = () => {
    navigate('/app/receptionist/tokens', {
      state: {
        workflow: {
          patientId: relatedId(bill?.patient) || workflow.patientId,
          doctorId: relatedId(bill?.doctor) || workflow.doctorId,
          session,
          tokenDate,
        },
      },
    });
  };

  const returnToBilling = () => {
    navigate('/app/receptionist/billing', {
      state: {
        workflow: {
          ...workflow,
          patientId: relatedId(bill?.patient) || workflow.patientId,
          doctorId: relatedId(bill?.doctor) || workflow.doctorId,
          session,
          tokenDate,
        },
      },
    });
  };

  const createToken = async () => {
    if (generateLock.current || submitting) return;
    if (!bill) {
      setError(`Bill #${billId} is not present in the current bill API response.`);
      return;
    }
    if (bill.payment_status !== 'PAID') {
      setError('Django must confirm this bill as PAID before token generation.');
      return;
    }
    if (existingToken) {
      setError(`A token already exists for bill #${billId}.`);
      return;
    }
    if (!SESSION_OPTIONS.includes(session)) {
      setError('Choose MORNING or EVENING.');
      return;
    }
    if (!isValidDate(tokenDate)) {
      setError('Choose a valid token date.');
      return;
    }
    if (tokenDate < todayDate()) {
      setError('Token date cannot be in the past.');
      return;
    }
    if (tokenDate > maxTokenDate()) {
      setError('Token date cannot be more than two calendar months from today.');
      return;
    }

    generateLock.current = true;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const [freshBills, freshTokens] = await Promise.all([listBills(), listTokens()]);
      setBills(freshBills);
      setTokens(freshTokens);
      const freshBill = freshBills.find((record) => Number(record.bill_id) === Number(billId));
      const tokenAlreadyExists = freshTokens.some(
        (record) => Number(relatedId(record.bill)) === Number(billId)
      );
      if (!freshBill || freshBill.payment_status !== 'PAID') {
        throw new Error('Django does not currently confirm this bill as PAID.');
      }
      if (tokenAlreadyExists) {
        throw new Error(`A token already exists for bill #${billId}.`);
      }

      const payload = {
        bill_id: Number(billId),
        token_date: tokenDate,
        session,
        ...(workflow.appointmentId ? { appointment: Number(workflow.appointmentId) } : {}),
      };
      const result = await generateToken(payload);
      if (result.status !== 201 || !result.data?.token_id) {
        throw new Error('Django did not confirm token creation.');
      }
      setGeneratedToken(result.data);
      setNotice(`Token ${result.data.token_number} was generated by Django.`);
      try {
        const updatedTokens = await listTokens();
        setTokens(updatedTokens);
      } catch (refreshError) {
        setError(`Token was generated, but the queue could not be refreshed: ${errorMessage(refreshError)}`);
      }
    } catch (requestError) {
      try {
        const latestTokens = await listTokens();
        setTokens(latestTokens);
        const recovered = latestTokens.find(
          (record) => Number(relatedId(record.bill)) === Number(billId)
        );
        if (recovered) {
          setGeneratedToken(recovered);
          setNotice(`A token for bill #${billId} is already confirmed by Django.`);
          setError('');
        } else {
          setError(errorMessage(requestError));
        }
      } catch {
        setError(errorMessage(requestError));
      }
    } finally {
      generateLock.current = false;
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="workspace-content">
        <Card title="Token queue"><div className="loading-line"><span />Loading live clinic records…</div></Card>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="workspace-content">
        <div className="alert alert-danger" role="alert">{dataError}</div>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadData}>
          <i className="bi bi-arrow-clockwise me-1" />Retry
        </button>
      </div>
    );
  }

  if (!billId) {
    return (
      <div className="workspace-content">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <Card title="Token details" subtitle="Select a patient, doctor and session before continuing to billing">
          {!patients.length ? (
            <Empty title="No patients available" description="The patient API returned no records." />
          ) : (
            <form onSubmit={(event) => event.preventDefault()} noValidate>
              <div className="alert alert-info">
                Token generation happens only after a bill is created and Django confirms payment.
                No token is generated on this form.
              </div>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-patient">Patient</label>
                  {initialPatientId ? (
                    <>
                      <input
                        id="token-patient"
                        className="form-control"
                        value={selectedPatient
                          ? `${selectedPatient.full_name} (#${selectedPatient.patient_id})`
                          : initialPatientName
                            ? `${initialPatientName} (#${initialPatientId})`
                            : `Patient #${initialPatientId}`}
                        readOnly
                      />
                      {!selectedPatient && (
                        <div className="form-text text-danger">
                          The selected patient ID was not found in the live patient response.
                        </div>
                      )}
                    </>
                  ) : (
                    <select
                      id="token-patient"
                      className="form-select"
                      value={patientId}
                      onChange={(event) => setPatientId(event.target.value)}
                      required
                    >
                      <option value="">Select a patient</option>
                      {patients.filter((record) => record.is_active).map((record) => (
                        <option key={record.patient_id} value={record.patient_id}>
                          {record.full_name} (#{record.patient_id})
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedPatient && <div className="form-text">Patient ID: {selectedPatient.patient_id}</div>}
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-doctor">Doctor</label>
                  <select id="token-doctor" className="form-select" value="" disabled>
                    <option value="">Doctor list unavailable</option>
                  </select>
                  <div className="form-text text-danger" role="alert">{doctorDirectoryError}</div>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-consultation-fee">Consultation fee</label>
                  <input
                    id="token-consultation-fee"
                    className="form-control"
                    value="Unavailable through current backend API"
                    readOnly
                    disabled
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-registration-fee">Registration fee</label>
                  <input
                    id="token-registration-fee"
                    className="form-control"
                    value={isNewRegistration ? 'Unavailable — no backend fee source' : 'Not applicable — patient already registered'}
                    readOnly
                    disabled
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-session">Session</label>
                  <select
                    id="token-session"
                    className="form-select"
                    value={session}
                    onChange={(event) => setSession(event.target.value)}
                    required
                  >
                    <option value="">Select a session</option>
                    {SESSION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <div className="form-text">The backend checks this against the doctor’s active session.</div>
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-date">Token date</label>
                  <input
                    id="token-date"
                    type="date"
                    className="form-control"
                    min={todayDate()}
                    max={maxTokenDate()}
                    value={tokenDate}
                    onChange={(event) => setTokenDate(event.target.value)}
                    required
                  />
                  <div className="form-text">Choose today through {maxTokenDate()}.</div>
                </div>
              </div>
              <div className="alert alert-warning mt-3 mb-0">
                {isNewRegistration
                  ? 'This patient was just registered. The backend has no registration-fee policy/source, so no registration charge can be safely determined.'
                  : 'This is an already registered patient; no new registration fee should be charged.'}{' '}
                The backend also has no doctor-fee lookup, so this workflow cannot safely continue to bill creation.
              </div>
              <div className="d-flex justify-content-end mt-3">
                <button type="submit" className="btn btn-primary" disabled>
                  Continue to Billing <i className="bi bi-arrow-right ms-1" />
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    );
  }

  const resolvedPatient = patientMap.get(String(relatedId(bill?.patient)));
  const canGenerate = bill?.payment_status === 'PAID' && !existingToken && !generatedToken;

  return (
    <div className="workspace-content">
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {patientError && (
        <div className="alert alert-warning" role="alert">
          Patient names could not be resolved from the patient API: {patientError}
        </div>
      )}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <Card
        title={existingToken || generatedToken ? 'Token details' : 'Generate token'}
        subtitle="Only a Django-confirmed paid bill without an existing token can proceed"
      >
        {!bill ? (
          <Empty
            title="Bill unavailable"
            description={`Bill #${billId} was not found in the live bill response. Refresh the billing page and verify the bill.`}
          />
        ) : (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-4"><strong>Bill:</strong> #{bill.bill_id}</div>
              <div className="col-md-4">
                <strong>Patient:</strong>{' '}
                {resolvedPatient
                  ? `${resolvedPatient.full_name} (#${resolvedPatient.patient_id})`
                  : `Patient #${relatedId(bill.patient)}`}
              </div>
              <div className="col-md-4"><strong>Doctor:</strong> #{relatedId(bill.doctor)}</div>
              <div className="col-md-4"><strong>Payment:</strong> <Status value={bill.payment_status} /></div>
              <div className="col-md-4">
                <label className="form-label mb-1" htmlFor="final-token-session"><strong>Session</strong></label>
                <select
                  id="final-token-session"
                  className="form-select form-select-sm"
                  value={session}
                  onChange={(event) => setSession(event.target.value)}
                  disabled={Boolean(existingToken || generatedToken)}
                >
                  <option value="">Select a session</option>
                  {SESSION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label mb-1" htmlFor="final-token-date"><strong>Token date</strong></label>
                <input
                  id="final-token-date"
                  type="date"
                  className="form-control form-control-sm"
                  min={todayDate()}
                  max={maxTokenDate()}
                  value={tokenDate}
                  onChange={(event) => setTokenDate(event.target.value)}
                  disabled={Boolean(existingToken || generatedToken)}
                />
              </div>
            </div>

            {bill.payment_status !== 'PAID' && (
              <div className="alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span>This bill is {bill.payment_status || 'not confirmed as paid'}. Complete payment in Billing first.</span>
                <button type="button" className="btn btn-sm btn-primary" onClick={returnToBilling}>
                  Return to Billing
                </button>
              </div>
            )}
            {existingToken && !generatedToken && (
              <div className="alert alert-info">
                Django already has a token for this bill; another token cannot be generated.
              </div>
            )}
            {(existingToken || generatedToken) && (
              <div className="alert alert-success" role="status">
                Token <strong>#{(generatedToken || existingToken).token_number}</strong>
                {' · '}Patient {resolvedPatient?.full_name || `#${relatedId((generatedToken || existingToken).patient)}`}
                {' · '}Doctor #{relatedId((generatedToken || existingToken).doctor)}
                {' · '}{(generatedToken || existingToken).session}
                {' · '}Status: {(generatedToken || existingToken).status}
              </div>
            )}

            {canGenerate && (
              <button type="button" className="btn btn-primary" onClick={createToken} disabled={submitting}>
                {submitting ? 'Generating…' : 'Generate Token'}
              </button>
            )}
            {!existingToken && !generatedToken && bill.payment_status === 'PAID' && (
              <button type="button" className="btn btn-outline-secondary ms-2" onClick={openTokenDetails}>
                Back to token details
              </button>
            )}
          </>
        )}
      </Card>

      <Card title="Live token queue" subtitle="Token records returned by Django">
        {!tokens.length ? (
          <Empty title="No tokens found" description="The backend returned no token records." />
        ) : (
          <div className="table-responsive">
            <table className="table cms-table align-middle">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((record) => {
                  const patient = patientMap.get(String(relatedId(record.patient)));
                  return (
                    <tr key={record.token_id}>
                      <td>#{record.token_number}</td>
                      <td>{patient ? `${patient.full_name} (#${patient.patient_id})` : `Patient #${relatedId(record.patient)}`}</td>
                      <td>Doctor #{relatedId(record.doctor)}</td>
                      <td>{record.token_date}</td>
                      <td>{record.session}</td>
                      <td><Status value={record.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}