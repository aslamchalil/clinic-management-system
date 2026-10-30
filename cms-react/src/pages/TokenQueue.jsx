import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../services/api';
import { Card, Empty, Status } from '../components/UI';
import {
  createRegistrationBill,
  clearWalkInVisitKey,
  generateToken,
  getOrCreateWalkInVisitKey,
  listAppointments,
  listBills,
  listDoctors,
  listPatients,
  listTokens,
} from '../services/receptionistService';
import DoctorSelect from '../components/DoctorSelect';
import { maximumTokenDate as maxTokenDate, localDate as todayDate } from '../services/dateUtils';

function relatedId(value) {
  return value && typeof value === 'object'
    ? value.patient_id ?? value.doc_id ?? value.doctor_id ?? value.bill_id ?? value.id
    : value;
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
  const [doctors, setDoctors] = useState([]);
  const [bills, setBills] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [billToken, setBillToken] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [patientId, setPatientId] = useState(initialPatientId ? String(initialPatientId) : '');
  const [doctorId, setDoctorId] = useState(workflow.doctorId ? String(workflow.doctorId) : '');
  const [session, setSession] = useState(workflow.session || '');
  const [tokenDate, setTokenDate] = useState(workflow.tokenDate || workflow.appointmentDate || todayDate());
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [patientError, setPatientError] = useState('');
  const [doctorError, setDoctorError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState(null);
  const generateLock = useRef(false);
  const visitKeyRef = useRef(workflow.visitKey
    ? { patientId: String(initialPatientId), key: workflow.visitKey }
    : null);

  const loadPatientRecords = async () => {
    const records = await listPatients();
    setPatients(records);
    return records;
  };

  const loadData = async () => {
    setLoading(true);
    setDataError('');
    setPatientError('');
    setDoctorError('');
    setError('');
    const [patientResult, doctorResult, tokenResult] = await Promise.allSettled([
      loadPatientRecords(),
      listDoctors().then((records) => {
        setDoctors(records);
        return records;
      }),
      listTokens().then((records) => {
        setTokens(records);
        return records;
      }),
    ]);
    if (patientResult.status === 'rejected') {
      setPatientError(errorMessage(patientResult.reason));
    }
    if (doctorResult.status === 'rejected') {
      setDoctorError(errorMessage(doctorResult.reason));
    }
    if (tokenResult.status === 'rejected') {
      setDataError(errorMessage(tokenResult.reason));
    }
    if (billId) {
      try {
        const [billRecords, billTokens, appointmentRecords] = await Promise.all([
          listBills(), listTokens({ billId }), listAppointments(),
        ]);
        setBills(billRecords);
        setBillToken(billTokens[0] || null);
        setAppointments(appointmentRecords);
      } catch (requestError) {
        setDataError(errorMessage(requestError));
      }
    }
    setLoading(false);
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
  const existingToken = billToken || tokens.find(
    (record) => Number(relatedId(record.bill)) === Number(billId)
  );
  const appointment = appointments.find(
    (record) => Number(record.appointment_id) === Number(workflow.appointmentId || relatedId(bill?.appointment))
  );
  const selectedDoctor = doctors.find(
    (record) => String(record.doc_id) === String(relatedId(bill?.doctor) || doctorId)
  );
  const validSessions = selectedDoctor?.sessions || [];

  useEffect(() => {
    if (appointment?.appointment_date) {
      setTokenDate(appointment.appointment_date);
    }
  }, [appointment?.appointment_date]);

  const returnToBillingWithToken = (token, recovered = false) => {
    navigate('/app/receptionist/billing', {
      replace: true,
      state: {
        workflow: {
          billId: bill?.bill_id || billId,
          patientId: relatedId(bill?.patient) || workflow.patientId,
          doctorId: relatedId(bill?.doctor) || workflow.doctorId,
          appointmentId: relatedId(bill?.appointment) || workflow.appointmentId || '',
          appointmentDate: appointment?.appointment_date || workflow.appointmentDate || '',
          session: token.session,
          tokenDate: token.token_date,
        },
        notice: recovered
          ? `Token #${token.token_number} for bill #${billId} was already confirmed by Django.`
          : `Token #${token.token_number} was generated for bill #${billId}.`,
      },
    });
  };

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

  const createBillAndContinue = async (event) => {
    event.preventDefault();
    if (submitting) return;
    const doctor = doctors.find((record) => String(record.doc_id) === String(doctorId));
    const patient = patientMap.get(String(patientId));
    if (!patient?.is_active) {
      setError('Choose an active patient returned by Django.');
      return;
    }
    if (!doctor) {
      setError('Choose an active doctor returned by Django.');
      return;
    }
    if (!validSessions.includes(session)) {
      setError('Choose an active session returned for this doctor.');
      return;
    }
    if (!isValidDate(tokenDate) || tokenDate < todayDate() || tokenDate > maxTokenDate()) {
      setError(`Choose a valid token date from today through ${maxTokenDate()}.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const visitKey = workflow.visitKey || (
        visitKeyRef.current?.patientId === String(patient.patient_id)
          ? visitKeyRef.current.key
          : getOrCreateWalkInVisitKey(patient.patient_id)
      );
      visitKeyRef.current = { patientId: String(patient.patient_id), key: visitKey };
      const bill = await createRegistrationBill({
        patient: Number(patient.patient_id),
        doctor: Number(doctor.doc_id),
        visit_key: visitKey,
      });
      if (!bill?.bill_id) throw new Error('Django did not return a persisted bill.');
      clearWalkInVisitKey(patient.patient_id);
      navigate('/app/receptionist/billing', {
        state: {
          workflow: {
            billId: bill.bill_id,
            patientId: patient.patient_id,
            patientName: patient.full_name,
            doctorId: doctor.doc_id,
            session,
            tokenDate,
            visitKey,
            isNewRegistration,
            followUp: 'WALK_IN',
          },
          notice: `Bill #${bill.bill_id} is ready. Payment must be confirmed before token generation.`,
        },
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
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
    if (!validSessions.includes(session)) {
      setError('Choose an active session returned for this doctor.');
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
      const [freshBills, existingBillTokens] = await Promise.all([
        listBills(), listTokens({ billId }),
      ]);
      setBills(freshBills);
      setBillToken(existingBillTokens[0] || null);
      const freshBill = freshBills.find((record) => Number(record.bill_id) === Number(billId));
      const tokenAlreadyExists = existingBillTokens.length > 0;
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
        ...((workflow.appointmentId || relatedId(freshBill.appointment))
          ? { appointment: Number(workflow.appointmentId || relatedId(freshBill.appointment)) }
          : {}),
      };
      const result = await generateToken(payload);
      if (result.status !== 201 || !result.data?.token_id) {
        throw new Error('Django did not confirm token creation.');
      }
      setGeneratedToken(result.data);
      setBillToken(result.data);
      setNotice(`Token ${result.data.token_number} was generated by Django.`);
      try {
        const [updatedBills, updatedTokens, updatedBillTokens] = await Promise.all([
          listBills(), listTokens(), listTokens({ billId }),
        ]);
        setBills(updatedBills);
        setTokens(updatedTokens);
        setBillToken(updatedBillTokens[0] || result.data);
        returnToBillingWithToken(updatedBillTokens[0] || result.data);
      } catch (refreshError) {
        setError(`Token was generated, but the queue could not be refreshed: ${errorMessage(refreshError)}`);
      }
    } catch (requestError) {
      try {
        const matchingTokens = await listTokens({ billId });
        const recovered = matchingTokens[0];
        if (recovered) {
          setBillToken(recovered);
          setGeneratedToken(recovered);
          setNotice(`A token for bill #${billId} is already confirmed by Django.`);
          setError('');
          try {
            const [latestBills, latestTokens] = await Promise.all([
              listBills(), listTokens(),
            ]);
            setBills(latestBills);
            setTokens(latestTokens);
          } catch {
            // The bill-specific lookup is authoritative for retry recovery.
          }
          returnToBillingWithToken(recovered, true);
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
            <form onSubmit={createBillAndContinue} noValidate>
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
                  <DoctorSelect
                    id="token-doctor"
                    value={doctorId}
                    doctors={doctors}
                    loading={loading}
                    error={doctorError}
                    onChange={(value) => { setDoctorId(value); setSession(''); }}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-consultation-fee">Consultation fee</label>
                  <input
                    id="token-consultation-fee"
                    className="form-control"
                    value={doctors.find((doctor) => String(doctor.doc_id) === String(doctorId))?.consultation_fee ?? 'Select a doctor'}
                    readOnly
                    disabled
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="token-registration-fee">Registration fee</label>
                  <input
                    id="token-registration-fee"
                    className="form-control"
                    value={selectedPatient?.registration_fee_status === 'ELIGIBLE'
                      ? '₹50 on first bill'
                      : selectedPatient?.registration_fee_status === 'ASSESSED'
                        ? '₹0 — already assessed'
                        : selectedPatient?.registration_fee_status === 'REVIEW'
                          ? 'Manual review required'
                          : isNewRegistration ? '₹50 on first bill' : 'Status unavailable'}
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
                    {validSessions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <div className="form-text">Only this doctor’s active sessions are listed.</div>
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
                Registration fee is charged only once at ₹50.
                
                {selectedPatient?.registration_fee_status === 'REVIEW'
                  ? ' This patient needs manual eligibility review before billing.'
                  : ''}
              </div>
              <div className="d-flex justify-content-end mt-3">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !selectedPatient?.is_active || !doctorId || !validSessions.includes(session) || selectedPatient?.registration_fee_status === 'REVIEW'}
                >
                  {submitting ? 'Creating bill…' : 'Continue to Billing'} <i className="bi bi-arrow-right ms-1" />
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
                  {validSessions.map((option) => <option key={option} value={option}>{option}</option>)}
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
            {bill.payment_status === 'PAID' && !existingToken && !validSessions.length && (
              <div className="alert alert-warning">
                This doctor has no active token session. Ask an administrator to configure a session before generating a token.
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
              <button type="button" className="btn btn-primary" onClick={createToken} disabled={submitting || !validSessions.includes(session)}>
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

      <Card title="Live token queue" subtitle="Today's tokens in the clinic timezone">
        <div className="d-flex justify-content-end mb-3">
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadData} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1" />Refresh queue
          </button>
        </div>
        {!tokens.length ? (
          <Empty title="No tokens for today" description="The live queue is empty. Tokens from other dates remain stored." />
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
